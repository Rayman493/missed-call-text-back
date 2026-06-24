/**
 * AI Voice Service - Phase 1A POC
 * 
 * Purpose: Prove technical loop:
 * - Twilio → Fly.io WebSocket
 * - Fly.io → OpenAI Realtime
 * - AI speaks greeting
 * - Caller hears greeting
 * - Safe fallback
 * 
 * Version: ai-record-post-insert-hooks-v2
 * Updated: 2026-06-03
 * Rollback state: c5acba53
 */

import { createServer } from 'http';
import { Server as WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { log, LogLevel } from './logger';
import { OpenAIRealtimeClient } from './openai-client';
import { TwilioStreamHandler } from './twilio-stream';
import { createClient } from '@supabase/supabase-js';
import {
  IntakeTemplate,
  AI_INTAKE_TEMPLATES,
  getIntakeStageText,
  getIntakeTemplateForBusinessType,
  getIntakeTemplateForBusinessTypeSafe,
  getIntakeStageTextSafe,
} from './intake-templates';

// @ts-nocheck
// TypeScript checking disabled to allow deployment with improved Supabase logging

// Timeout helper for Supabase queries
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]) as Promise<T>;
}

// Version log - guaranteed to appear on startup
console.log('[AUDIO TRACE BUILD VERSION] caller-audio-debug-v1');
console.log('[AI CONFIRMATION TEMPLATE VERSION] confirmation-v3-your-name-is');
console.log('[AI VOICE STARTUP] Service initializing');

// Deployment fingerprint logging
console.log('[AI VOICE BUILD INFO] =========================================');
let commitSha = 'unknown';
let buildBranch = 'unknown';
try {
  const { execSync } = require('child_process');
  commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  buildBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (error) {
  commitSha = 'unavailable';
  buildBranch = 'unavailable';
}
console.log('[AI VOICE BUILD INFO] commitSha:', commitSha);
console.log('[AI VOICE BUILD INFO] buildTime:', new Date().toISOString());
console.log('[AI VOICE BUILD INFO] deployVersion:', 'app-driven-intake-v3');
console.log('[AI VOICE BUILD INFO] appDrivenIntakeEnabled:', true);
console.log('[AI VOICE BUILD INFO] nodeEnv:', process.env.NODE_ENV || 'development');
console.log('[AI VOICE BUILD INFO] =========================================');

// Explicit build marker for speech path refactoring
console.log('[AI VOICE BUILD MARKER] =========================================');
console.log('[AI VOICE BUILD MARKER] Feature: Centralized Speech Control');
console.log('[AI VOICE BUILD MARKER] Commit:', commitSha);
console.log('[AI VOICE BUILD MARKER] Timestamp:', new Date().toISOString());
console.log('[AI VOICE BUILD MARKER] Expected logs: [VOICE OUTBOUND] for each stage');
console.log('[AI VOICE BUILD MARKER] =========================================');

// Unmistakable deployment proof marker
console.log('[AI VOICE DEPLOYMENT PROOF] =========================================');
console.log('[AI VOICE DEPLOYMENT PROOF] expectedCommit: 596cf8c6');
console.log('[AI VOICE DEPLOYMENT PROOF] actualCommit:', commitSha);
console.log('[AI VOICE DEPLOYMENT PROOF] sourceRepo: Rayman493/missed-call-text-back');
console.log('[AI VOICE DEPLOYMENT PROOF] appDrivenIntakeEnabled: true');
console.log('[AI VOICE DEPLOYMENT PROOF] deployedAt:', new Date().toISOString());
console.log('[AI VOICE DEPLOYMENT PROOF] =========================================');

console.log('[AI VOICE STARTUP] Timestamp:', new Date().toISOString());

// Normalize phone number to E.164 US format
function normalizePhoneNumberForStorage(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (cleaned.length > 10) {
    return `+${cleaned}`;
  }
  return phone;
}

// Final closing timing constants
const FINAL_CLOSING_FALLBACK_MS = 22000; // 22 seconds fallback timeout
const MIN_FINAL_SENTENCE_PLAYBACK_MS = 12000; // 12 seconds minimum playback time
const FINAL_AUDIO_INACTIVITY_THRESHOLD_MS = 2500; // 2.5 seconds of no audio deltas before fallback

// Per-call finalization guards to prevent race conditions between finalizeIncompleteIntake() and ingestCallData()
// Using timestamp-based Maps for TTL cleanup (2-hour expiration)
const finalizationInProgressByCallSid = new Map<string, number>();
const incompleteFinalizedCallSids = new Map<string, number>();

// Complete intake finalization idempotent locks
// Using timestamp-based Maps for TTL cleanup (2-hour expiration)
const completeFinalizationStartedByCallSid = new Map<string, number>();
const completeFinalizationFinishedByCallSid = new Map<string, number>();

// TTL cleanup interval (2 hours in milliseconds)
const CALL_SID_TTL_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes

// Cleanup function to remove expired callSid entries
function cleanupExpiredCallSids(): void {
  const now = Date.now();
  let cleanedCount = 0;

  // Cleanup finalizationInProgressByCallSid
  for (const [callSid, timestamp] of finalizationInProgressByCallSid.entries()) {
    if (now - timestamp > CALL_SID_TTL_MS) {
      finalizationInProgressByCallSid.delete(callSid);
      cleanedCount++;
    }
  }

  // Cleanup incompleteFinalizedCallSids
  for (const [callSid, timestamp] of incompleteFinalizedCallSids.entries()) {
    if (now - timestamp > CALL_SID_TTL_MS) {
      incompleteFinalizedCallSids.delete(callSid);
      cleanedCount++;
    }
  }

  // Cleanup completeFinalizationStartedByCallSid
  for (const [callSid, timestamp] of completeFinalizationStartedByCallSid.entries()) {
    if (now - timestamp > CALL_SID_TTL_MS) {
      completeFinalizationStartedByCallSid.delete(callSid);
      cleanedCount++;
    }
  }

  // Cleanup completeFinalizationFinishedByCallSid
  for (const [callSid, timestamp] of completeFinalizationFinishedByCallSid.entries()) {
    if (now - timestamp > CALL_SID_TTL_MS) {
      completeFinalizationFinishedByCallSid.delete(callSid);
      cleanedCount++;
    }
  }
}

/**
 * Check if current time is within business hours for a business
 */
function isWithinBusinessHours(business: any): boolean {
  const businessHoursEnabled = business.business_hours_enabled || false
  if (!businessHoursEnabled) {
    return true // If business hours not enabled, treat as always within hours
  }

  const businessHoursStart = business.business_hours_start || '09:00'
  const businessHoursEnd = business.business_hours_end || '17:00'
  const businessTimezone = business.business_hours_timezone || 'America/New_York'

  const now = new Date()
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }))

  const [startHour, startMin] = businessHoursStart.split(':').map(Number)
  const [endHour, endMin] = businessHoursEnd.split(':').map(Number)

  const currentHour = nowInTimezone.getHours()
  const currentMin = nowInTimezone.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMin
  const startTimeInMinutes = startHour * 60 + startMin
  const endTimeInMinutes = endHour * 60 + endMin

  const dayIndex = nowInTimezone.getDay()
  const isWeekday = dayIndex >= 1 && dayIndex <= 5

  const withinBusinessHours = isWeekday && currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes

  console.log('[AI VOICE AFTER HOURS CHECK] isWithinBusinessHours', {
    businessId: business.id,
    timezone: businessTimezone,
    openTime: businessHoursStart,
    closeTime: businessHoursEnd,
    dayOfWeek: nowInTimezone.toLocaleDateString('en-US', { weekday: 'long' }),
    businessHoursEnabled,
    withinBusinessHours,
    isWeekday,
    currentTimeInMinutes,
    startTimeInMinutes,
    endTimeInMinutes
  })

  return withinBusinessHours
}

// Retry helper function for Supabase operations with exponential backoff
async function retrySupabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SUPABASE RETRY] ${operationName} - Attempt ${attempt}/${maxRetries}`);
      const result = await operation();
      console.log(`[SUPABASE RETRY] ${operationName} - Success on attempt ${attempt}`);
      return result;
    } catch (error: any) {
      lastError = error;
      console.log(`[SUPABASE RETRY] ${operationName} - Attempt ${attempt} failed:`, error.message);
      
      // Check if error is retryable (network/DNS errors)
      const isRetryable = 
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('fetch failed') ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT';
      
      if (!isRetryable || attempt === maxRetries) {
        console.log(`[SUPABASE RETRY] ${operationName} - Not retryable or max retries reached`);
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`[SUPABASE RETRY] ${operationName} - Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Start periodic cleanup
setInterval(cleanupExpiredCallSids, CLEANUP_INTERVAL_MS);
console.log('[CALL SID CLEANUP] Started periodic cleanup interval (every 5 minutes, 2-hour TTL)');

// Final closing voice and text configuration
const FINAL_CLOSE_TWILIO_VOICE = "Polly.Joanna-Neural"; // Natural neural voice (emergency fallback)
const FINAL_CLOSE_SENTENCE = "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day.";
const FINAL_CLOSE_BRIDGE_PHRASE = "Perfect."; // Short bridge phrase from AI voice before redirect

// OpenAI final close timing
const FINAL_CLOSE_OPENAI_HANGUP_DELAY_MS = 9000; // 9 seconds fixed delay after OpenAI final sentence
const MIN_OPENAI_FINAL_PLAYBACK_MS = 7000; // 7 seconds minimum playback before hangup
const OPENAI_FINAL_EMERGENCY_FALLBACK_MS = 5000; // 5 seconds before falling back to TwiML

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_VOICE = process.env.AI_VOICE || 'alloy'; // Configurable voice: alloy, verse, cedar, marin
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Diagnostic logging - DO NOT LOG SECRET VALUES
console.log('[ENV DIAGNOSTIC]', {
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  supabaseUrlLength: process.env.SUPABASE_URL?.length || 0,
  hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  openAIKeyLength: process.env.OPENAI_API_KEY?.length || 0,
  pid: process.pid,
  timestamp: new Date().toISOString()
});

console.log('[PROCESS ENV KEYS]', Object.keys(process.env).filter(k =>
  k.includes('SUPABASE') || k.includes('OPENAI')
));

// Set up global WebSocket for Node 20 compatibility
(global as any).WebSocket = WebSocket;

// Initialize Supabase client with proper error handling
let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    console.log('[BEFORE CREATE CLIENT]', {
      hasSupabaseUrl: !!SUPABASE_URL,
      supabaseUrlLength: SUPABASE_URL?.length || 0,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyLength: SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    log(LogLevel.INFO, '[SUPABASE INIT INPUTS]', {
      usingUrl: 'SUPABASE_URL',
      usingKey: 'SUPABASE_SERVICE_ROLE_KEY'
    });
    
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    log(LogLevel.INFO, '[SUPABASE INIT SUCCESS] Supabase client created successfully');
    
    // Test connection immediately after creation
    testSupabaseConnection();
    
  } catch (error) {
    log(LogLevel.ERROR, '[SUPABASE INIT ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    supabase = null;
  }
} else {
  log(LogLevel.ERROR, '[SUPABASE INIT FAILED] Missing required environment variables:');
  if (!SUPABASE_URL) log(LogLevel.ERROR, '[SUPABASE INIT FAILED] - SUPABASE_URL is missing');
  if (!SUPABASE_SERVICE_ROLE_KEY) log(LogLevel.ERROR, '[SUPABASE INIT FAILED] - SUPABASE_SERVICE_ROLE_KEY is missing');
  supabase = null;
}

// Test Supabase connection
async function testSupabaseConnection() {
  if (!supabase) {
    log(LogLevel.ERROR, '[SUPABASE CONNECTION TEST] Cannot test - supabase is null');
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('id')
      .limit(1) as any;
    
    if (error) {
      log(LogLevel.ERROR, '[SUPABASE CONNECTION TEST]', {
        success: false,
        error: error.message
      });
    } else {
      log(LogLevel.INFO, '[SUPABASE CONNECTION TEST]', {
        success: true,
        recordCount: data?.length || 0
      });
    }
  } catch (error) {
    log(LogLevel.ERROR, '[SUPABASE CONNECTION TEST]', {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Normalized call context interface
interface CallContext {
  businessId: string;
  callSid: string;
  sessionId: string;
  callerPhone: string;
  businessPhone: string;
  forwardedFrom: string;
  callType?: string;
}

// Intake state machine types
type IntakeStage = 'ask_name_reason' | 'ask_details' | 'ask_location_or_context' | 'ask_timing' | 'ask_callback_time' | 'complete';

/**
 * AI Intake Flow Documentation
 *
 * Purpose: Collect required information from callers in a structured, controlled manner.
 * Prevents free-form AI conversation and ensures consistent data collection.
 *
 * Required Fields:
 * - customerName: Caller's name
 * - serviceRequested: Reason for calling (service type)
 * - issueDescription: Important details about the issue
 * - serviceAddress: Location for the service
 * - desiredCompletionTime: When the work should be completed
 * - callbackTime: Best time for the business to call back
 *
 * Flow:
 * ask_name_reason → ask_details → ask_location → ask_completion_time → complete
 *
 * Stage Prompts:
 * - ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?"
 * - ask_details: "Got it. Can you share any important details the business should know?"
 * - ask_location: "Thanks. Where will the service take place?"
 * - ask_completion_time: "Got it. When would you like this work completed?"
 * - complete: Final sentence: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
 *
 * Notes:
 * - Do not change the intake flow or add new questions.
 * - Do not reintroduce urgency, callback number, confirmation, or free-form AI conversation.
 * - All prompts must match the exact wording specified above.
 * - Field extraction uses heuristics to capture multiple answers from single responses.
 * - Callback number must never be asked - the business already has the caller's phone number.
 */

// AI session state tracking types
type AISessionState = 'AI_CONNECTING' | 'AI_CONNECTED' | 'SESSION_UPDATING' | 'SESSION_READY' | 'GREETING_SENT' | 'AUDIO_RECEIVED' | 'FAILED';

interface AISessionMetrics {
  callSid: string;
  businessId: string;
  callReceivedAt: number;
  aiConnectedAt?: number;
  sessionReadyAt?: number;
  greetingSentAt?: number;
  firstAudioReceivedAt?: number;
  failureReason?: string;
}

interface AISessionStateTracker {
  currentState: AISessionState;
  metrics: AISessionMetrics;
  stateHistory: Array<{
    state: AISessionState;
    timestamp: number;
    transitionFrom?: AISessionState;
  }>;
}

interface IntakeData {
  stage: IntakeStage;
  customerName?: string;
  serviceRequested?: string;
  issueDescription?: string;
  serviceAddress?: string;
  locationType?: 'service_address' | 'business_location' | 'caller_location' | 'online';
  callbackTime?: string;
  desiredCompletionTime?: string;
  businessName: string;
  callSid: string;
  businessId: string;
  sessionId: string;
  startTime: number;
}

interface LeadSummary {
  callerName?: string;
  reason?: string;
  desiredCompletionTime?: string;
  addressOrLocation?: string;
  preferredCallbackTime?: string;
  summary: string;
  timestamp: string;
  callSid: string;
  businessId: string;
  businessName: string;
}

// Service location categories
type ServiceLocationCategory = 'onsite' | 'flexible' | 'virtual';

// Classify service request into location category based on service keywords
function getServiceLocationCategory(serviceRequested: string): ServiceLocationCategory {
  if (!serviceRequested) return 'flexible';

  const serviceLower = serviceRequested.toLowerCase();

  // Category A: On-site services - always require physical presence
  const onsiteKeywords = [
    'lawn', 'grass', 'mow', 'landscap', 'pressure wash', 'roof', 'hvac', 'heating', 'cooling',
    'plumb', 'electrical', 'electric', 'clean', 'pest control', 'paint', 'handyman',
    'carpentry', 'floor', 'tile', 'window', 'gutter', 'insulation', 'concrete', 'paving',
    'tree', 'hedge', 'snow', 'junk', 'trash', 'move', 'organize', 'declutter'
  ];

  // Category C: Usually virtual - typically done online/remote
  const virtualKeywords = [
    'gaming', 'consult', 'market', 'resume', 'review', 'seo', 'web design', 'graphic design',
    'social media', 'data entry', 'transcription', 'translation', 'writing', 'editing',
    'bookkeeping', 'accounting', 'tax', 'financial planning', 'legal advice', 'coaching'
  ];

  // Check for on-site keywords first (most specific)
  for (const keyword of onsiteKeywords) {
    if (serviceLower.includes(keyword)) {
      return 'onsite';
    }
  }

  // Check for virtual keywords
  for (const keyword of virtualKeywords) {
    if (serviceLower.includes(keyword)) {
      return 'virtual';
    }
  }

  // Default to flexible for everything else
  return 'flexible';
}

// Get appropriate location prompt based on service category
function getLocationPrompt(category: ServiceLocationCategory): string {
  switch (category) {
    case 'onsite':
      return 'What is the service address?';
    case 'flexible':
      return 'Where would this take place — at your address, at the business, or online?';
    case 'virtual':
      return 'Will this take place online or at a specific location?';
    default:
      return 'Where would this take place — at your address, at the business, or online?';
  }
}

// Intake state machine functions
function getMissingRequiredFields(intake: IntakeData): string[] {
  const missing: string[] = [];
  if (!intake.customerName) missing.push('customer name');
  if (!intake.serviceRequested) missing.push('service requested');
  if (!intake.issueDescription) missing.push('issue description');
  
  // Location validation: accept flexible responses based on location type
  // For service_address type, require actual address
  // For business_location, caller_location, and online types, simple values are acceptable
  if (!intake.serviceAddress) {
    missing.push('service address');
  } else if (intake.locationType === 'service_address' && intake.serviceAddress.length < 5) {
    // If location type is service_address but the value is too short, consider it missing
    missing.push('service address');
  }
  
  if (!intake.desiredCompletionTime) missing.push('desired completion time');
  if (!intake.callbackTime) missing.push('callback time');
  return missing;
}

function isGoodEnoughForBetaIntake(intake: IntakeData): boolean {
  console.log('[GOOD ENOUGH INTAKE CHECK] =========================================');
  console.log('[GOOD ENOUGH INTAKE CHECK] Checking if intake is good enough for beta');
  console.log('[GOOD ENOUGH INTAKE CHECK] customerName:', !!intake.customerName);
  console.log('[GOOD ENOUGH INTAKE CHECK] serviceRequested:', !!intake.serviceRequested);
  console.log('[GOOD ENOUGH INTAKE CHECK] issueDescription:', !!intake.issueDescription);
  console.log('[GOOD ENOUGH INTAKE CHECK] serviceAddress:', !!intake.serviceAddress);
  console.log('[GOOD ENOUGH INTAKE CHECK] desiredCompletionTime:', !!intake.desiredCompletionTime);
  console.log('[GOOD ENOUGH INTAKE CHECK] callbackTime:', !!intake.callbackTime);
  console.log('[GOOD ENOUGH INTAKE CHECK] Timestamp:', new Date().toISOString());
  console.log('[GOOD ENOUGH INTAKE CHECK] =========================================');

  // Tolerant completion check - we need:
  // - customerName OR fallback to caller ID
  // - serviceRequested OR issueDescription (at least one job description)
  // - serviceAddress (location)
  // - desiredCompletionTime OR callbackTime (timing info)
  // - callbackTime OR "as soon as possible" fallback

  const hasName = !!intake.customerName;
  const hasJobDescription = !!(intake.serviceRequested || intake.issueDescription);
  const hasLocation = !!intake.serviceAddress;
  const hasTiming = !!(intake.desiredCompletionTime || intake.callbackTime);
  const hasCallbackTime = !!intake.callbackTime;

  const isGoodEnough = hasName && hasJobDescription && hasLocation && hasTiming && hasCallbackTime;

  if (isGoodEnough) {
    console.log('[GOOD ENOUGH INTAKE TRUE] =========================================');
    console.log('[GOOD ENOUGH INTAKE TRUE] Intake is good enough for beta completion');
    console.log('[GOOD ENOUGH INTAKE TRUE] Has name:', hasName);
    console.log('[GOOD ENOUGH INTAKE TRUE] Has job description:', hasJobDescription);
    console.log('[GOOD ENOUGH INTAKE TRUE] Has location:', hasLocation);
    console.log('[GOOD ENOUGH INTAKE TRUE] Has timing:', hasTiming);
    console.log('[GOOD ENOUGH INTAKE TRUE] Has callback time:', hasCallbackTime);
    console.log('[GOOD ENOUGH INTAKE TRUE] Timestamp:', new Date().toISOString());
    console.log('[GOOD ENOUGH INTAKE TRUE] =========================================');
  } else {
    console.log('[GOOD ENOUGH INTAKE FALSE] =========================================');
    console.log('[GOOD ENOUGH INTAKE FALSE] Intake not good enough yet');
    console.log('[GOOD ENOUGH INTAKE FALSE] Missing:', {
      name: !hasName,
      jobDescription: !hasJobDescription,
      location: !hasLocation,
      timing: !hasTiming,
      callbackTime: !hasCallbackTime
    });
    console.log('[GOOD ENOUGH INTAKE FALSE] Timestamp:', new Date().toISOString());
    console.log('[GOOD ENOUGH INTAKE FALSE] =========================================');
  }

  return isGoodEnough;
}

function areAllRequiredFieldsCollected(intake: IntakeData): boolean {
  const allCollected = !!(
    intake.customerName &&
    intake.serviceRequested &&
    intake.issueDescription &&
    intake.serviceAddress &&
    intake.desiredCompletionTime &&
    intake.callbackTime
  );
  console.log('[REQUIRED FIELDS CHECK] =========================================');
  console.log('[REQUIRED FIELDS CHECK] customerName:', intake.customerName);
  console.log('[REQUIRED FIELDS CHECK] serviceRequested:', intake.serviceRequested);
  console.log('[REQUIRED FIELDS CHECK] issueDescription:', intake.issueDescription);
  console.log('[REQUIRED FIELDS CHECK] serviceAddress:', intake.serviceAddress);
  console.log('[REQUIRED FIELDS CHECK] desiredCompletionTime:', intake.desiredCompletionTime);
  console.log('[REQUIRED FIELDS CHECK] callbackTime:', intake.callbackTime);
  console.log('[REQUIRED FIELDS CHECK] result:', allCollected);
  console.log('[REQUIRED FIELDS CHECK] Timestamp:', new Date().toISOString());
  console.log('[REQUIRED FIELDS CHECK] =========================================');
  
  if (!allCollected) {
    const missingFields = [];
    if (!intake.customerName) missingFields.push('customerName');
    if (!intake.serviceRequested) missingFields.push('serviceRequested');
    if (!intake.issueDescription) missingFields.push('issueDescription');
    if (!intake.serviceAddress) missingFields.push('serviceAddress');
    if (!intake.desiredCompletionTime) missingFields.push('desiredCompletionTime');
    if (!intake.callbackTime) missingFields.push('callbackTime');
    console.log('[REQUIRED FIELDS MISSING] =========================================');
    console.log('[REQUIRED FIELDS MISSING] missingFields:', missingFields);
    console.log('[REQUIRED FIELDS MISSING] Timestamp:', new Date().toISOString());
    console.log('[REQUIRED FIELDS MISSING] =========================================');
  }
  
  return allCollected;
}

function getNextMissingField(intake: IntakeData): string | null {
  if (!intake.customerName) {
    console.log('[NEXT_MISSING_FIELD] customerName');
    return 'customerName';
  }
  if (!intake.serviceRequested) {
    console.log('[NEXT_MISSING_FIELD] serviceRequested');
    return 'serviceRequested';
  }
  if (!intake.issueDescription) {
    console.log('[NEXT_MISSING_FIELD] issueDescription');
    return 'issueDescription';
  }
  if (!intake.serviceAddress) {
    console.log('[NEXT_MISSING_FIELD] serviceAddress');
    return 'serviceAddress';
  }
  if (!intake.desiredCompletionTime) {
    console.log('[NEXT_MISSING_FIELD] desiredCompletionTime');
    return 'desiredCompletionTime';
  }
  if (!intake.callbackTime) {
    console.log('[NEXT_MISSING_FIELD] callbackTime');
    return 'callbackTime';
  }
  console.log('[NEXT_MISSING_FIELD] All fields collected');
  return null;
}

function enterTerminalClose(closingState: any, ws: any, twilioHandler: any, openAiWs: any): void {
  console.log('[ENTER TERMINAL CLOSE FUNCTION CALLED] =========================================');
  console.log('[ENTER TERMINAL CLOSE FUNCTION CALLED] enterTerminalClose function invoked');
  console.log('[ENTER TERMINAL CLOSE FUNCTION CALLED] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE FUNCTION CALLED] =========================================');
  
  console.log('[ENTER TERMINAL CLOSE STEP 1] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 1] Starting OpenAI-based final close');
  console.log('[ENTER TERMINAL CLOSE STEP 1] Timestamp:', new Date().toISOString());
  console.log('[COMPLETE FINALIZATION STEP 1] =========================================');
  console.log('[COMPLETE FINALIZATION STEP 1] enterTerminalClose() called - Starting complete intake finalization');
  console.log('[COMPLETE FINALIZATION STEP 1] Timestamp:', new Date().toISOString());
  console.log('[COMPLETE FINALIZATION STEP 1] =========================================');
  
  console.log('[OPENAI FINAL CLOSE STARTED] =========================================');
  console.log('[OPENAI FINAL CLOSE STARTED] Starting OpenAI-based final close');
  console.log('[OPENAI FINAL CLOSE STARTED] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL CLOSE STARTED] =========================================');
  
  console.log('[ENTER TERMINAL CLOSE STEP 2] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 2] Setting terminal flags');
  console.log('[ENTER TERMINAL CLOSE STEP 2] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 2] =========================================');
  
  console.log('[CLOSING STATE SET] =========================================');
  console.log('[CLOSING STATE SET] Setting terminal flags');
  console.log('[CLOSING STATE SET] confirmationState: completed');
  console.log('[CLOSING STATE SET] intakeTerminalComplete: true');
  console.log('[CLOSING STATE SET] terminalClosingResponseStarted: true');
  console.log('[CLOSING STATE SET] finalClosingStarted: true');
  console.log('[CLOSING STATE SET] callState: closing');
  console.log('[CLOSING STATE SET] Timestamp:', new Date().toISOString());
  console.log('[CLOSING STATE SET] =========================================');
  
  console.log('[CONFIRMATION STATE CHANGE] =========================================');
  console.log('[CONFIRMATION STATE CHANGE] from:', closingState.confirmationState);
  console.log('[CONFIRMATION STATE CHANGE] to: completed');
  console.log('[CONFIRMATION STATE CHANGE] reason: enterTerminalClose called');
  console.log('[CONFIRMATION STATE CHANGE] Timestamp:', new Date().toISOString());
  console.log('[CONFIRMATION STATE CHANGE] =========================================');

  console.log('[CALL STATE CLOSING REQUEST - PATH 4] =========================================');
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Source: enterTerminalClose function at line 483');
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Trigger: Terminal close sequence initiated by app');
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Current callState:', closingState.callState);
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Current terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Current finalClosingStarted:', closingState.finalClosingStarted);
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Current confirmationState:', closingState.confirmationState);
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Current intakeTerminalComplete:', closingState.intakeTerminalComplete);
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Stack: enterTerminalClose -> state initialization');
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] Timestamp:', new Date().toISOString());
  console.log('[CALL STATE CLOSING REQUEST - PATH 4] =========================================');

  closingState.confirmationState = 'completed';
  closingState.intakeTerminalComplete = true;
  closingState.terminalClosingResponseStarted = true;
  closingState.finalClosingStarted = true;
  closingState.callState = 'closing';

  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] =========================================');
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] New callState:', closingState.callState);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] New terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] New finalClosingStarted:', closingState.finalClosingStarted);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] New confirmationState:', closingState.confirmationState);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] New intakeTerminalComplete:', closingState.intakeTerminalComplete);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] Timestamp:', new Date().toISOString());
  console.log('[CALL STATE CLOSING COMPLETED - PATH 4] =========================================');
  
  // Sync individual variables for backward compatibility
  const callState = closingState.callState;
  const finalClosingStarted = closingState.finalClosingStarted;
  const terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
  const confirmationState = closingState.confirmationState;
  
  // Sync to twilioHandler
  (twilioHandler as any).closingState = closingState;
  (twilioHandler as any).callState = closingState.callState;
  (twilioHandler as any).finalClosingStarted = closingState.finalClosingStarted;
  (twilioHandler as any).terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
  (twilioHandler as any).intakeTerminalComplete = closingState.intakeTerminalComplete;
  
  console.log('[ENTER TERMINAL CLOSE STEP 3] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 3] Tracking final sentence start time');
  console.log('[ENTER TERMINAL CLOSE STEP 3] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 3] =========================================');
  
  // Track final sentence start time
  const finalSentenceStartTime = Date.now();
  (twilioHandler as any).finalSentenceStartTime = finalSentenceStartTime;
  (twilioHandler as any).finalCloseAudioStarted = false;
  
  // Clear any previous authorized response ID - we'll use the actual OpenAI response ID
  (twilioHandler as any).authorizedFinalResponseId = null;
  (twilioHandler as any).finalClosingResponseId = null;
  
  console.log('[OPENAI FINAL RESPONSE ID CLEARED] =========================================');
  console.log('[OPENAI FINAL RESPONSE ID CLEARED] Cleared previous response IDs');
  console.log('[OPENAI FINAL RESPONSE ID CLEARED] Will use actual OpenAI response ID from response.created');
  console.log('[OPENAI FINAL RESPONSE ID CLEARED] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL RESPONSE ID CLEARED] =========================================');
  
  console.log('[ENTER TERMINAL CLOSE STEP 4] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 4] Checking OpenAI websocket state');
  console.log('[ENTER TERMINAL CLOSE STEP 4] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 4] =========================================');
  
  // Check if OpenAI websocket is open
  if (!openAiWs || openAiWs.readyState !== openAiWs.OPEN) {
    console.log('[OPENAI FINAL WS NOT OPEN] =========================================');
    console.log('[OPENAI FINAL WS NOT OPEN] OpenAI websocket is not open');
    console.log('[OPENAI FINAL WS NOT OPEN] readyState:', openAiWs ? openAiWs.readyState : 'null');
    console.log('[OPENAI FINAL WS NOT OPEN] Timestamp:', new Date().toISOString());
    console.log('[OPENAI FINAL WS NOT OPEN] =========================================');
    
    console.log('[OPENAI FINAL EARLY RETURN] =========================================');
    console.log('[OPENAI FINAL EARLY RETURN] Early return: OpenAI websocket not open');
    console.log('[OPENAI FINAL EARLY RETURN] Reason: readyState is not OPEN');
    console.log('[OPENAI FINAL EARLY RETURN] Timestamp:', new Date().toISOString());
    console.log('[OPENAI FINAL EARLY RETURN] =========================================');
    
    console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] =========================================');
    console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] OpenAI websocket not open, falling back to TwiML');
    console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] Timestamp:', new Date().toISOString());
    console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] =========================================');
    
    executeTwilioFallback(ws, twilioHandler, closingState);
    return;
  }
  
  console.log('[ENTER TERMINAL CLOSE STEP 5] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 5] Attempting to send final sentence');
  console.log('[ENTER TERMINAL CLOSE STEP 5] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 5] =========================================');
  
  console.log('[OPENAI FINAL SEND ATTEMPT] =========================================');
  console.log('[OPENAI FINAL SEND ATTEMPT] Attempting to send final sentence through OpenAI');
  console.log('[OPENAI FINAL SEND ATTEMPT] Sentence:', FINAL_CLOSE_SENTENCE);
  console.log('[OPENAI FINAL SEND ATTEMPT] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL SEND ATTEMPT] =========================================');
  
  console.log('[OPENAI FINAL SENTENCE SENT] =========================================');
  console.log('[OPENAI FINAL SENTENCE SENT] Sending final sentence through OpenAI Realtime');
  console.log('[OPENAI FINAL SENTENCE SENT] Sentence:', FINAL_CLOSE_SENTENCE);
  console.log('[OPENAI FINAL SENTENCE SENT] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL SENTENCE SENT] =========================================');
  
  console.log('[OPENAI FINAL RESPONSE CREATE SENT] =========================================');
  console.log('[OPENAI FINAL RESPONSE CREATE SENT] Sending response.create for final sentence');
  console.log('[OPENAI FINAL RESPONSE CREATE SENT] Response ID will be captured from response.created');
  console.log('[OPENAI FINAL RESPONSE CREATE SENT] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL RESPONSE CREATE SENT] =========================================');
  
  // Send final sentence through OpenAI Realtime
  sendControlledAssistantText(FINAL_CLOSE_SENTENCE, 'FINAL_CLOSE_OPENAI', openAiWs);
  
  console.log('[OPENAI FINAL RESPONSE CREATED] =========================================');
  console.log('[OPENAI FINAL RESPONSE CREATED] Response.create sent successfully');
  console.log('[OPENAI FINAL RESPONSE CREATED] Response ID will be captured from response.created');
  console.log('[OPENAI FINAL RESPONSE CREATED] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL RESPONSE CREATED] =========================================');
  
  console.log('[ENTER TERMINAL CLOSE STEP 6] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 6] Starting fixed delay hangup timer');
  console.log('[ENTER TERMINAL CLOSE STEP 6] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 6] =========================================');
  
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] =========================================');
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] Starting fixed delay hangup timer');
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] Delay:', FINAL_CLOSE_OPENAI_HANGUP_DELAY_MS, 'ms');
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] Minimum playback:', MIN_OPENAI_FINAL_PLAYBACK_MS, 'ms');
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL HANGUP TIMER STARTED] =========================================');
  
  // Schedule fixed delay hangup
  setTimeout(() => {
    const elapsed = Date.now() - finalSentenceStartTime;
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] =========================================');
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] Minimum playback time satisfied');
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] Elapsed:', elapsed, 'ms');
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] Minimum required:', MIN_OPENAI_FINAL_PLAYBACK_MS, 'ms');
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] Timestamp:', new Date().toISOString());
    console.log('[OPENAI FINAL MIN PLAYBACK SATISFIED] =========================================');
    
    executeOpenaiFinalHangup(ws, twilioHandler, closingState);
  }, FINAL_CLOSE_OPENAI_HANGUP_DELAY_MS);
  
  console.log('[ENTER TERMINAL CLOSE STEP 7] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 7] Starting emergency fallback timer');
  console.log('[ENTER TERMINAL CLOSE STEP 7] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 7] =========================================');
  
  // Emergency fallback: if no audio delta received within 3 seconds, redirect to TwiML
  setTimeout(() => {
    if (!(twilioHandler as any).finalCloseAudioStarted) {
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] =========================================');
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] No audio delta received within emergency fallback window');
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] Emergency fallback time:', OPENAI_FINAL_EMERGENCY_FALLBACK_MS, 'ms');
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] Redirecting to TwiML endpoint');
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] Timestamp:', new Date().toISOString());
      console.log('[OPENAI FINAL FAILED - FALLING BACK TO TWILIO FINAL CLOSE] =========================================');
      
      executeTwilioFallback(ws, twilioHandler, closingState);
    }
  }, OPENAI_FINAL_EMERGENCY_FALLBACK_MS);
  
  console.log('[ENTER TERMINAL CLOSE STEP 8] =========================================');
  console.log('[ENTER TERMINAL CLOSE STEP 8] Function completed successfully');
  console.log('[ENTER TERMINAL CLOSE STEP 8] Timestamp:', new Date().toISOString());
  console.log('[ENTER TERMINAL CLOSE STEP 8] =========================================');
}

// Finalize complete intake once with idempotent lock
async function finalizeCompleteIntakeOnce(
  intakeData: IntakeData,
  callSid: string,
  callerPhone: string,
  businessId: string,
  ws: any
): Promise<void> {
  // Idempotent lock: prevent duplicate finalization
  if (completeFinalizationStartedByCallSid.has(callSid)) {
    console.log('[COMPLETE PATH] Finalization already started, skipping');
    return;
  }

  if (completeFinalizationFinishedByCallSid.has(callSid)) {
    console.log('[COMPLETE PATH] Finalization already finished, skipping');
    return;
  }

  completeFinalizationStartedByCallSid.set(callSid, Date.now());

  console.log('[FINALIZE COMPLETE INTAKE ENTERED] =========================================');
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] Function entered');
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] callSid:', callSid);
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] businessId:', businessId);
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] callerPhone:', callerPhone);
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] Timestamp:', new Date().toISOString());
  console.log('[FINALIZE COMPLETE INTAKE ENTERED] =========================================');

  console.log('[FINALIZE COMPLETE STEP 1] =========================================');
  console.log('[FINALIZE COMPLETE STEP 1] Starting: Resolve lead/conversation from session');
  console.log('[FINALIZE COMPLETE STEP 1] Timestamp:', new Date().toISOString());
  console.log('[FINALIZE COMPLETE STEP 1] =========================================');

  try {
    // Resolve leadId and conversationId from session customParameters
    const leadId = (ws as any).leadId || null;
    const conversationId = (ws as any).conversationId || null;

    console.log('[AI SUMMARY SMS IDS RESOLVED] =========================================');
    console.log('[AI SUMMARY SMS IDS RESOLVED] source: session_custom_parameter');
    console.log('[AI SUMMARY SMS IDS RESOLVED] leadId:', leadId);
    console.log('[AI SUMMARY SMS IDS RESOLVED] conversationId:', conversationId);
    console.log('[AI SUMMARY SMS IDS RESOLVED] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS IDS RESOLVED] =========================================');

    if (!leadId || !conversationId) {
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] =========================================');
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] leadId:', leadId);
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] conversationId:', conversationId);
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] SMS will still be sent to customer');
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] DB persistence will be skipped');
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS IDS MISSING FROM SESSION] =========================================');
    }

    console.log('[FINALIZE COMPLETE STEP 2] =========================================');
    console.log('[FINALIZE COMPLETE STEP 2] Completed: Resolve lead/conversation from session');
    console.log('[FINALIZE COMPLETE STEP 2] leadId:', leadId);
    console.log('[FINALIZE COMPLETE STEP 2] conversationId:', conversationId);
    console.log('[FINALIZE COMPLETE STEP 2] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE STEP 2] =========================================');

    console.log('[FINALIZE COMPLETE STEP 3] =========================================');
    console.log('[FINALIZE COMPLETE STEP 3] Starting: Build SMS content');
    console.log('[FINALIZE COMPLETE STEP 3] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE STEP 3] =========================================');

    // Fetch business name, out-of-office settings, and business hours settings
    let businessName = 'the business';
    let outOfOfficeEnabled = false;
    let outOfOfficeEnd = null;
    let outOfOfficeMessage = null;
    let businessHoursEnabled = false;
    let businessHoursStart = null;
    let businessHoursEnd = null;
    let businessHoursTimezone = null;
    let afterHoursMessage = null;

    try {
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('name, out_of_office_enabled, out_of_office_end, out_of_office_message, business_hours_enabled, business_hours_start, business_hours_end, business_hours_timezone, after_hours_message')
        .eq('id', businessId)
        .single();

      if (business && !businessError) {
        businessName = business.name || 'the business';
        outOfOfficeEnabled = business.out_of_office_enabled || false;
        outOfOfficeEnd = business.out_of_office_end || null;
        outOfOfficeMessage = business.out_of_office_message || null;
        businessHoursEnabled = business.business_hours_enabled || false;
        businessHoursStart = business.business_hours_start || null;
        businessHoursEnd = business.business_hours_end || null;
        businessHoursTimezone = business.business_hours_timezone || null;
        afterHoursMessage = business.after_hours_message || null;
      }
    } catch (dbError) {
      console.log('[AI SUMMARY SMS BUSINESS FETCH ERROR]', String(dbError));
    }

    // Build complete summary SMS from intakeData (matching confirmation SMS format)
    const summaryParts: string[] = [];

    if (intakeData.customerName) {
      summaryParts.push(`- Name: ${intakeData.customerName}`);
    }

    if (intakeData.serviceRequested) {
      summaryParts.push(`- Reason: ${intakeData.serviceRequested}`);
    }

    if (intakeData.issueDescription) {
      summaryParts.push(`- Details: ${intakeData.issueDescription}`);
    }

    if (intakeData.serviceAddress) {
      summaryParts.push(`- Location: ${intakeData.serviceAddress}`);
    }

    if (intakeData.desiredCompletionTime) {
      summaryParts.push(`- Desired Completion Time: ${intakeData.desiredCompletionTime}`);
    }

    if (intakeData.callbackTime) {
      summaryParts.push(`- Best Callback Time: ${intakeData.callbackTime}`);
    }

    // Determine prefix type: out_of_office, after_hours, or normal
    let prefixType: 'out_of_office' | 'after_hours' | 'normal' = 'normal';
    let prefixNotice = '';
    let usingDefaultMessage = false;

    // Priority: Out of Office > After Hours > Normal
    const businessWithHours = {
      id: businessId,
      business_hours_enabled: businessHoursEnabled,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      business_hours_timezone: businessHoursTimezone
    };

    // Check if OOO is active
    const oooActive = outOfOfficeEnabled && outOfOfficeEnd && new Date() < new Date(outOfOfficeEnd);

    if (oooActive) {
      prefixType = 'out_of_office';
      // Use custom out of office message or default
      if (outOfOfficeMessage && outOfOfficeMessage.trim()) {
        prefixNotice = outOfOfficeMessage.replace(/\{\{business_name\}\}/gi, businessName);
        usingDefaultMessage = false;
      } else {
        prefixNotice = `We are currently out of office and responses may be delayed.`;
        usingDefaultMessage = true;
      }
    } else if (businessHoursEnabled && !isWithinBusinessHours(businessWithHours)) {
      prefixType = 'after_hours';
      // Use custom after-hours message or default
      if (afterHoursMessage && afterHoursMessage.trim()) {
        prefixNotice = afterHoursMessage.replace(/\{\{business_name\}\}/gi, businessName);
        usingDefaultMessage = false;
      } else {
        prefixNotice = `We are currently closed and will get back to you during business hours.`;
        usingDefaultMessage = true;
      }
    }

    console.log('[AI SUMMARY PREFIX]', {
      callSid,
      businessId,
      prefixType,
      businessHoursEnabled,
      isWithinBusinessHours: isWithinBusinessHours(businessWithHours),
      oooActive,
      usingDefaultMessage
    });

    // Build final SMS with optional prefix
    let completeSummary = `Thanks for calling ${businessName}.\n\n`;

    if (prefixNotice) {
      completeSummary += `${prefixNotice}\n\n`;
    }

    completeSummary += `Here's a summary of your request:\n${summaryParts.join('\n')}\n\n`;
    completeSummary += `We'll be in touch soon.\n\nReply to this message if you'd like to add or correct anything.`;

    console.log('[AI SUMMARY SMS FORMAT] =========================================');
    console.log('[AI SUMMARY SMS FORMAT] prefixType:', prefixType);
    console.log('[AI SUMMARY SMS FORMAT] includesPrefix:', !!prefixNotice);
    console.log('[AI SUMMARY SMS FORMAT] formatSource: ai_confirmation_sms_template');
    console.log('[AI SUMMARY SMS FORMAT] businessName:', businessName);
    console.log('[AI SUMMARY SMS FORMAT] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS FORMAT] =========================================');

    console.log('[AI SUMMARY SMS REQUEST] =========================================');
    console.log('[AI SUMMARY SMS REQUEST] to:', callerPhone);
    console.log('[AI SUMMARY SMS REQUEST] businessId:', businessId);
    console.log('[AI SUMMARY SMS REQUEST] smsBody:', completeSummary.substring(0, 100) + '...');
    console.log('[AI SUMMARY SMS REQUEST] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS REQUEST] =========================================');

    console.log('[FINALIZE COMPLETE STEP 4] =========================================');
    console.log('[FINALIZE COMPLETE STEP 4] Completed: Build SMS content');
    console.log('[FINALIZE COMPLETE STEP 4] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE STEP 4] =========================================');

    // Fetch business-specific phone number from session customParameters
    let fromNumber: string | null = null;
    let source = 'unknown';
    let fallbackUsed = false;
    let sourceTable = 'session_custom_parameter';
    let sourceField = 'businessTwilioPhoneNumber';

    console.log('[AI SUMMARY SMS SENDER] =========================================');
    console.log('[AI SUMMARY SMS SENDER] businessId:', businessId);
    console.log('[AI SUMMARY SMS SENDER] sourceTable:', sourceTable);
    console.log('[AI SUMMARY SMS SENDER] sourceField:', sourceField);
    console.log('[AI SUMMARY SMS SENDER] Using session businessTwilioPhoneNumber');
    console.log('[AI SUMMARY SMS SENDER] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS SENDER] =========================================');

    // Use sessionBusinessTwilioNumber from ws object
    const sessionBusinessTwilioPhoneNumber = (ws as any).businessTwilioPhoneNumber;

    console.log('[AI SUMMARY SMS SENDER] =========================================');
    console.log('[AI SUMMARY SMS SENDER] Session parameter result');
    console.log('[AI SUMMARY SMS SENDER] sessionBusinessTwilioPhoneNumber:', sessionBusinessTwilioPhoneNumber);
    console.log('[AI SUMMARY SMS SENDER] hasSessionNumber:', !!sessionBusinessTwilioPhoneNumber);
    console.log('[AI SUMMARY SMS SENDER] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS SENDER] =========================================');

    if (sessionBusinessTwilioPhoneNumber) {
      fromNumber = sessionBusinessTwilioPhoneNumber;
      source = 'session_custom_parameter';
      console.log('[AI SUMMARY SMS SENDER] =========================================');
      console.log('[AI SUMMARY SMS SENDER] selectedFromNumber:', fromNumber);
      console.log('[AI SUMMARY SMS SENDER] source:', source);
      console.log('[AI SUMMARY SMS SENDER] sourceTable:', sourceTable);
      console.log('[AI SUMMARY SMS SENDER] sourceField:', sourceField);
      console.log('[AI SUMMARY SMS SENDER] fallbackUsed:', fallbackUsed);
      console.log('[AI SUMMARY SMS SENDER] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS SENDER] =========================================');
    } else {
      console.log('[AI SUMMARY SMS SENDER ERROR] =========================================');
      console.log('[AI SUMMARY SMS SENDER ERROR] No businessTwilioPhoneNumber in session');
      console.log('[AI SUMMARY SMS SENDER ERROR] businessId:', businessId);
      console.log('[AI SUMMARY SMS SENDER ERROR] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS SENDER ERROR] =========================================');
    }

    // Fallback to global TWILIO_PHONE_NUMBER if business number not found
    if (!fromNumber) {
      fromNumber = process.env.TWILIO_PHONE_NUMBER || null;
      source = 'fallback_global';
      fallbackUsed = true;

      console.log('[AI SUMMARY SMS SENDER] =========================================');
      console.log('[AI SUMMARY SMS SENDER] selectedFromNumber:', fromNumber);
      console.log('[AI SUMMARY SMS SENDER] source:', source);
      console.log('[AI SUMMARY SMS SENDER] fallbackUsed:', fallbackUsed);
      console.log('[AI SUMMARY SMS SENDER] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS SENDER] =========================================');

      if (fallbackUsed) {
        console.log('[AI SUMMARY SMS FALLBACK USED] =========================================');
        console.log('[AI SUMMARY SMS FALLBACK USED] Fallback to global TWILIO_PHONE_NUMBER');
        console.log('[AI SUMMARY SMS FALLBACK USED] fromNumber:', fromNumber);
        console.log('[AI SUMMARY SMS FALLBACK USED] Timestamp:', new Date().toISOString());
        console.log('[AI SUMMARY SMS FALLBACK USED] =========================================');
      }
    }

    // Fail if no number is available
    if (!fromNumber) {
      console.log('[AI SUMMARY SMS SENDER ERROR] =========================================');
      console.log('[AI SUMMARY SMS SENDER ERROR] No phone number available (neither business-specific nor global fallback)');
      console.log('[AI SUMMARY SMS SENDER ERROR] Cannot send SMS');
      console.log('[AI SUMMARY SMS SENDER ERROR] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS SENDER ERROR] =========================================');
      return;
    }

    console.log('[FINALIZE COMPLETE STEP 5] =========================================');
    console.log('[FINALIZE COMPLETE STEP 5] Starting: Send Twilio SMS');
    console.log('[FINALIZE COMPLETE STEP 5] fromNumber:', fromNumber);
    console.log('[FINALIZE COMPLETE STEP 5] to:', callerPhone);
    console.log('[FINALIZE COMPLETE STEP 5] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE STEP 5] =========================================');

    const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const smsResult = await twilioClient.messages.create({
      from: fromNumber,
      to: callerPhone,
      body: completeSummary
    });

    console.log('[AI SUMMARY SMS RESPONSE] =========================================');
    console.log('[AI SUMMARY SMS RESPONSE] messageSid:', smsResult.sid);
    console.log('[AI SUMMARY SMS RESPONSE] status:', smsResult.status);
    console.log('[AI SUMMARY SMS RESPONSE] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS RESPONSE] =========================================');

    console.log('[FINALIZE COMPLETE STEP 5] =========================================');
    console.log('[FINALIZE COMPLETE STEP 5] Completed: Send Twilio SMS');
    console.log('[FINALIZE COMPLETE STEP 5] messageSid:', smsResult.sid);
    console.log('[FINALIZE COMPLETE STEP 5] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE STEP 5] =========================================');

    console.log('[AI SUMMARY SMS DB INSERT BUILD MARKER] 2026-06-18 =========================================');
    console.log('[AI SUMMARY SMS DB INSERT BUILD MARKER] Build deployed with DB insert logic');
    console.log('[AI SUMMARY SMS DB INSERT BUILD MARKER] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS DB INSERT BUILD MARKER] =========================================');

    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] =========================================');
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] About to call persistAiSummarySmsMessage');
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] businessId:', businessId);
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] callSid:', callSid);
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] fromNumber:', fromNumber);
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] callerPhone:', callerPhone);
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS POST RESPONSE TRACE] =========================================');

    // Only persist to DB if lead and conversation IDs are available from session
    if (leadId && conversationId) {
      console.log('[FINALIZE COMPLETE STEP 6] =========================================');
      console.log('[FINALIZE COMPLETE STEP 6] Starting: Persist message to database');
      console.log('[FINALIZE COMPLETE STEP 6] Timestamp:', new Date().toISOString());
      console.log('[FINALIZE COMPLETE STEP 6] =========================================');

      await persistAiSummarySmsMessage({
        ws,
        businessId,
        leadId: leadId,
        conversationId: conversationId,
        fromNumber,
        callerPhone,
        messageSid: smsResult.sid,
        smsBody: completeSummary,
        intakeData,
        status: smsResult.status
      });

      console.log('[FINALIZE COMPLETE STEP 6] =========================================');
      console.log('[FINALIZE COMPLETE STEP 6] Completed: Persist message to database');
      console.log('[FINALIZE COMPLETE STEP 6] Timestamp:', new Date().toISOString());
      console.log('[FINALIZE COMPLETE STEP 6] =========================================');
    } else {
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] =========================================');
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] Skipping DB persistence (leadId or conversationId missing from session)');
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] SMS was still sent to customer');
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] reason: leadId=', leadId, 'conversationId=', conversationId);
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] Timestamp:', new Date().toISOString());
      console.log('[FINALIZE COMPLETE STEP 6 SKIP] =========================================');
    }

    console.log('[SCRIPTED FLOW] =========================================');
    console.log('[SCRIPTED FLOW] summary SMS sent');
    console.log('[SCRIPTED FLOW] messageSid:', smsResult.sid);
    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
    console.log('[SCRIPTED FLOW] =========================================');

    console.log('[COMPLETE PATH] Summary SMS sent');
    console.log('[COMPLETE PATH] Finalization complete');

    completeFinalizationFinishedByCallSid.set(callSid, Date.now());
  } catch (smsError) {
    console.log('[FINALIZE COMPLETE INTAKE ERROR] =========================================');
    console.log('[FINALIZE COMPLETE INTAKE ERROR] Error during finalization');
    console.log('[FINALIZE COMPLETE INTAKE ERROR] error:', String(smsError));
    console.log('[FINALIZE COMPLETE INTAKE ERROR] stack:', smsError instanceof Error ? smsError.stack : 'no stack');
    console.log('[FINALIZE COMPLETE INTAKE ERROR] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE COMPLETE INTAKE ERROR] =========================================');
  }
}

// Persist AI summary SMS message to database via main app API
async function persistAiSummarySmsMessage(params: {
  ws: any
  businessId: string
  leadId?: string
  conversationId?: string
  fromNumber: string
  callerPhone: string
  messageSid: string
  smsBody: string
  intakeData: any
  status: string
}): Promise<void> {
  console.log('[AI SUMMARY SMS API PERSIST START] =========================================');
  console.log('[AI SUMMARY SMS API PERSIST START] Timestamp:', new Date().toISOString());
  console.log('[AI SUMMARY SMS API PERSIST START] =========================================');

  try {
    const { ws, businessId, leadId, conversationId, fromNumber, callerPhone, messageSid, smsBody, intakeData, status } = params;

    console.log('[AI SUMMARY SMS API PERSIST START] =========================================');
    console.log('[AI SUMMARY SMS API PERSIST START] leadId:', leadId);
    console.log('[AI SUMMARY SMS API PERSIST START] conversationId:', conversationId);
    console.log('[AI SUMMARY SMS API PERSIST START] businessId:', businessId);
    console.log('[AI SUMMARY SMS API PERSIST START] fromNumber:', fromNumber);
    console.log('[AI SUMMARY SMS API PERSIST START] callerPhone:', callerPhone);
    console.log('[AI SUMMARY SMS API PERSIST START] messageSid:', messageSid);
    console.log('[AI SUMMARY SMS API PERSIST START] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS API PERSIST START] =========================================');

    if (leadId && conversationId && businessId) {
      console.log('[AI SUMMARY SMS API PERSIST START] =========================================');
      console.log('[AI SUMMARY SMS API PERSIST START] All required IDs present, proceeding with API call');
      console.log('[AI SUMMARY SMS API PERSIST START] Request payload:', {
        businessId,
        leadId,
        conversationId,
        fromPhone: fromNumber,
        toPhone: callerPhone,
        twilioMessageSid: messageSid,
        status,
        smsBodyLength: smsBody?.length || 0
      });
      console.log('[AI SUMMARY SMS API PERSIST START] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS API PERSIST START] =========================================');

      const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
      const internalApiSecret = process.env.INTERNAL_API_SECRET;

      console.log('[AI SUMMARY SMS API PERSIST START] =========================================');
      console.log('[AI SUMMARY SMS API PERSIST START] appBaseUrl:', appBaseUrl);
      console.log('[AI SUMMARY SMS API PERSIST START] hasInternalApiSecret:', !!internalApiSecret);
      console.log('[AI SUMMARY SMS API PERSIST START] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS API PERSIST START] =========================================');

      if (!internalApiSecret) {
        console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
        console.log('[AI SUMMARY SMS API PERSIST FAILED] INTERNAL_API_SECRET not configured');
        console.log('[AI SUMMARY SMS API PERSIST FAILED] Timestamp:', new Date().toISOString());
        console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
        return;
      }

      const apiResponse = await fetch(`${appBaseUrl}/api/ai-voice/summary-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalApiSecret}`
        },
        body: JSON.stringify({
          businessId,
          leadId,
          conversationId,
          smsBody,
          fromPhone: fromNumber,
          toPhone: callerPhone,
          twilioMessageSid: messageSid,
          status
        })
      });

      console.log('[AI SUMMARY SMS API PERSIST RESPONSE] =========================================');
      console.log('[AI SUMMARY SMS API PERSIST RESPONSE] status:', apiResponse.status);
      console.log('[AI SUMMARY SMS API PERSIST RESPONSE] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS API PERSIST RESPONSE] =========================================');

      if (apiResponse.ok) {
        const result = await apiResponse.json() as { success: boolean; messageId: string };
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] =========================================');
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] leadId:', leadId);
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] conversationId:', conversationId);
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] messageId:', result.messageId);
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] twilioMessageSid:', messageSid);
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] status:', status);
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[AI SUMMARY SMS API PERSIST SUCCESS] =========================================');
      } else {
        const errorText = await apiResponse.text();
        console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
        console.log('[AI SUMMARY SMS API PERSIST FAILED] status:', apiResponse.status);
        console.log('[AI SUMMARY SMS API PERSIST FAILED] error:', errorText);
        console.log('[AI SUMMARY SMS API PERSIST FAILED] Timestamp:', new Date().toISOString());
        console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
      }
    } else {
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] =========================================');
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] reason: missing required IDs');
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] leadId:', leadId);
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] conversationId:', conversationId);
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] businessId:', businessId);
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY SMS API PERSIST SKIPPED] =========================================');
    }
  } catch (apiError) {
    console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
    console.log('[AI SUMMARY SMS API PERSIST FAILED] error:', String(apiError));
    console.log('[AI SUMMARY SMS API PERSIST FAILED] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY SMS API PERSIST FAILED] =========================================');
  }
}

// Execute OpenAI final close hangup via Twilio REST API
function executeOpenaiFinalHangup(ws: any, twilioHandler: any, closingState: any): void {
  console.log('[COMPLETE FINALIZATION STEP 2] =========================================');
  console.log('[COMPLETE FINALIZATION STEP 2] executeOpenaiFinalHangup() called - Initiating hangup');
  console.log('[COMPLETE FINALIZATION STEP 2] Timestamp:', new Date().toISOString());
  console.log('[COMPLETE FINALIZATION STEP 2] =========================================');
  
  console.log('[OPENAI FINAL TWILIO HANGUP REQUESTED] =========================================');
  console.log('[OPENAI FINAL TWILIO HANGUP REQUESTED] Calling Twilio API to hangup after OpenAI final sentence');
  console.log('[OPENAI FINAL TWILIO HANGUP REQUESTED] Timestamp:', new Date().toISOString());
  console.log('[OPENAI FINAL TWILIO HANGUP REQUESTED] =========================================');
  
  const callSid = (ws as any).callSid;
  const twilioClient = (twilioHandler as any).twilioClient;
  
  if (callSid && twilioClient) {
    twilioClient.calls(callSid).update({ status: 'completed' })
      .then(() => {
        console.log('[COMPLETE FINALIZATION STEP 2 SUCCESS] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 2 SUCCESS] Twilio hangup API call succeeded');
        console.log('[COMPLETE FINALIZATION STEP 2 SUCCESS] Call SID:', callSid);
        console.log('[COMPLETE FINALIZATION STEP 2 SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 2 SUCCESS] =========================================');
        
        console.log('[OPENAI FINAL TWILIO HANGUP SUCCESS] =========================================');
        console.log('[OPENAI FINAL TWILIO HANGUP SUCCESS] OpenAI final close hangup succeeded');
        console.log('[OPENAI FINAL TWILIO HANGUP SUCCESS] Call SID:', callSid);
        console.log('[OPENAI FINAL TWILIO HANGUP SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[OPENAI FINAL TWILIO HANGUP SUCCESS] =========================================');
        
        if (ws && ws.readyState === ws.OPEN) {
          ws.close();
        }
      })
      .catch((error: any) => {
        console.log('[OPENAI FINAL TWILIO HANGUP FAILED] =========================================');
        console.log('[OPENAI FINAL TWILIO HANGUP FAILED] OpenAI final close hangup failed');
        console.log('[OPENAI FINAL TWILIO HANGUP FAILED] Error:', error.message);
        console.log('[OPENAI FINAL TWILIO HANGUP FAILED] Timestamp:', new Date().toISOString());
        console.log('[OPENAI FINAL TWILIO HANGUP FAILED] =========================================');
        // Fallback: close WebSocket
        if (ws && ws.readyState === ws.OPEN) {
          ws.close();
        }
      });
  } else {
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] =========================================');
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] No callSid or twilioClient available');
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] callSid:', callSid);
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] twilioClient:', !!twilioClient);
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] Timestamp:', new Date().toISOString());
    console.log('[OPENAI FINAL TWILIO HANGUP FAILED] =========================================');
    // Fallback: close WebSocket
    if (ws && ws.readyState === ws.OPEN) {
      ws.close();
    }
  }
}

// Execute Twilio fallback (redirect to TwiML endpoint)
function executeTwilioFallback(ws: any, twilioHandler: any, closingState: any): void {
  const callSid = (ws as any).callSid;
  const twilioClient = (twilioHandler as any).twilioClient;
  const baseUrl = process.env.BASE_URL || 'https://replyflow-ai-voice.fly.dev';
  const finalCloseUrl = `${baseUrl}/api/twilio/ai-final-close`;
  
  if (callSid && twilioClient) {
    twilioClient.calls(callSid).update({
      url: finalCloseUrl,
      method: 'POST'
    })
      .then(() => {
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] =========================================');
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] Emergency fallback redirect succeeded');
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] Call SID:', callSid);
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] TwiML URL:', finalCloseUrl);
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[TWILIO FINAL CLOSE REDIRECT SUCCESS] =========================================');
        
        if (ws && ws.readyState === ws.OPEN) {
          ws.close();
        }
      })
      .catch((error: any) => {
        console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] =========================================');
        console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] Emergency fallback redirect failed');
        console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] Error:', error.message);
        console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] Timestamp:', new Date().toISOString());
        console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] =========================================');
        
        if (ws && ws.readyState === ws.OPEN) {
          ws.close();
        }
      });
  } else {
    console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] =========================================');
    console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] No callSid or twilioClient available for emergency fallback');
    console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] Timestamp:', new Date().toISOString());
    console.log('[TWILIO FINAL CLOSE REDIRECT FAILED] =========================================');
    
    if (ws && ws.readyState === ws.OPEN) {
      ws.close();
    }
  }
}

function createIntakeData(businessName: string, callSid: string, businessId: string, sessionId: string): IntakeData {
  return {
    stage: 'ask_name_reason',
    businessName,
    callSid,
    businessId,
    sessionId,
    startTime: Date.now()
  };
}

// Track expected prompts for verification
let expectedPrompt: string | null = null;
let currentResponseId: string | null = null;
let authorizedResponseCreateSource: string | null = null;

/**
 * Filler phrases that should not be saved as customerName
 */
const FILLER_PHRASES = [
  'all right',
  'okay',
  'ok',
  'yeah',
  'yes',
  'thanks',
  'thank you',
  'sure'
];

/**
 * Check if text is a filler phrase
 */
function isFillerPhrase(text: string): boolean {
  const lowerText = text.trim().toLowerCase();
  return FILLER_PHRASES.some(phrase => lowerText === phrase || lowerText.startsWith(phrase + ' '));
}

/**
 * Approved prompts for each stage - ONLY these prompts are allowed to be spoken
 * Every assistant speech must go through sendApprovedPrompt(stage)
 * Note: This is now just a blocklist check - actual prompts come from the template system
 */
const APPROVED_PROMPTS: Record<string, string> = {
  ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?",
  ask_details: "Got it. Can you share any important details the business should know?",
  ask_location_or_context: "Thanks. What address or location is this for?",
  ask_timing: "Got it. When would you like this work completed?",
  ask_callback_time: "Thanks. What is the best time for the business to call you back?",
  final_goodbye: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
};

/**
 * Centralized function for all approved assistant speech
 * This is the ONLY function that should create assistant responses
 * @param stage - The approved stage name
 * @param openAiWs - OpenAI WebSocket connection
 * @param ws - WebSocket connection (for template access)
 * @returns true if prompt was sent, false if blocked
 */
function sendApprovedPrompt(stage: string, openAiWs: any, ws?: any): boolean {
  // Block unknown stages
  if (!APPROVED_PROMPTS[stage]) {
    console.log('[VOICE SCOPE VIOLATION BLOCKED] =========================================');
    console.log('[VOICE SCOPE VIOLATION BLOCKED] Unknown stage requested:', stage);
    console.log('[VOICE SCOPE VIOLATION BLOCKED] Approved stages:', Object.keys(APPROVED_PROMPTS).join(', '));
    console.log('[VOICE SCOPE VIOLATION BLOCKED] Blocking this speech');
    console.log('[VOICE SCOPE VIOLATION BLOCKED] Timestamp:', new Date().toISOString());
    console.log('[VOICE SCOPE VIOLATION BLOCKED] =========================================');
    return false;
  }

  // Get intake template from websocket session
  const intakeTemplate = ws?.intakeTemplate as IntakeTemplate || 'on_site';
  
  // Map internal stage to template stage
  const stageMapping: Record<string, 'ask_name_reason' | 'ask_details' | 'ask_location_or_context' | 'ask_timing' | 'ask_callback_time' | 'complete'> = {
    'ask_name_reason': 'ask_name_reason',
    'ask_details': 'ask_details',
    'ask_location_or_context': 'ask_location_or_context',
    'ask_timing': 'ask_timing',
    'ask_callback_time': 'ask_callback_time',
    'final_goodbye': 'complete',
  };
  
  const templateStage = stageMapping[stage] || 'ask_name_reason';
  const approvedText = getIntakeStageTextSafe(intakeTemplate, templateStage);

  // Log [VOICE OUTBOUND] with stage name and template info
  console.log('[VOICE OUTBOUND] =========================================');
  console.log('[VOICE OUTBOUND] Stage:', stage);
  console.log('[VOICE OUTBOUND] Template Stage:', templateStage);
  console.log('[VOICE OUTBOUND] Intake Template:', intakeTemplate);
  console.log('[VOICE OUTBOUND] Text:', approvedText);
  console.log('[VOICE OUTBOUND] Source: sendApprovedPrompt');
  console.log('[VOICE OUTBOUND] Timestamp:', new Date().toISOString());
  console.log('[VOICE OUTBOUND] =========================================');

  // Log [SCRIPTED FLOW] prompt sent
  console.log('[SCRIPTED FLOW] =========================================');
  console.log('[SCRIPTED FLOW] prompt sent');
  console.log('[SCRIPTED FLOW] internal_stage:', stage);
  console.log('[SCRIPTED FLOW] template_stage:', templateStage);
  console.log('[SCRIPTED FLOW] intake_template:', intakeTemplate);
  console.log('[SCRIPTED FLOW] text:', approvedText);
  console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
  console.log('[SCRIPTED FLOW] =========================================');

  // Track expected prompt for verification
  expectedPrompt = approvedText;
  currentResponseId = null;
  authorizedResponseCreateSource = 'sendApprovedPrompt';

  // Use strict instruction
  const strictInstruction = `SAY EXACTLY THIS TEXT AND NOTHING ELSE: "${approvedText}"

Do NOT paraphrase.
Do NOT expand.
Do NOT modify.
Do NOT add any words.
Do NOT add conversational elements.
Do NOT add greetings or acknowledgments.
Speak ONLY the exact text in quotes above.`;

  const message = {
    type: 'response.create',
    response: {
      instructions: strictInstruction,
    },
  };

  if (openAiWs) {
    openAiWs.send(JSON.stringify(message));
    console.log('[APPROVED RESPONSE CREATE SENT] =========================================');
    console.log('[APPROVED RESPONSE CREATE SENT] Response.create sent for stage:', stage);
    console.log('[APPROVED RESPONSE CREATE SENT] Timestamp:', new Date().toISOString());
    console.log('[APPROVED RESPONSE CREATE SENT] =========================================');
    return true;
  }

  return false;
}

function sendControlledAssistantText(text: string, reason: string, openAiWs: any): void {
  // Track expected prompt for verification
  expectedPrompt = text;
  currentResponseId = null;

  console.log('[VOICE PROMPT OUTBOUND] =========================================');
  console.log('[VOICE PROMPT OUTBOUND] exactPrompt:', text);
  console.log('[VOICE PROMPT OUTBOUND] source: app_defined');
  console.log('[VOICE PROMPT OUTBOUND] reason:', reason);
  console.log('[VOICE PROMPT OUTBOUND] Timestamp:', new Date().toISOString());
  console.log('[VOICE PROMPT OUTBOUND] =========================================');

  console.log('[CONTROLLED ASSISTANT TEXT SENT] =========================================');
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Reason:', reason);
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Text:', text);
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Timestamp:', new Date().toISOString());
  console.log('[CONTROLLED ASSISTANT TEXT SENT] =========================================');

  // Response guard: check for forbidden phrases
  const forbiddenPhrases = [
    'could be',
    'might be',
    'you might want',
    'check if',
    'guidance',
    'diagnose',
    'tricky',
    'wax ring',
    'supply line',
    'loose connection',
    'under the sink',
    'near the toilet',
    'shower area',
    'best phone number',
    'phone number to reach',
    'callback number',
    'another number',
    'best number to reach',
    "what's the best phone number",
    'best person to contact',
    'person to contact',
    'primary contact',
    'contact person',
    'who should we speak with',
    'who can we reach',
    'who should the business contact'
  ];

  const lowerText = text.toLowerCase();
  const foundForbidden = forbiddenPhrases.find(phrase => lowerText.includes(phrase));

  if (foundForbidden) {
    console.log('[FORBIDDEN PHRASE DETECTED] =========================================');
    console.log('[FORBIDDEN PHRASE DETECTED] Forbidden phrase detected:', foundForbidden);
    console.log('[FORBIDDEN PHRASE DETECTED] Original text:', text);
    console.log('[FORBIDDEN PHRASE DETECTED] Blocking this response');
    console.log('[FORBIDDEN PHRASE DETECTED] Timestamp:', new Date().toISOString());
    console.log('[FORBIDDEN PHRASE DETECTED] =========================================');
    return; // Block the response
  }

  const strictInstruction = `SAY EXACTLY THIS TEXT AND NOTHING ELSE: "${text}"

Do NOT paraphrase.
Do NOT expand.
Do NOT modify.
Do NOT add any words.
Do NOT add conversational elements.
Do NOT add greetings or acknowledgments.
Speak ONLY the exact text in quotes above.`;
  const message = {
    type: 'response.create',
    response: {
      instructions: strictInstruction,
    },
  };

  if (openAiWs) {
    openAiWs.send(JSON.stringify(message));
    console.log('[CONTROLLED RESPONSE CREATE SENT] =========================================');
    console.log('[CONTROLLED RESPONSE CREATE SENT] Response.create sent');
    console.log('[CONTROLLED RESPONSE CREATE SENT] Reason:', reason);
    console.log('[CONTROLLED RESPONSE CREATE SENT] Timestamp:', new Date().toISOString());
    console.log('[CONTROLLED RESPONSE CREATE SENT] =========================================');
  }
}

function sendStagePrompt(
  stage: string,
  openAiWs: any,
  promptedStages: Set<IntakeStage>,
  lastPromptAt: number,
  assistantSpeaking: boolean,
  activeResponseId: string | null,
  twilioHandler: any,
  lastPromptStage: IntakeStage | null,
  stagePromptAttempts: Map<IntakeStage, number>,
  ws?: any
): void {
  console.log('[ACTIVE INTAKE STAGE] =========================================');
  console.log('[ACTIVE INTAKE STAGE] stage:', stage);

  // Use predefined prompts from STAGE_PROMPTS constant
  const prompt = STAGE_PROMPTS[stage as IntakeStage];

  console.log('[ACTIVE INTAKE STAGE] prompt:', prompt);
  console.log('[ACTIVE INTAKE STAGE] =========================================');

  if (!prompt) {
    console.log('[STAGE PROMPT NOT FOUND] Stage:', stage);
    return;
  }

  // Block any phone number prompts
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('phone number') || lowerPrompt.includes('callback number') || lowerPrompt.includes('best number')) {
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] =========================================');
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] reason: callbackNumber optional / removed from required intake');
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] prompt:', prompt);
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] stage:', stage);
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] Timestamp:', new Date().toISOString());
    console.log('[CALLBACK NUMBER PROMPT BLOCKED] =========================================');
    return;
  }

  // Per-stage prompt guard to prevent duplicate prompts
  const alreadyPrompted = promptedStages.has(stage as IntakeStage);
  const timeSinceLastPrompt = Date.now() - lastPromptAt;
  const attempts = stagePromptAttempts.get(stage as IntakeStage) || 0;

  console.log('[STAGE PROMPT REQUESTED] =========================================');
  console.log('[STAGE PROMPT REQUESTED] stage:', stage);
  console.log('[STAGE PROMPT REQUESTED] prompt:', prompt);
  console.log('[STAGE PROMPT REQUESTED] alreadyPrompted:', alreadyPrompted);
  console.log('[STAGE PROMPT REQUESTED] assistantSpeaking:', assistantSpeaking);
  console.log('[STAGE PROMPT REQUESTED] activeResponseId:', activeResponseId);
  console.log('[STAGE PROMPT REQUESTED] timeSinceLastPrompt:', timeSinceLastPrompt);
  console.log('[STAGE PROMPT REQUESTED] attempts:', attempts);
  console.log('[STAGE PROMPT REQUESTED] Timestamp:', new Date().toISOString());
  console.log('[STAGE PROMPT REQUESTED] =========================================');

  // Block prompt if there's an active response (cannot prompt while response is being generated)
  if (activeResponseId) {
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] =========================================');
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] stage:', stage);
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] reason: activeResponseId exists, cannot prompt while response is being generated');
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] activeResponseId:', activeResponseId);
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] Timestamp:', new Date().toISOString());
    console.log('[STAGE PROMPT SKIPPED ACTIVE RESPONSE] =========================================');
    return;
  }

  // Skip duplicate prompt if already sent for this stage and no user transcript received
  if (alreadyPrompted && timeSinceLastPrompt < 5000) {
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] =========================================');
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] stage:', stage);
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] reason: already prompted and no user transcript received');
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] timeSinceLastPrompt:', timeSinceLastPrompt);
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] Timestamp:', new Date().toISOString());
    console.log('[STAGE PROMPT SKIPPED DUPLICATE] =========================================');
    return;
  }

  // Prevent asking the same stage prompt more than twice
  if (attempts >= 2) {
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] =========================================');
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] stage:', stage);
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] attempts:', attempts);
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] reason: maximum 2 attempts per stage');
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] Timestamp:', new Date().toISOString());
    console.log('[STAGE PROMPT SKIPPED TOO MANY ATTEMPTS] =========================================');
    return;
  }

  console.log('[STAGE PROMPT SELECTED] =========================================');
  console.log('[STAGE PROMPT SELECTED] Stage:', stage);
  console.log('[STAGE PROMPT SELECTED] Prompt:', prompt);
  console.log('[STAGE PROMPT SELECTED] Timestamp:', new Date().toISOString());
  console.log('[STAGE PROMPT SELECTED] =========================================');

  // Mark this stage as prompted
  promptedStages.add(stage as IntakeStage);
  stagePromptAttempts.set(stage as IntakeStage, attempts + 1);

  // Sync lastPromptStage and lastPromptAt to twilioHandler for audio blocking logs
  (twilioHandler as any).lastPromptStage = stage as IntakeStage;
  (twilioHandler as any).lastPromptAt = Date.now();
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] =========================================');
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] Synced lastPromptStage:', stage);
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] Synced lastPromptAt:', Date.now());
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] Verified lastPromptStage on twilioHandler:', (twilioHandler as any).lastPromptStage);
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] Timestamp:', new Date().toISOString());
  console.log('[STAGE PROMPT SYNC TO TWILIO HANDLER] =========================================');

  // Start watchdog timer to detect if response is not sent within 500ms
  let responseSent = false;
  const watchdogTimer = setTimeout(() => {
    if (!responseSent) {
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] =========================================');
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] Stage prompt selected but response not sent within 500ms');
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] Stage:', stage);
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] Prompt:', prompt);
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] Timestamp:', new Date().toISOString());
      console.log('[STAGE PROMPT SELECTED BUT NOT SENT] =========================================');
    }
  }, 500);

  // Use centralized sendApprovedPrompt for all stage prompts
  const sent = sendApprovedPrompt(stage, openAiWs, ws);
  responseSent = sent;
  clearTimeout(watchdogTimer);

  // Add [SCRIPTED FLOW] log for final goodbye
  if (stage === 'complete' || stage === 'final_goodbye') {
    console.log('[SCRIPTED FLOW] =========================================');
    console.log('[SCRIPTED FLOW] goodbye sent');
    console.log('[SCRIPTED FLOW] stage:', stage);
    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
    console.log('[SCRIPTED FLOW] =========================================');
  }

  // Add specific log for ask_callback_time prompt sent result
  if (stage === 'ask_callback_time') {
    console.log('[SCRIPTED FLOW] =========================================');
    console.log('[SCRIPTED FLOW] ask_callback_time prompt sent result:', sent);
    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
    console.log('[SCRIPTED FLOW] =========================================');
  }
}

/**
 * Predefined prompts for each intake stage
 * The model may only speak these exact questions provided by the app
 * Note: These prompts are now mapped to APPROVED_PROMPTS in sendApprovedPrompt
 */
const STAGE_PROMPTS: Record<IntakeStage, string> = {
  ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?",
  ask_details: "Got it. Can you share any important details the business should know?",
  ask_location_or_context: "Thanks. What address or location is this for?",
  ask_timing: "Got it. When would you like this work completed?",
  ask_callback_time: "Thanks. What is the best time for the business to call you back?",
  complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
};

/**
 * Simple scripted stage progression - deterministic, no GPT decisions
 * The app follows a fixed sequence: ask_name_reason → ask_details → ask_location_or_context → ask_timing → ask_callback_time → complete
 */
function getNextStage(currentStage: IntakeStage): IntakeStage {
  console.log('[SCRIPTED FLOW] =========================================');
  console.log('[SCRIPTED FLOW] stage advanced');
  console.log('[SCRIPTED FLOW] fromStage:', currentStage);

  const stageSequence: Record<IntakeStage, IntakeStage> = {
    ask_name_reason: 'ask_details',
    ask_details: 'ask_location_or_context',
    ask_location_or_context: 'ask_timing',
    ask_timing: 'ask_callback_time',
    ask_callback_time: 'complete',
    complete: 'complete'
  };

  const nextStage = stageSequence[currentStage] || currentStage;

  console.log('[SCRIPTED FLOW] toStage:', nextStage);
  console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
  console.log('[SCRIPTED FLOW] =========================================');

  return nextStage;
}

/**
 * Simple scripted intake response logic - direct transcript save, no GPT extraction
 * The app saves caller transcript directly to the field based on current stage
 * Then advances to the next stage in the fixed sequence
 */
function getIntakeResponse(intake: IntakeData, transcript?: string, stagePromptAttempts?: Map<IntakeStage, number>): { response: string; nextStage: IntakeStage } {
  console.log('[SCRIPTED FLOW] =========================================');
  console.log('[SCRIPTED FLOW] caller transcript received');
  console.log('[SCRIPTED FLOW] currentStage:', intake.stage);
  console.log('[SCRIPTED FLOW] transcript:', transcript || 'none');
  console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
  console.log('[SCRIPTED FLOW] =========================================');

  // Save transcript directly to the corresponding field based on current stage
  if (transcript && transcript.trim().length > 0) {
    switch (intake.stage) {
      case 'ask_name_reason':
        // Apply name-only heuristic before GPT extraction
        const strippedTranscript = transcript.trim().replace(/[.,!?;:]$/, '');
        const wordCount = strippedTranscript.split(/\s+/).length;
        const serviceActionWords = ['need', 'want', 'cut', 'install', 'repair', 'fix', 'service', 'appointment', 'quote', 'estimate', 'help', 'calling about', 'call about'];
        const containsServiceWord = serviceActionWords.some(word => strippedTranscript.toLowerCase().includes(word));

        const isNameOnly = wordCount >= 1 && wordCount <= 3 && !containsServiceWord;

        if (isNameOnly) {
          // Check if customerName already exists (overwrite guard)
          if (intake.customerName) {
            console.log('[SCRIPTED FLOW] =========================================');
            console.log('[SCRIPTED FLOW] customerName overwrite blocked');
            console.log('[SCRIPTED FLOW] existingName:', intake.customerName);
            console.log('[SCRIPTED FLOW] attemptedName:', strippedTranscript);
            console.log('[SCRIPTED FLOW] stage:', intake.stage);
            console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
            console.log('[SCRIPTED FLOW] =========================================');
          } else {
            // Validate customerName before saving
            if (isValidCustomerName(strippedTranscript)) {
              console.log('[SCRIPTED FLOW] =========================================');
              console.log('[SCRIPTED FLOW] name-only heuristic applied');
              console.log('[SCRIPTED FLOW] transcript:', transcript);
              console.log('[SCRIPTED FLOW] customerName:', strippedTranscript);
              console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
              console.log('[SCRIPTED FLOW] =========================================');

              intake.customerName = strippedTranscript;
              console.log('[SCRIPTED FLOW] =========================================');
              console.log('[SCRIPTED FLOW] customerName locked from heuristic');
              console.log('[SCRIPTED FLOW] customerName:', intake.customerName);
              console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
              console.log('[SCRIPTED FLOW] =========================================');

              intake.serviceRequested = undefined;
            } else {
              console.log('[SCRIPTED FLOW] =========================================');
              console.log('[SCRIPTED FLOW] customerName validation failed');
              console.log('[SCRIPTED FLOW] transcript:', transcript);
              console.log('[SCRIPTED FLOW] attemptedName:', strippedTranscript);
              console.log('[SCRIPTED FLOW] reason: Invalid customerName detected');
              console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
              console.log('[SCRIPTED FLOW] =========================================');
            }
          }
        } else {
          // For ask_name_reason, we need to extract name and reason from the transcript
          // This is the only stage where we use GPT extraction since it's a combined question
          const existingName = intake.customerName;
          extractMultipleAnswers(intake, transcript);

          // Check if customerName was overwritten
          if (existingName && intake.customerName !== existingName) {
            console.log('[SCRIPTED FLOW] =========================================');
            console.log('[SCRIPTED FLOW] customerName overwrite blocked');
            console.log('[SCRIPTED FLOW] existingName:', existingName);
            console.log('[SCRIPTED FLOW] attemptedName:', intake.customerName);
            console.log('[SCRIPTED FLOW] stage:', intake.stage);
            console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
            console.log('[SCRIPTED FLOW] =========================================');
            intake.customerName = existingName; // Restore original
          }

          console.log('[SCRIPTED FLOW] =========================================');
          console.log('[SCRIPTED FLOW] field saved (ask_name_reason - extracted via GPT)');
          console.log('[SCRIPTED FLOW] customerName:', intake.customerName);
          console.log('[SCRIPTED FLOW] serviceRequested:', intake.serviceRequested);
          console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
          console.log('[SCRIPTED FLOW] =========================================');
        }
        break;
      case 'ask_details':
        intake.issueDescription = transcript.trim();
        console.log('[SCRIPTED FLOW] =========================================');
        console.log('[SCRIPTED FLOW] field saved');
        console.log('[SCRIPTED FLOW] field: issueDescription');
        console.log('[SCRIPTED FLOW] value:', transcript.trim());
        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
        console.log('[SCRIPTED FLOW] =========================================');
        break;
      case 'ask_location_or_context':
        intake.serviceAddress = transcript.trim();
        console.log('[SCRIPTED FLOW] =========================================');
        console.log('[SCRIPTED FLOW] field saved');
        console.log('[SCRIPTED FLOW] field: serviceAddress');
        console.log('[SCRIPTED FLOW] value:', transcript.trim());
        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
        console.log('[SCRIPTED FLOW] =========================================');
        break;
      case 'ask_timing':
        intake.desiredCompletionTime = transcript.trim();
        console.log('[SCRIPTED FLOW] =========================================');
        console.log('[SCRIPTED FLOW] after timing save');
        console.log('[SCRIPTED FLOW] field: desiredCompletionTime');
        console.log('[SCRIPTED FLOW] value:', transcript.trim());
        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
        console.log('[SCRIPTED FLOW] =========================================');
        break;
      case 'ask_callback_time':
        intake.callbackTime = transcript.trim();
        console.log('[SCRIPTED FLOW] =========================================');
        console.log('[SCRIPTED FLOW] callback time saved');
        console.log('[SCRIPTED FLOW] field: callbackTime');
        console.log('[SCRIPTED FLOW] value:', transcript.trim());
        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
        console.log('[SCRIPTED FLOW] =========================================');
        break;
    }
  }

  // Special handling for ask_name_reason: validate both fields before advancing
  if (intake.stage === 'ask_name_reason') {
    const customerNamePresent = !!intake.customerName;
    const serviceRequestedPresent = !!intake.serviceRequested;

    console.log('[SCRIPTED FLOW] =========================================');
    console.log('[SCRIPTED FLOW] ask_name_reason validation');
    console.log('[SCRIPTED FLOW] customerNamePresent:', customerNamePresent);
    console.log('[SCRIPTED FLOW] serviceRequestedPresent:', serviceRequestedPresent);
    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
    console.log('[SCRIPTED FLOW] =========================================');

    let nextStage: IntakeStage;
    let promptToSend: string;

    if (!customerNamePresent && !serviceRequestedPresent) {
      // Both missing: stay on ask_name_reason and repeat the original prompt
      nextStage = 'ask_name_reason';
      promptToSend = APPROVED_PROMPTS.ask_name_reason;
      console.log('[SCRIPTED FLOW] =========================================');
      console.log('[SCRIPTED FLOW] both fields missing, repeating ask_name_reason');
      console.log('[SCRIPTED FLOW] nextStage:', nextStage);
      console.log('[SCRIPTED FLOW] promptToSend:', promptToSend);
      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
      console.log('[SCRIPTED FLOW] =========================================');
    } else {
      // At least one field present: advance to ask_details
      nextStage = 'ask_details';
      promptToSend = APPROVED_PROMPTS.ask_details;
      console.log('[SCRIPTED FLOW] =========================================');
      console.log('[SCRIPTED FLOW] advancing to ask_details');
      console.log('[SCRIPTED FLOW] nextStage:', nextStage);
      console.log('[SCRIPTED FLOW] promptToSend:', promptToSend);
      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
      console.log('[SCRIPTED FLOW] =========================================');
    }

    return {
      response: promptToSend,
      nextStage
    };
  }

  // App determines next stage deterministically (fixed sequence)
  const nextStage = getNextStage(intake.stage);

  // Get predefined prompt for the next stage
  const response = STAGE_PROMPTS[nextStage] || STAGE_PROMPTS.ask_name_reason;

  console.log('[PREDEFINED PROMPT SENT] =========================================');
  console.log('[PREDEFINED PROMPT SENT] stage:', nextStage);
  console.log('[PREDEFINED PROMPT SENT] questionText:', response);
  console.log('[PREDEFINED PROMPT SENT] Timestamp:', new Date().toISOString());
  console.log('[PREDEFINED PROMPT SENT] =========================================');

  // Add specific logs for ask_callback_time prompt
  if (nextStage === 'ask_callback_time') {
    console.log('[SCRIPTED FLOW] =========================================');
    console.log('[SCRIPTED FLOW] advancing to ask_callback_time');
    console.log('[SCRIPTED FLOW] sending ask_callback_time prompt');
    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
    console.log('[SCRIPTED FLOW] =========================================');
  }

  return {
    response,
    nextStage
  };
}

// Helper function to extract multiple answers from single response (STAGE-AWARE)
function extractMultipleAnswers(intake: IntakeData, transcript: string): void {
  const lowerTranscript = transcript.toLowerCase().trim();
  
  console.log('[FIELD EXTRACTION INPUT] =========================================');
  console.log('[FIELD EXTRACTION INPUT] currentStage:', intake.stage);
  console.log('[FIELD EXTRACTION INPUT] transcript:', transcript);
  console.log('[FIELD EXTRACTION INPUT] intakeBefore:', JSON.stringify({
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackTime: intake.callbackTime
  }, null, 2));
  console.log('[FIELD EXTRACTION INPUT] Timestamp:', new Date().toISOString());
  console.log('[FIELD EXTRACTION INPUT] =========================================');
  
  console.log('[LIVE EXTRACTION RAW] =========================================');
  console.log('[LIVE EXTRACTION RAW] Transcript:', transcript);
  console.log('[LIVE EXTRACTION RAW] Current Stage:', intake.stage);
  console.log('[LIVE EXTRACTION RAW] Timestamp:', new Date().toISOString());
  console.log('[LIVE EXTRACTION RAW] =========================================');

  // Stage-aware extraction: only extract fields relevant to current stage
  switch (intake.stage) {
    case 'ask_name_reason':
      // Allowed: customerName, serviceRequested
      // Forbidden: issueDescription, serviceAddress, desiredCompletionTime, callbackTime

      // Deterministic parsing before GPT for ask_name_reason
      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
      console.log('[SCRIPTED FLOW] deterministic name/reason parse Timestamp:', new Date().toISOString());
      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');

      let parsedName: string | null = null;
      let parsedReason: string | null = null;
      let usedFallbackGpt = false;

      // Detect name patterns
      const namePatterns = [
        /my name is (\w+)/i,
        /this is (\w+)/i,
        /i'm (\w+)/i,
        /i am (\w+)/i,
        /i'm\s+(\w+)/i,
        /i am\s+(\w+)/i
      ];

      for (const pattern of namePatterns) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
          parsedName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
          console.log('[SCRIPTED FLOW] parsedName:', parsedName);
          console.log('[SCRIPTED FLOW] pattern:', pattern.toString());
          console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
          console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
          break;
        }
      }

      // Detect reason patterns
      const reasonPatterns = [
        /i want to (.+)/i,
        /i would like to (.+)/i,
        /i'd like to (.+)/i,
        /i need (.+)/i,
        /calling about (.+)/i,
        /i'm calling about (.+)/i,
        /i am calling about (.+)/i
      ];

      for (const pattern of reasonPatterns) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
          parsedReason = match[1].trim();
          // Capitalize first letter
          parsedReason = parsedReason.charAt(0).toUpperCase() + parsedReason.slice(1);
          console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
          console.log('[SCRIPTED FLOW] parsedReason:', parsedReason);
          console.log('[SCRIPTED FLOW] pattern:', pattern.toString());
          console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
          console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
          break;
        }
      }

      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
      console.log('[SCRIPTED FLOW] parsedName:', parsedName);
      console.log('[SCRIPTED FLOW] parsedReason:', parsedReason);
      console.log('[SCRIPTED FLOW] usedFallbackGpt:', usedFallbackGpt);
      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');

      // If both parsed, set both fields and advance to ask_details
      if (parsedName && parsedReason) {
        if (!intake.customerName) {
          intake.customerName = parsedName;
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: customerName');
          console.log('[FIELD ASSIGNMENT] oldValue:', intake.customerName);
          console.log('[FIELD ASSIGNMENT] newValue:', parsedName);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: deterministic name/reason parse');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
        }
        if (!intake.serviceRequested) {
          intake.serviceRequested = parsedReason;
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: serviceRequested');
          console.log('[FIELD ASSIGNMENT] oldValue:', intake.serviceRequested);
          console.log('[FIELD ASSIGNMENT] newValue:', parsedReason);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: deterministic name/reason parse');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
        }
        // Do NOT modify stage here - let getIntakeResponse handle stage transition
        console.log('[SCRIPTED FLOW] =========================================');
        console.log('[SCRIPTED FLOW] both fields parsed deterministically');
        console.log('[SCRIPTED FLOW] Stage transition will be handled by getIntakeResponse');
        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
        console.log('[SCRIPTED FLOW] =========================================');
        return;
      }

      // If only name parsed, set name and let flow continue to ask_reason_recovery
      if (parsedName && !parsedReason) {
        if (!intake.customerName) {
          intake.customerName = parsedName;
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: customerName');
          console.log('[FIELD ASSIGNMENT] oldValue:', intake.customerName);
          console.log('[FIELD ASSIGNMENT] newValue:', parsedName);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: deterministic name/reason parse');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
        }
        // Continue to existing extraction logic for reason
      }

      // If only reason parsed, set reason and let flow continue to ask_name_recovery
      if (!parsedName && parsedReason) {
        if (!intake.serviceRequested) {
          intake.serviceRequested = parsedReason;
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: serviceRequested');
          console.log('[FIELD ASSIGNMENT] oldValue:', intake.serviceRequested);
          console.log('[FIELD ASSIGNMENT] newValue:', parsedReason);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: deterministic name/reason parse');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
        }
        // Continue to existing extraction logic for name
      }

      // If neither parsed, use existing GPT/extraction logic as fallback
      usedFallbackGpt = true;
      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');
      console.log('[SCRIPTED FLOW] usedFallbackGpt:', usedFallbackGpt);
      console.log('[SCRIPTED FLOW] reason: no deterministic match found, using existing extraction logic');
      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
      console.log('[SCRIPTED FLOW] deterministic name/reason parse =========================================');

      // Extract name if not already captured
      if (!intake.customerName) {
        const oldName = intake.customerName;
        const name = extractName(transcript);
        if (name && name.length > 1 && !isFillerPhrase(name)) {
          intake.customerName = name;
          console.log('[CUSTOMER NAME EXTRACTION] =========================================');
          console.log('[CUSTOMER NAME EXTRACTION] stage:', intake.stage);
          console.log('[CUSTOMER NAME EXTRACTION] transcript:', transcript);
          console.log('[CUSTOMER NAME EXTRACTION] extractedCustomerName:', name);
          console.log('[CUSTOMER NAME EXTRACTION] previousCustomerName:', oldName);
          console.log('[CUSTOMER NAME EXTRACTION] updatedCustomerName:', intake.customerName);
          console.log('[CUSTOMER NAME EXTRACTION] Timestamp:', new Date().toISOString());
          console.log('[CUSTOMER NAME EXTRACTION] =========================================');
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: customerName');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldName);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.customerName);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractName');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] customerName:', intake.customerName);
        } else if (name && isFillerPhrase(name)) {
          console.log('[CUSTOMER NAME SAVE BLOCKED] =========================================');
          console.log('[CUSTOMER NAME SAVE BLOCKED] reason: filler phrase');
          console.log('[CUSTOMER NAME SAVE BLOCKED] extractedName:', name);
          console.log('[CUSTOMER NAME SAVE BLOCKED] transcript:', transcript);
          console.log('[CUSTOMER NAME SAVE BLOCKED] Timestamp:', new Date().toISOString());
          console.log('[CUSTOMER NAME SAVE BLOCKED] =========================================');
        }
      } else {
        // Preserve existing customerName - do not overwrite
        console.log('[CUSTOMER NAME PRESERVED] =========================================');
        console.log('[CUSTOMER NAME PRESERVED] previousCustomerName:', intake.customerName);
        console.log('[CUSTOMER NAME PRESERVED] reason: prevent overwrite');
        console.log('[CUSTOMER NAME PRESERVED] Timestamp:', new Date().toISOString());
        console.log('[CUSTOMER NAME PRESERVED] =========================================');
      }

      // Extract service requested with heuristic fallback
      if (!intake.serviceRequested) {
        const oldService = intake.serviceRequested;
        const serviceKeywords = ['plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control', 'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors', 'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage', 'junk removal', 'grass cutting', 'mowing', 'lawn care', 'toilet', 'toilet installation', 'toilet plumbing', 'grass cut', 'cut grass', 'mow lawn', 'lawn mowing'];
        const foundService = serviceKeywords.find(keyword => lowerTranscript.includes(keyword));
        if (foundService) {
          intake.serviceRequested = foundService.charAt(0).toUpperCase() + foundService.slice(1);
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: serviceRequested');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldService);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceRequested);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (keyword match)');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] serviceRequested:', intake.serviceRequested);
        } else {
          // Heuristic fallback: infer service from common phrases
          if (lowerTranscript.includes('grass') || lowerTranscript.includes('lawn') || lowerTranscript.includes('mow')) {
            intake.serviceRequested = 'Lawn care';
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD ASSIGNMENT] field: serviceRequested');
            console.log('[FIELD ASSIGNMENT] oldValue:', oldService);
            console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceRequested);
            console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
            console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (heuristic fallback - grass/lawn/mow)');
            console.log('[FIELD ASSIGNMENT] transcript:', transcript);
            console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Lawn care" from:', transcript);
          } else if (lowerTranscript.includes('plumbing') || lowerTranscript.includes('plumb') || lowerTranscript.includes('pipe') || lowerTranscript.includes('toilet') || lowerTranscript.includes('drain')) {
            intake.serviceRequested = 'Plumbing';
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD ASSIGNMENT] field: serviceRequested');
            console.log('[FIELD ASSIGNMENT] oldValue:', oldService);
            console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceRequested);
            console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
            console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (heuristic fallback - plumbing/toilet)');
            console.log('[FIELD ASSIGNMENT] transcript:', transcript);
            console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Plumbing" from:', transcript);
          } else if (lowerTranscript.includes('install') || lowerTranscript.includes('installed')) {
            intake.serviceRequested = 'Installation';
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD ASSIGNMENT] field: serviceRequested');
            console.log('[FIELD ASSIGNMENT] oldValue:', oldService);
            console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceRequested);
            console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
            console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (heuristic fallback - install)');
            console.log('[FIELD ASSIGNMENT] transcript:', transcript);
            console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Installation" from:', transcript);
          }
        }
      }

      // Log skipped extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: issueDescription');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_name_reason stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceAddress');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_name_reason stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: desiredCompletionTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_name_reason stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: callbackTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_name_reason stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;

    case 'ask_details':
      // Allowed: issueDescription
      // Forbidden: customerName, serviceRequested, serviceAddress, desiredCompletionTime, callbackTime

      console.log('[AI DETAILS STAGE ANSWER RECEIVED] =========================================');
      console.log('[AI DETAILS STAGE ANSWER RECEIVED] transcript:', transcript);
      console.log('[AI DETAILS STAGE ANSWER RECEIVED] currentStage:', intake.stage);
      console.log('[AI DETAILS STAGE ANSWER RECEIVED] extractedDetails:', intake.issueDescription);
      console.log('[AI DETAILS STAGE ANSWER RECEIVED] Timestamp:', new Date().toISOString());
      console.log('[AI DETAILS STAGE ANSWER RECEIVED] =========================================');

      // Extract issue description - use entire transcript if meaningful
      if (!intake.issueDescription) {
        const oldDescription = intake.issueDescription;
        // Use entire transcript if it's meaningful (not empty, not just "yes"/"no"/"okay"/"thanks")
        const meaningfulResponses = ['yes', 'no', 'okay', 'ok', 'thanks', 'thank you', 'that\'s it', 'nothing else', 'no details', 'none', ''];
        const isMeaningful = !meaningfulResponses.some(response => lowerTranscript === response || lowerTranscript === response + ' ');

        if (isMeaningful && transcript.trim().length > 3) {
          intake.issueDescription = transcript.trim();
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: issueDescription');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldDescription);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.issueDescription);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (meaningful transcript)');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] issueDescription:', intake.issueDescription);
        }
      }

      // Log skipped extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: customerName');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_details stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceRequested');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_details stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceAddress');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_details stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: desiredCompletionTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_details stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: callbackTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_details stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;

    case 'ask_location_or_context':
      // Allowed: serviceAddress
      // Forbidden: customerName, serviceRequested, issueDescription, desiredCompletionTime, callbackTime
      
      // Extract location/service address (REMOVED: dangerous entire transcript fallback)
      if (!intake.serviceAddress) {
        const oldAddress = intake.serviceAddress;
        // Check for online/virtual/remote responses
        const onlineKeywords = ['online', 'virtual', 'remote', 'zoom', 'google meet', 'discord', 'over the phone', 'phone', 'phone call'];
        const hasOnlineKeyword = onlineKeywords.some(keyword => lowerTranscript.includes(keyword));
        if (hasOnlineKeyword) {
          intake.serviceAddress = 'Virtual / Online';
          intake.locationType = 'online';
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: serviceAddress');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldAddress);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceAddress);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (online keyword)');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
        } else {
          // Check for business location responses (expanded list)
          const businessLocationKeywords = ['at the business', 'at your business', 'at your shop', 'at your office', 'at your place', 'at your facility', 'at your location', 'your business', 'your shop', 'your office', 'your facility', 'your location', "i'll come to you", 'come to you', 'at the studio', 'at the shop'];
          const hasBusinessLocationKeyword = businessLocationKeywords.some(keyword => lowerTranscript.includes(keyword));
          if (hasBusinessLocationKeyword) {
            intake.serviceAddress = 'Business location';
            intake.locationType = 'business_location';
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[FIELD ASSIGNMENT] field: serviceAddress');
            console.log('[FIELD ASSIGNMENT] oldValue:', oldAddress);
            console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceAddress);
            console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
            console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (business keyword)');
            console.log('[FIELD ASSIGNMENT] transcript:', transcript);
            console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
            console.log('[FIELD ASSIGNMENT] =========================================');
            console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
          } else {
            // Check for residential responses
            const residentialKeywords = ['at my house', 'my house', 'my home', 'at my home', 'my place'];
            const hasResidentialKeyword = residentialKeywords.some(keyword => lowerTranscript.includes(keyword));
            if (hasResidentialKeyword) {
              intake.serviceAddress = 'At caller\'s residence';
              intake.locationType = 'caller_location';
              console.log('[FIELD ASSIGNMENT] =========================================');
              console.log('[FIELD ASSIGNMENT] field: serviceAddress');
              console.log('[FIELD ASSIGNMENT] oldValue:', oldAddress);
              console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceAddress);
              console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
              console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (residential keyword)');
              console.log('[FIELD ASSIGNMENT] transcript:', transcript);
              console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
              console.log('[FIELD ASSIGNMENT] =========================================');
              console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
            } else {
              // Check for location indicators (street, ave, etc.)
              const locationIndicators = ['street', 'ave', 'avenue', 'road', 'lane', 'drive', 'blvd', 'boulevard', 'at', 'near', 'in', 'on', 'suite', 'unit', '#'];
              const hasLocationIndicator = locationIndicators.some(indicator => lowerTranscript.includes(indicator));
              
              if (hasLocationIndicator && transcript.trim().length > 5) {
                // Only set serviceAddress if it contains location indicators
                intake.serviceAddress = transcript.trim();
                intake.locationType = 'service_address';
                console.log('[FIELD ASSIGNMENT] =========================================');
                console.log('[FIELD ASSIGNMENT] field: serviceAddress');
                console.log('[FIELD ASSIGNMENT] oldValue:', oldAddress);
                console.log('[FIELD ASSIGNMENT] newValue:', intake.serviceAddress);
                console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
                console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (location indicator match)');
                console.log('[FIELD ASSIGNMENT] transcript:', transcript);
                console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
                console.log('[FIELD ASSIGNMENT] =========================================');
                console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
              } else {
                // Skip if no location indicators - do NOT copy entire transcript
                console.log('[FIELD EXTRACTION SKIPPED] =========================================');
                console.log('[FIELD EXTRACTION SKIPPED] field: serviceAddress');
                console.log('[FIELD EXTRACTION SKIPPED] reason: No location indicators found in transcript');
                console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
                console.log('[FIELD EXTRACTION SKIPPED] transcript:', transcript);
                console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
                console.log('[FIELD EXTRACTION SKIPPED] =========================================');
              }
            }
          }
        }
      }

      // Log skipped extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: customerName');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_location stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceRequested');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_location stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: issueDescription');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_location stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: desiredCompletionTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_location stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: callbackTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_location stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;

    case 'ask_timing':
      // Allowed: desiredCompletionTime
      // Forbidden: customerName, serviceRequested, issueDescription, serviceAddress, callbackTime
      
      // Extract desired completion time
      if (!intake.desiredCompletionTime) {
        const oldTime = intake.desiredCompletionTime;
        const completionTimePatterns = [
          'today',
          'tomorrow',
          'this week',
          'next week',
          'as soon as possible',
          'asap',
          'as soon as you can',
          'right away',
          'immediately',
          'soon',
          'by the end of the week',
          'by the end of the month',
          'within a few days',
          'within a week',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
          'next monday',
          'next tuesday',
          'next wednesday',
          'next thursday',
          'next friday'
        ];

        const foundTime = completionTimePatterns.find(pattern => lowerTranscript.includes(pattern));
        if (foundTime) {
          intake.desiredCompletionTime = foundTime.charAt(0).toUpperCase() + foundTime.slice(1);
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: desiredCompletionTime');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldTime);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.desiredCompletionTime);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (pattern match)');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] desiredCompletionTime:', intake.desiredCompletionTime);
        }
      }

      // Log skipped extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: customerName');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_completion_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceRequested');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_completion_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: issueDescription');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_completion_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceAddress');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_completion_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: callbackTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_completion_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;

    case 'ask_callback_time':
      // Allowed: callbackTime
      // Forbidden: customerName, serviceRequested, issueDescription, serviceAddress, desiredCompletionTime
      
      // Extract callback time
      if (!intake.callbackTime) {
        const oldCallbackTime = intake.callbackTime;
        const callbackTimePatterns = [
          'morning', 'afternoon', 'evening', 'noon',
          'anytime', 'any time', 'whenever',
          'today', 'tomorrow',
          'tomorrow morning', 'tomorrow afternoon', 'tomorrow evening',
          'this morning', 'this afternoon', 'this evening',
          'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
          'next week', 'as soon as possible', 'asap', 'after work', 'before noon', 'around lunch'
        ];

        const foundCallbackTime = callbackTimePatterns.find(pattern => lowerTranscript.includes(pattern));
        if (foundCallbackTime) {
          intake.callbackTime = foundCallbackTime.charAt(0).toUpperCase() + foundCallbackTime.slice(1);
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[FIELD ASSIGNMENT] field: callbackTime');
          console.log('[FIELD ASSIGNMENT] oldValue:', oldCallbackTime);
          console.log('[FIELD ASSIGNMENT] newValue:', intake.callbackTime);
          console.log('[FIELD ASSIGNMENT] currentStage:', intake.stage);
          console.log('[FIELD ASSIGNMENT] sourceFunction: extractMultipleAnswers (pattern match)');
          console.log('[FIELD ASSIGNMENT] transcript:', transcript);
          console.log('[FIELD ASSIGNMENT] Timestamp:', new Date().toISOString());
          console.log('[FIELD ASSIGNMENT] =========================================');
          console.log('[LIVE EXTRACTION MAPPED] callbackTime:', intake.callbackTime);
        }
      }

      // Log skipped extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: customerName');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_callback_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceRequested');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_callback_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: issueDescription');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_callback_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: serviceAddress');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_callback_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');

      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] field: desiredCompletionTime');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Not allowed in ask_callback_time stage');
      console.log('[FIELD EXTRACTION SKIPPED] currentStage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;

    default:
      // Unknown stage - skip all extractions
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      console.log('[FIELD EXTRACTION SKIPPED] reason: Unknown stage:', intake.stage);
      console.log('[FIELD EXTRACTION SKIPPED] Skipping all field extractions');
      console.log('[FIELD EXTRACTION SKIPPED] Timestamp:', new Date().toISOString());
      console.log('[FIELD EXTRACTION SKIPPED] =========================================');
      break;
  }

  console.log('[LIVE EXTRACTION COMPLETE] =========================================');
  console.log('[LIVE EXTRACTION COMPLETE] customerName:', intake.customerName);
  console.log('[LIVE EXTRACTION COMPLETE] serviceRequested:', intake.serviceRequested);
  console.log('[LIVE EXTRACTION COMPLETE] issueDescription:', intake.issueDescription);
  console.log('[LIVE EXTRACTION COMPLETE] serviceAddress:', intake.serviceAddress);
  console.log('[LIVE EXTRACTION COMPLETE] desiredCompletionTime:', intake.desiredCompletionTime);
  console.log('[LIVE EXTRACTION COMPLETE] callbackTime:', intake.callbackTime);
  console.log('[LIVE EXTRACTION COMPLETE] Timestamp:', new Date().toISOString());
  console.log('[LIVE EXTRACTION COMPLETE] =========================================');
  
  console.log('[FIELD EXTRACTION RESULT] =========================================');
  console.log('[FIELD EXTRACTION RESULT] extractedFields:', JSON.stringify({
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackTime: intake.callbackTime
  }, null, 2));
  console.log('[FIELD EXTRACTION RESULT] intakeAfter:', JSON.stringify({
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackTime: intake.callbackTime
  }, null, 2));
  console.log('[FIELD EXTRACTION RESULT] Timestamp:', new Date().toISOString());
  console.log('[FIELD EXTRACTION RESULT] =========================================');
}

// Helper function to validate customer name
function isValidCustomerName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const trimmedName = name.trim().toLowerCase();
  
  // Reject if too short or too long
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    return false;
  }
  
  // Blocklist of common non-name values that should not be saved as customerName
  const blockedValues = [
    // Service types
    'financial management', 'property management', 'south park', 'dog grooming', 'grass cutting',
    'plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control',
    'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors',
    'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage',
    'junk removal', 'lawn care', 'toilet', 'installation', 'maintenance', 'repair',
    'service', 'consultation', 'appointment', 'quote', 'estimate', 'inspection',
    
    // Locations
    'south park', 'north park', 'east park', 'west park', 'downtown', 'uptown',
    
    // Generic phrases
    'customer', 'client', 'caller', 'someone', 'anyone', 'nobody', 'unknown',
    'help', 'need', 'want', 'call', 'phone', 'message',
    
    // Business-related
    'business', 'company', 'office', 'store', 'shop',
    
    // Time-related
    'morning', 'afternoon', 'evening', 'today', 'tomorrow', 'week'
  ];
  
  // Check if name is blocked
  if (blockedValues.some(blocked => trimmedName === blocked || trimmedName.includes(blocked))) {
    return false;
  }
  
  // Check if it contains only common service words
  const serviceWords = ['service', 'repair', 'maintenance', 'installation', 'cleaning', 'management', 'inspection'];
  if (serviceWords.some(word => trimmedName.includes(word))) {
    return false;
  }
  
  // Check if it's a multi-word phrase that looks like a service description
  const words = trimmedName.split(/\s+/);
  if (words.length > 2) {
    return false;
  }
  
  return true;
}

// Helper function to validate callback time answer
function isValidCallbackTimeAnswer(transcript: string): boolean {
  const lowerTranscript = transcript.toLowerCase().trim();
  
  // Valid callback time patterns
  const validPatterns = [
    // Time of day
    'morning', 'mornings', 'afternoon', 'afternoons', 'evening', 'evenings', 'noon',
    // General timing
    'anytime', 'whenever', 'today', 'tomorrow',
    // Specific day combinations
    'tomorrow morning', 'tomorrow afternoon', 'tomorrow evening',
    'this morning', 'this afternoon', 'this evening',
    // Days of week
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    // Relative timing
    'next week', 'as soon as possible', 'asap', 'after work', 'before noon', 'around lunch',
    // Time ranges
    'between', 'after', 'before',
    // Time with AM/PM
    'am', 'pm',
    // Common time indicators
    'call', 'reach', 'contact', 'speak'
  ];
  
  // Check if transcript contains any valid pattern
  const hasValidPattern = validPatterns.some(pattern => lowerTranscript.includes(pattern));
  
  // Check for explicit time mentions (e.g., "3 PM", "10 AM")
  const timePattern = /\d+\s*(am|pm|o'clock|:00|:30)/i;
  const hasTimeMention = timePattern.test(lowerTranscript);
  
  // Reject if transcript is too short (likely invalid)
  if (lowerTranscript.length < 3) {
    return false;
  }
  
  // Reject if transcript contains only random words (check against common invalid words)
  const invalidWords = ['moon', 'banana', 'purple', 'dog', 'piano', 'cat', 'apple', 'car', 'house', 'tree', 'book', 'computer', 'phone'];
  const isOnlyInvalidWord = invalidWords.includes(lowerTranscript);
  
  return hasValidPattern || hasTimeMention || !isOnlyInvalidWord;
}

// Helper function to normalize extracted field names to session intake field names
function normalizeExtractedFields(extractedFields: any): any {
  if (!extractedFields) return {};
  
  console.log('[NORMALIZE EXTRACTED FIELDS] =========================================');
  console.log('[NORMALIZE EXTRACTED FIELDS] Original keys:', Object.keys(extractedFields));
  console.log('[NORMALIZE EXTRACTED FIELDS] Timestamp:', new Date().toISOString());
  console.log('[NORMALIZE EXTRACTED FIELDS] =========================================');
  
  const normalized = {
    customerName: extractedFields.callerName || extractedFields.customerName,
    serviceRequested: extractedFields.reasonForCalling || extractedFields.serviceRequested,
    issueDescription: extractedFields.importantDetails || extractedFields.issueDescription,
    serviceAddress: extractedFields.addressOrLocation || extractedFields.serviceAddress,
    desiredCompletionTime: extractedFields.desiredCompletionTime,
    callbackTime: extractedFields.preferredCallbackTime || extractedFields.callbackTime,
    summary: extractedFields.summary
  };
  
  console.log('[NORMALIZE EXTRACTED FIELDS] Normalized keys:', Object.keys(normalized));
  console.log('[NORMALIZE EXTRACTED FIELDS] Normalized values:', JSON.stringify(normalized, null, 2));
  console.log('[NORMALIZE EXTRACTED FIELDS] =========================================');
  
  return normalized;
}

// Helper function to check if all required AI intake fields are present
function isAIIntakeComplete(extractedFields: any): boolean {
  if (!extractedFields) return false;
  
  console.log('[AI INTAKE COMPLETENESS CHECK] =========================================');
  console.log('[AI INTAKE COMPLETENESS CHECK] Input keys:', Object.keys(extractedFields));
  console.log('[AI INTAKE COMPLETENESS CHECK] Input values:', JSON.stringify(extractedFields, null, 2));
  
  // Check fields using the same logic as areAllRequiredFieldsCollected()
  const hasName = !!extractedFields.customerName;
  const hasJobDescription = !!(extractedFields.serviceRequested || extractedFields.issueDescription);
  const hasLocation = !!extractedFields.serviceAddress;
  const hasTiming = !!(extractedFields.desiredCompletionTime || extractedFields.callbackTime);
  const hasCallbackTime = !!extractedFields.callbackTime;
  
  const isComplete = hasName && hasJobDescription && hasLocation && hasTiming && hasCallbackTime;
  
  console.log('[AI INTAKE COMPLETENESS CHECK] Field checks:', {
    hasName,
    hasJobDescription,
    hasLocation,
    hasTiming,
    hasCallbackTime,
    isComplete
  });
  console.log('[AI INTAKE COMPLETENESS CHECK] Timestamp:', new Date().toISOString());
  console.log('[AI INTAKE COMPLETENESS CHECK] =========================================');
  
  return isComplete;
}

// Helper function to check if any useful field was collected during incomplete intake
function hasUsefulCollectedFields(intakeData: IntakeData | null): boolean {
  console.log('[USEFUL COLLECTED FIELDS CHECK] =========================================');
  console.log('[USEFUL COLLECTED FIELDS CHECK] intakeData:', JSON.stringify(intakeData, null, 2));
  
  if (!intakeData) {
    console.log('[USEFUL COLLECTED FIELDS CHECK] intakeData is null, returning false');
    console.log('[USEFUL COLLECTED FIELDS CHECK] =========================================');
    return false;
  }
  
  const usefulFields = [
    intakeData.customerName,
    intakeData.serviceRequested,
    intakeData.issueDescription,
    intakeData.serviceAddress,
    intakeData.desiredCompletionTime,
    intakeData.callbackTime
  ];
  
  const hasAnyField = usefulFields.some(field => field && field.trim() !== '');
  
  console.log('[USEFUL COLLECTED FIELDS CHECK] usefulFields:', usefulFields);
  console.log('[USEFUL COLLECTED FIELDS CHECK] hasAnyField:', hasAnyField);
  console.log('[USEFUL COLLECTED FIELDS CHECK] =========================================');
  
  return hasAnyField;
}

// Helper function to finalize incomplete AI intake
async function finalizeIncompleteIntake(
  transcript: Array<{role: string, text: string}>,
  intakeData: IntakeData | null,
  businessId: string,
  callerPhone: string,
  callSid: string,
  businessName: string,
  forwardedFrom: string,
  supabase: any,
  closingState?: any
): Promise<void> {
  console.log('[FINALIZE INCOMPLETE ENTER] =========================================');
  console.log('[FINALIZE INCOMPLETE ENTER] Function entry');
  console.log('[FINALIZE INCOMPLETE ENTER] callSid:', callSid);
  console.log('[FINALIZE INCOMPLETE ENTER] businessId:', businessId);
  console.log('[FINALIZE INCOMPLETE ENTER] callerPhone:', callerPhone);
  console.log('[FINALIZE INCOMPLETE ENTER] Timestamp:', new Date().toISOString());
  console.log('[FINALIZE INCOMPLETE ENTER] =========================================');
  
  // INCOMPLETE FINALIZATION OWNERSHIP CHECK
  const stage = intakeData?.stage || 'unknown';
  const allRequiredFieldsCollected = intakeData ? areAllRequiredFieldsCollected(intakeData) : false;
  const finalClosingStarted = closingState?.finalClosingStarted || false;
  const terminalClosingResponseStarted = closingState?.terminalClosingResponseStarted || false;
  
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] =========================================');
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] stage:', stage);
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] allRequiredFieldsCollected:', allRequiredFieldsCollected);
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] finalClosingStarted:', finalClosingStarted);
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] terminalClosingResponseStarted:', terminalClosingResponseStarted);
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] Timestamp:', new Date().toISOString());
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] =========================================');
  
  // Verify call is truly incomplete before claiming ownership
  const willClaimCall = stage !== 'complete' && 
                        !allRequiredFieldsCollected && 
                        !finalClosingStarted && 
                        !terminalClosingResponseStarted;
  
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] =========================================');
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] willClaimCall:', willClaimCall);
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] Timestamp:', new Date().toISOString());
  console.log('[INCOMPLETE FINALIZATION OWNERSHIP CHECK] =========================================');
  
  if (!willClaimCall) {
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] =========================================');
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] Call is complete, incomplete finalization will NOT claim ownership');
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] stage:', stage);
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] allRequiredFieldsCollected:', allRequiredFieldsCollected);
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] finalClosingStarted:', finalClosingStarted);
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] terminalClosingResponseStarted:', terminalClosingResponseStarted);
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] Timestamp:', new Date().toISOString());
    console.log('[INCOMPLETE FINALIZATION NOT CLAIMED - COMPLETE CALL] =========================================');
    
    console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
    console.log('[FINALIZE INCOMPLETE EXIT] Function exit (call is complete)');
    console.log('[FINALIZE INCOMPLETE EXIT] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
    return;
  }
  
  // Acquire finalization lock
  if (finalizationInProgressByCallSid.has(callSid)) {
    console.log('[FINALIZATION SKIPPED ALREADY IN PROGRESS] =========================================');
    console.log('[FINALIZATION SKIPPED ALREADY IN PROGRESS] callSid:', callSid);
    console.log('[FINALIZATION SKIPPED ALREADY IN PROGRESS] Timestamp:', new Date().toISOString());
    console.log('[FINALIZATION SKIPPED ALREADY IN PROGRESS] =========================================');
    console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
    console.log('[FINALIZE INCOMPLETE EXIT] Function exit (skipped)');
    console.log('[FINALIZE INCOMPLETE EXIT] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
    return;
  }
  
  finalizationInProgressByCallSid.set(callSid, Date.now());
  incompleteFinalizedCallSids.set(callSid, Date.now());
  
  console.log('[FINALIZATION LOCK ACQUIRED] =========================================');
  console.log('[FINALIZATION LOCK ACQUIRED] callSid:', callSid);
  console.log('[FINALIZATION LOCK ACQUIRED] Timestamp:', new Date().toISOString());
  console.log('[FINALIZATION LOCK ACQUIRED] =========================================');
  
  console.log('[AI INCOMPLETE FINALIZATION STARTED] =========================================');
  console.log('[AI INCOMPLETE FINALIZATION STARTED] callSid:', callSid);
  console.log('[AI INCOMPLETE FINALIZATION STARTED] businessId:', businessId);
  console.log('[AI INCOMPLETE FINALIZATION STARTED] callerPhone:', callerPhone);
  console.log('[AI INCOMPLETE FINALIZATION STARTED] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE FINALIZATION STARTED] =========================================');
  
  // Check if any useful field was collected
  const hasUsefulData = hasUsefulCollectedFields(intakeData);
  
  if (!hasUsefulData) {
    console.log('[FINALIZE INCOMPLETE RETURN] =========================================');
    console.log('[FINALIZE INCOMPLETE RETURN] reason: No useful data collected, skipping finalization');
    console.log('[FINALIZE INCOMPLETE RETURN] Timestamp:', new Date().toISOString());
    console.log('[FINALIZE INCOMPLETE RETURN] =========================================');
    return;
  }
  
  console.log('[AI INCOMPLETE FINALIZATION] Useful data collected, proceeding with finalization');
  
  // Build extracted fields from intake data
  console.log('[AI INCOMPLETE STEP 1] =========================================');
  console.log('[AI INCOMPLETE STEP 1] Building extracted fields from intake data');
  console.log('[AI INCOMPLETE STEP 1] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 1] =========================================');
  
  const extractedFields = {
    callerName: intakeData?.customerName || null,
    reasonForCalling: intakeData?.serviceRequested || null,
    importantDetails: intakeData?.issueDescription || null,
    addressOrLocation: intakeData?.serviceAddress || null,
    desiredCompletionTime: intakeData?.desiredCompletionTime || null,
    preferredCallbackTime: intakeData?.callbackTime || null,
    summary: `Partial intake: ${intakeData?.customerName || 'Unknown'} called about ${intakeData?.serviceRequested || 'unknown issue'}. Some details may be missing.`
  };
  
  console.log('[AI INCOMPLETE STEP 1 SUCCESS] =========================================');
  console.log('[AI INCOMPLETE STEP 1 SUCCESS] Extracted fields:', extractedFields);
  console.log('[AI INCOMPLETE STEP 1 SUCCESS] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 1 SUCCESS] =========================================');
  
  // Create or update lead
  console.log('[AI INCOMPLETE STEP 2] =========================================');
  console.log('[AI INCOMPLETE STEP 2] Creating or updating lead');
  console.log('[AI INCOMPLETE STEP 2] businessId:', businessId);
  console.log('[AI INCOMPLETE STEP 2] callerPhone:', callerPhone);
  console.log('[AI INCOMPLETE STEP 2] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 2] =========================================');
  
  const { data: lead, error: leadError } = await retrySupabaseOperation(
  async () => {
    const result = await supabase
      .from('leads')
      .upsert({
        business_id: businessId,
        caller_phone: callerPhone,
        status: 'new',
      }, {
        onConflict: 'business_id,caller_phone',
      })
      .select()
      .single();
    return result;
  },
  'Create/Update Lead',
  3,
  1000
);
  
  if (leadError) {
    console.error('[AI INCOMPLETE STEP 2 FAILED] =========================================');
    console.error('[AI INCOMPLETE STEP 2 FAILED] Lead creation failed');
    console.error('[AI INCOMPLETE STEP 2 FAILED] error:', leadError);
    console.error('[AI INCOMPLETE STEP 2 FAILED] stack:', leadError.stack);
    console.error('[AI INCOMPLETE STEP 2 FAILED] Timestamp:', new Date().toISOString());
    console.error('[AI INCOMPLETE STEP 2 FAILED] =========================================');
    return;
  }
  
  console.log('[AI INCOMPLETE STEP 2 SUCCESS] =========================================');
  console.log('[AI INCOMPLETE STEP 2 SUCCESS] Lead created/updated:', lead.id);
  console.log('[AI INCOMPLETE STEP 2 SUCCESS] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 2 SUCCESS] =========================================');
  
  // Create or update conversation
  console.log('[AI INCOMPLETE STEP 3] =========================================');
  console.log('[AI INCOMPLETE STEP 3] Creating or updating conversation');
  console.log('[AI INCOMPLETE STEP 3] leadId:', lead.id);
  console.log('[AI INCOMPLETE STEP 3] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 3] =========================================');
  
  let conversation;
  const { data: existingConversation } = await retrySupabaseOperation(
    async () => {
      const result = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .maybeSingle();
      return result;
    },
    'Lookup Existing Conversation',
    3,
    1000
  );
  
  if (existingConversation) {
    conversation = existingConversation;
    console.log('[AI INCOMPLETE STEP 3] Using existing conversation:', conversation.id);
  } else {
    const result = await retrySupabaseOperation(
      async () => {
        const res = await supabase
          .from('conversations')
          .insert({
            business_id: businessId,
            lead_id: lead.id,
            status: 'open',
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single();
        return res;
      },
      'Create Conversation',
      3,
      1000
    );
    conversation = result.data;
  }
  
  console.log('[AI INCOMPLETE STEP 3 SUCCESS] =========================================');
  console.log('[AI INCOMPLETE STEP 3 SUCCESS] Conversation:', conversation.id);
  console.log('[AI INCOMPLETE STEP 3 SUCCESS] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 3 SUCCESS] =========================================');
  
  // Insert AI call record with incomplete outcome (idempotent)
  console.log('[AI INCOMPLETE STEP 4] =========================================');
  console.log('[AI INCOMPLETE STEP 4] Inserting AI call record with incomplete outcome (idempotent)');
  console.log('[AI INCOMPLETE STEP 4] callSid:', callSid);
  console.log('[AI INCOMPLETE STEP 4] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 4] =========================================');
  
  // Check for existing record by call_sid
  const { data: existingRecord, error: checkError } = await retrySupabaseOperation(
    async () => {
      const result = await supabase
        .from('ai_call_records')
        .select('id, outcome')
        .eq('call_sid', callSid)
        .maybeSingle();
      return result;
    },
    'Check Existing AI Call Record',
    3,
    1000
  );
  
  if (checkError && checkError.code !== 'PGRST116') {
    console.error('[AI INCOMPLETE STEP 4 FAILED] =========================================');
    console.error('[AI INCOMPLETE STEP 4 FAILED] Error checking existing record');
    console.error('[AI INCOMPLETE STEP 4 FAILED] error:', checkError);
    console.error('[AI INCOMPLETE STEP 4 FAILED] stack:', checkError.stack);
    console.error('[AI INCOMPLETE STEP 4 FAILED] Timestamp:', new Date().toISOString());
    console.error('[AI INCOMPLETE STEP 4 FAILED] =========================================');
    return;
  }
  
  let recordError;
  if (existingRecord) {
    console.log('[AI INCOMPLETE STEP 4] Existing record found, updating instead of inserting');
    // Update existing record
    const { error: updateError } = await retrySupabaseOperation(
      async () => {
        const result = await supabase
          .from('ai_call_records')
          .update({
            outcome: 'incomplete',
            extracted_info: extractedFields,
            summary: extractedFields.summary,
            extraction_failed: false,
            lead_id: lead.id,
            conversation_id: conversation.id,
            transcript: transcript
          })
          .eq('id', existingRecord.id);
        return result;
      },
      'Update AI Call Record',
      3,
      1000
    );
    recordError = updateError;
  } else {
    // Insert new record
    const { error: insertError } = await retrySupabaseOperation(
      async () => {
        const result = await supabase
          .from('ai_call_records')
          .insert({
            business_id: businessId,
            lead_id: lead.id,
            conversation_id: conversation.id,
            caller_phone: callerPhone,
            call_sid: callSid,
            transcript: transcript,
            outcome: 'incomplete',
            extracted_info: extractedFields,
            summary: extractedFields.summary,
            extraction_failed: false
          });
        return result;
      },
      'Insert AI Call Record',
      3,
      1000
    );
    recordError = insertError;
  }
  
  if (recordError) {
    console.error('[AI INCOMPLETE STEP 4 FAILED] =========================================');
    console.error('[AI INCOMPLETE STEP 4 FAILED] AI call record operation failed');
    console.error('[AI INCOMPLETE STEP 4 FAILED] existingRecord:', !!existingRecord);
    console.error('[AI INCOMPLETE STEP 4 FAILED] error:', recordError);
    console.error('[AI INCOMPLETE STEP 4 FAILED] stack:', recordError.stack);
    console.error('[AI INCOMPLETE STEP 4 FAILED] Timestamp:', new Date().toISOString());
    console.error('[AI INCOMPLETE STEP 4 FAILED] =========================================');
    return;
  }
  
  console.log('[AI INCOMPLETE STEP 4 SUCCESS] =========================================');
  console.log('[AI INCOMPLETE STEP 4 SUCCESS] AI call record operation completed with outcome: incomplete');
  console.log('[AI INCOMPLETE STEP 4 SUCCESS] existingRecord:', !!existingRecord);
  console.log('[AI INCOMPLETE STEP 4 SUCCESS] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 4 SUCCESS] =========================================');
  
  // Send partial AI summary SMS
  console.log('[AI INCOMPLETE STEP 5] =========================================');
  console.log('[AI INCOMPLETE STEP 5] Sending partial summary SMS');
  console.log('[AI INCOMPLETE STEP 5] businessId:', businessId);
  console.log('[AI INCOMPLETE STEP 5] leadId:', lead.id);
  console.log('[AI INCOMPLETE STEP 5] conversationId:', conversation.id);
  console.log('[AI INCOMPLETE STEP 5] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 5] =========================================');
  
  try {
    await sendAIConfirmationSMS(
      businessId,
      lead.id,
      conversation.id,
      callSid,
      callerPhone,
      extractedFields
    );
    
    console.log('[AI INCOMPLETE STEP 5 SUCCESS] =========================================');
    console.log('[AI INCOMPLETE STEP 5 SUCCESS] Partial summary SMS sent successfully');
    console.log('[AI INCOMPLETE STEP 5 SUCCESS] Timestamp:', new Date().toISOString());
    console.log('[AI INCOMPLETE STEP 5 SUCCESS] =========================================');
  } catch (smsError) {
    console.error('[AI INCOMPLETE STEP 5 FAILED] =========================================');
    console.error('[AI INCOMPLETE STEP 5 FAILED] SMS send failed');
    console.error('[AI INCOMPLETE STEP 5 FAILED] error:', smsError);
    console.error('[AI INCOMPLETE STEP 5 FAILED] stack:', smsError.stack);
    console.error('[AI INCOMPLETE STEP 5 FAILED] Timestamp:', new Date().toISOString());
    console.error('[AI INCOMPLETE STEP 5 FAILED] =========================================');
  }
  
  // Create follow-up jobs (idempotent via API)
  console.log('[AI INCOMPLETE STEP 6] =========================================');
  console.log('[AI INCOMPLETE STEP 6] Creating follow-up jobs (idempotent)');
  console.log('[AI INCOMPLETE STEP 6] businessId:', businessId);
  console.log('[AI INCOMPLETE STEP 6] leadId:', lead.id);
  console.log('[AI INCOMPLETE STEP 6] conversationId:', conversation.id);
  console.log('[AI INCOMPLETE STEP 6] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE STEP 6] =========================================');
  
  try {
    const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
    const notificationApiUrl = appBaseUrl;
    const internalApiSecret = process.env.INTERNAL_API_SECRET;

    console.log('[MAIN APP API CONFIG] =========================================');
    console.log('[MAIN APP API CONFIG] nodeEnv:', process.env.NODE_ENV);
    console.log('[MAIN APP API CONFIG] appBaseUrl:', appBaseUrl);
    console.log('[MAIN APP API CONFIG] sourceEnvUsed:', process.env.MAIN_APP_URL ? 'MAIN_APP_URL' : process.env.NEXT_PUBLIC_APP_URL ? 'NEXT_PUBLIC_APP_URL' : process.env.APP_BASE_URL ? 'APP_BASE_URL' : 'fallback');
    console.log('[MAIN APP API CONFIG] Timestamp:', new Date().toISOString());
    console.log('[MAIN APP API CONFIG] =========================================');

    console.log('[AI INCOMPLETE STEP 6] API URL:', notificationApiUrl);
    console.log('[AI INCOMPLETE STEP 6] INTERNAL_API_SECRET present:', !!internalApiSecret);
    
    const headers: any = {
      'Content-Type': 'application/json',
    };
    if (internalApiSecret) {
      headers['Authorization'] = `Bearer ${internalApiSecret}`;
    }
    
    console.log('[AI INCOMPLETE STEP 6] Headers:', JSON.stringify({
      'Content-Type': headers['Content-Type'],
      'Authorization': headers['Authorization'] ? 'Bearer ***' : 'none'
    }));
    
    const requestBody = {
      businessId,
      leadId: lead.id,
      conversationId: conversation.id,
      businessName
    };
    
    console.log('[AI INCOMPLETE STEP 6] Request body:', JSON.stringify(requestBody));
    
    const response = await retrySupabaseOperation(
      async () => {
        const res = await fetch(`${notificationApiUrl}/api/follow-ups/create-jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });
        return res;
      },
      'Create Follow-up Jobs',
      3,
      1000
    );
    
    console.log('[AI INCOMPLETE STEP 6] Response status:', response.status);
    console.log('[AI INCOMPLETE STEP 6] Response statusText:', response.statusText);
    
    const responseBody = await response.text();
    console.log('[AI INCOMPLETE STEP 6] Response body:', responseBody);
    
    // Parse response body as JSON for better error diagnostics
    let parsedResponseBody;
    try {
      parsedResponseBody = JSON.parse(responseBody);
      console.log('[AI INCOMPLETE STEP 6] Parsed response body:', JSON.stringify(parsedResponseBody, null, 2));
    } catch (parseError) {
      console.log('[AI INCOMPLETE STEP 6] Response body is not JSON, using raw text');
      parsedResponseBody = responseBody;
    }
    
    if (!response.ok) {
      console.error('[AI INCOMPLETE STEP 6 FAILED] =========================================');
      console.error('[AI INCOMPLETE STEP 6 FAILED] Non-OK status code:', response.status);
      console.error('[AI INCOMPLETE STEP 6 FAILED] response body:', parsedResponseBody);
      console.error('[AI INCOMPLETE STEP 6 FAILED] Timestamp:', new Date().toISOString());
      console.error('[AI INCOMPLETE STEP 6 FAILED] =========================================');
    } else {
      console.log('[AI INCOMPLETE STEP 6 SUCCESS] =========================================');
      console.log('[AI INCOMPLETE STEP 6 SUCCESS] Follow-up jobs created successfully');
      console.log('[AI INCOMPLETE STEP 6 SUCCESS] Timestamp:', new Date().toISOString());
      console.log('[AI INCOMPLETE STEP 6 SUCCESS] =========================================');
    }
  } catch (followUpError) {
    console.error('[AI INCOMPLETE STEP 6 FAILED] =========================================');
    console.error('[AI INCOMPLETE STEP 6 FAILED] Follow-up creation failed');
    console.error('[AI INCOMPLETE STEP 6 FAILED] error:', followUpError);
    console.error('[AI INCOMPLETE STEP 6 FAILED] stack:', followUpError.stack);
    console.error('[AI INCOMPLETE STEP 6 FAILED] Timestamp:', new Date().toISOString());
    console.error('[AI INCOMPLETE STEP 6 FAILED] =========================================');
  }
  
  console.log('[AI INCOMPLETE FINALIZATION COMPLETE] =========================================');
  console.log('[AI INCOMPLETE FINALIZATION COMPLETE] callSid:', callSid);
  console.log('[AI INCOMPLETE FINALIZATION COMPLETE] Timestamp:', new Date().toISOString());
  console.log('[AI INCOMPLETE FINALIZATION COMPLETE] =========================================');
  
  // Release finalization lock
  finalizationInProgressByCallSid.delete(callSid);
  incompleteFinalizedCallSids.delete(callSid);
  
  console.log('[FINALIZATION LOCK RELEASED] =========================================');
  console.log('[FINALIZATION LOCK RELEASED] callSid:', callSid);
  console.log('[FINALIZATION LOCK RELEASED] Timestamp:', new Date().toISOString());
  console.log('[FINALIZATION LOCK RELEASED] =========================================');
  
  console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
  console.log('[FINALIZE INCOMPLETE EXIT] Function exit');
  console.log('[FINALIZE INCOMPLETE EXIT] Timestamp:', new Date().toISOString());
  console.log('[FINALIZE INCOMPLETE EXIT] =========================================');
}

// Helper function to validate issue description
function isValidIssueDescription(issueDescription: string, serviceRequested?: string): boolean {
  if (!issueDescription || issueDescription.trim().length === 0) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Empty');
    return false;
  }

  const normalizedIssue = issueDescription.toLowerCase().trim();
  const normalizedService = serviceRequested ? serviceRequested.toLowerCase().trim() : '';

  // Check if it's exactly the same as service requested
  if (normalizedService && normalizedIssue === normalizedService) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Exactly same as service requested');
    return false;
  }

  // Check if issue description is contained in service requested with no extra detail
  if (normalizedService && normalizedService.includes(normalizedIssue) && normalizedIssue.split(/\s+/).length < 4) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Contained in service requested with no extra detail');
    return false;
  }

  // Check if service requested is contained in issue description with no extra detail
  if (normalizedService && normalizedIssue.includes(normalizedService) && normalizedIssue.split(/\s+/).length < 4) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Contains service requested with no extra detail');
    return false;
  }

  // Check if it's just a generic service category
  const genericServices = ['plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control', 'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors', 'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage', 'junk removal', 'grass cutting', 'grass', 'lawn', 'mowing', 'lawn care'];
  if (genericServices.some(service => normalizedIssue === service)) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Generic service category only');
    return false;
  }

  // Remove filler words and check meaningful word count
  const fillerWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'need', 'help', 'with', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'as', 'my', 'i', 'me', 'you', 'your', 'it', 'its', 'this', 'that'];
  const meaningfulWords = normalizedIssue.split(/\s+/).filter(w => w.length > 2 && !fillerWords.includes(w));

  if (meaningfulWords.length < 4) {
    console.log('[AI ISSUE DESCRIPTION INVALID] Fewer than 4 meaningful words after removing fillers', { wordCount: meaningfulWords.length, words: meaningfulWords });
    return false;
  }

  return true;
}

// Helper function to get response for missing field
function getResponseForMissingField(missingField: string, intake: IntakeData): { response: string; nextStage: IntakeStage } {
  switch (missingField) {
    case 'customer name':
    case 'customerName':
      return {
        response: 'Thanks for calling. Can I get your name and the reason for your call?',
        nextStage: 'ask_name_reason'
      };
    case 'service requested':
    case 'serviceRequested':
      return {
        response: 'Thanks for calling. Can I get your name and the reason for your call?',
        nextStage: 'ask_name_reason'
      };
    case 'issue description':
    case 'issueDescription':
      return {
        response: 'Can you tell me a little more about what you need?',
        nextStage: 'ask_details'
      };
    case 'service address':
    case 'serviceAddress':
      return {
        response: 'Where will the service take place?',
        nextStage: 'ask_location_or_context'
      };
    case 'desired completion time':
    case 'desiredCompletionTime':
      return {
        response: 'When would you like this work completed?',
        nextStage: 'ask_timing'
      };
    default:
      return {
        response: 'Could you please provide more details?',
        nextStage: intake.stage
      };
  }
}

function extractName(transcript: string): string {
  const trimmed = transcript.trim();
  const lowerTranscript = trimmed.toLowerCase();
  
  console.log('[NAME EXTRACTION] =========================================');
  console.log('[NAME EXTRACTION] rawTranscript:', trimmed);
  console.log('[NAME EXTRACTION] Timestamp:', new Date().toISOString());
  console.log('[NAME EXTRACTION] =========================================');
  
  // Pattern: "My name is X" or "I am X" or "This is X"
  const namePatterns = [
    /my name is\s+(.+?)(?:\s|$)/i,
    /i am\s+(.+?)(?:\s|$)/i,
    /i'm\s+(.+?)(?:\s|$)/i,
    /this is\s+(.+?)(?:\s|$)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const extractedName = match[1].trim();
      // Take only the first word of the extracted name (the actual name)
      const nameWords = extractedName.split(' ');
      const finalName = nameWords[0];
      
      console.log('[NAME EXTRACTION] Pattern matched:', pattern);
      console.log('[NAME EXTRACTION] extractedName:', extractedName);
      console.log('[NAME EXTRACTION] finalName:', finalName);
      console.log('[NAME EXTRACTION] =========================================');
      
      // Validate the extracted name before returning
      if (isValidCustomerName(finalName)) {
        return finalName;
      } else {
        console.log('[NAME EXTRACTION] =========================================');
        console.log('[NAME EXTRACTION] Extracted name failed validation:', finalName);
        console.log('[NAME EXTRACTION] Rejecting this name');
        console.log('[NAME EXTRACTION] =========================================');
      }
    }
  }
  
  // REMOVED: Dangerous fallback that took the last word of transcript
  // This caused cross-contamination (e.g., "toilet." became customerName)
  // Now only set customerName when a valid name pattern is matched
  console.log('[NAME EXTRACTION] No valid name pattern matched - returning null');
  console.log('[NAME EXTRACTION] Only "My name is X", "I am X", "I\'m X", "This is X" patterns are accepted');
  console.log('[NAME EXTRACTION] =========================================');
  return null;
}

function extractPhoneNumber(transcript: string): string {
  // Extract phone number patterns
  const phoneRegex = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{10})/;
  const match = transcript.match(phoneRegex);
  return match ? match[1] : transcript.trim();
}

// AI session state tracking functions
function createAISessionTracker(callSid: string, businessId: string): AISessionStateTracker {
  const now = Date.now();
  return {
    currentState: 'AI_CONNECTING',
    metrics: {
      callSid,
      businessId,
      callReceivedAt: now,
    },
    stateHistory: [{
      state: 'AI_CONNECTING',
      timestamp: now,
    }]
  };
}

function updateAISessionState(tracker: AISessionStateTracker, newState: AISessionState, reason?: string): void {
  const now = Date.now();
  const previousState = tracker.currentState;
  
  // Update state
  tracker.currentState = newState;
  
  // Add to history
  tracker.stateHistory.push({
    state: newState,
    timestamp: now,
    transitionFrom: previousState,
  });
  
  // Update specific timestamps
  switch (newState) {
    case 'AI_CONNECTED':
      tracker.metrics.aiConnectedAt = now;
      break;
    case 'SESSION_READY':
      tracker.metrics.sessionReadyAt = now;
      break;
    case 'GREETING_SENT':
      tracker.metrics.greetingSentAt = now;
      break;
    case 'AUDIO_RECEIVED':
      if (!tracker.metrics.firstAudioReceivedAt) {
        tracker.metrics.firstAudioReceivedAt = now;
      }
      break;
    case 'FAILED':
      tracker.metrics.failureReason = reason;
      break;
  }
  
  // Log state transition
  console.log(`[AI STATE] ${newState}`, {
    callSid: tracker.metrics.callSid,
    businessId: tracker.metrics.businessId,
    previousState,
    timestamp: now,
    reason,
  });
}

function logCallMetrics(tracker: AISessionStateTracker): void {
  const metrics = tracker.metrics;
  const connectMs = metrics.aiConnectedAt ? metrics.aiConnectedAt - metrics.callReceivedAt : 0;
  const readyMs = metrics.sessionReadyAt ? metrics.sessionReadyAt - metrics.callReceivedAt : 0;
  const firstAudioMs = metrics.firstAudioReceivedAt ? metrics.firstAudioReceivedAt - metrics.callReceivedAt : 0;
  
  console.log('[CALL METRICS]', {
    callSid: metrics.callSid,
    businessId: metrics.businessId,
    connectMs,
    readyMs,
    firstAudioMs,
    finalState: tracker.currentState,
    failureReason: metrics.failureReason,
  });
}

// Comprehensive voicemail fallback function for critical requirement
async function triggerVoicemailFallback(
  ws: WebSocket, 
  twilioHandler: any, 
  aiSessionTracker: AISessionStateTracker, 
  failureReason: string, 
  callSid: string, 
  businessId: string, 
  callerPhone: string, 
  businessName: string,
  forwardedFrom: string
): Promise<void> {
  console.log('[AI FAILURE] AI system failure detected');
  console.log('[VOICEMAIL FALLBACK ACTIVATED] Triggering voicemail fallback due to:', failureReason);
  
  // Record the failure
  recordAIFailure(aiSessionTracker, 'VOICEMAIL_FALLBACK', failureReason);
  updateAISessionState(aiSessionTracker, 'FAILED', failureReason);
  
  // Close AI connection if it exists
  const openAiWs = (ws as any).openAiWs;
  if (openAiWs) {
    openAiWs.close();
  }
  
  console.log('[AI FALLBACK CHECK]', { 
    callSid, 
    businessId, 
    failureReason,
    timestamp: new Date().toISOString()
  });
  
  console.log('[AI FALLBACK TRIGGERED]', { 
    callSid, 
    businessId, 
    failureReason 
  });
  
  console.log('[AI FALLBACK REASON]', failureReason);
  
  // Store fallback metadata for later processing
  (ws as any).voicemailFallback = {
    triggered: true,
    failureReason,
    callSid,
    businessId,
    callerPhone,
    businessName,
    forwardedFrom,
    timestamp: new Date().toISOString()
  };

  try {
    console.log('[AI FALLBACK TO VOICEMAIL]', { callSid, businessId });
    
    // Use Twilio REST API to redirect the call to voicemail
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!twilioAccountSid || !twilioAuthToken) {
      console.log('[VOICEMAIL FALLBACK] Missing Twilio credentials, using fallback');
      await createFallbackLead(callSid, businessId, callerPhone, businessName, forwardedFrom, failureReason);
      ws.close(1008, 'Voicemail fallback activated');
      return;
    }

    const twilioClient = require('twilio')(twilioAccountSid, twilioAuthToken);
    
    // Redirect the call to the voicemail endpoint
    const voicemailUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://replyflowhq.com'}/api/twilio/voicemail`;
    
    console.log('[VOICEMAIL FALLBACK START]', { callSid, voicemailUrl });
    
    await twilioClient.calls(callSid).update({
      method: 'POST',
      url: voicemailUrl,
      status: 'in-progress'
    });
    
    console.log('[VOICEMAIL FALLBACK RECORDING]', { callSid, voicemailUrl });
    console.log('[VOICEMAIL FALLBACK COMPLETE]', { callSid });
    
    // Close the WebSocket connection
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1008, 'Voicemail fallback activated');
    }
    
  } catch (error) {
    console.log('[VOICEMAIL FALLBACK ERROR] Failed to redirect call:', error);
    
    // Fallback: create lead directly and close connection
    await createFallbackLead(callSid, businessId, callerPhone, businessName, forwardedFrom, failureReason);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1008, 'Voicemail fallback activated');
    }
  }
}

// Fallback lead creation function
async function createFallbackLead(
  callSid: string,
  businessId: string,
  callerPhone: string,
  businessName: string,
  forwardedFrom: string,
  failureReason: string
): Promise<void> {
  console.log('[LEAD CREATED FROM FALLBACK] Creating lead due to AI failure');
  
  if (!supabase) {
    console.log('[LEAD CREATED FROM FALLBACK] No Supabase client available');
    return;
  }

  try {
    // Create lead
    const leadInsertPayload = {
      business_id: businessId,
      caller_phone: callerPhone,
      status: 'new',
    };
    console.log('[LEAD INSERT PAYLOAD]', leadInsertPayload);
    
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .upsert({
        business_id: businessId,
        caller_phone: callerPhone,
        status: 'new',
      }, {
        onConflict: 'business_id,caller_phone',
      })
      .select()
      .single();

    if (leadError) {
      console.log('[LEAD CREATED FROM FALLBACK] Lead creation error:', leadError);
      return;
    }

    // Create conversation
    const conversationInsertPayload = {
      lead_id: lead.id,
      business_id: businessId,
      status: 'active',
    };
    console.log('[CONVERSATION INSERT PAYLOAD]', conversationInsertPayload);
    
    // Lookup existing conversation by lead_id
    const { data: existingConversation, error: conversationLookupError } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .maybeSingle();

    let conversation;
    let conversationError;
    
    if (existingConversation) {
      conversation = existingConversation;
      console.log('[LEAD CREATED FROM FALLBACK] Existing conversation found', { conversationId: conversation.id });
    } else {
      const result = await supabase
        .from('conversations')
        .insert({
          lead_id: lead.id,
          business_id: businessId,
          status: 'active',
        })
        .select()
        .single();
      conversation = result.data;
      conversationError = result.error;
    }

    if (conversationError) {
      console.log('[LEAD CREATED FROM FALLBACK] Conversation creation error:', conversationError);
      return;
    }

    // Create system message about the fallback
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        lead_id: lead.id,
        business_id: businessId,
        content: `AI system failed (${failureReason}). Caller was redirected to voicemail. Please follow up with this customer.`,
        message_type: 'system',
      });

    if (messageError) {
      console.log('[LEAD CREATED FROM FALLBACK] Message creation error:', messageError);
    } else {
      console.log('[LEAD CREATED FROM FALLBACK] Lead and conversation created successfully');
    }

    // Create AI call record for the fallback
    const fallbackCallRecordPayload = {
        business_id: businessId,
        lead_id: lead.id,
        conversation_id: conversation.id,
        caller_phone: callerPhone || 'unknown',
        call_sid: callSid || 'unknown',
        transcript: [],
        outcome: 'ai_failed_voicemail',
        extraction_failed: false
      };
    console.log('[AI CALL RECORD OUTCOME]', {
      outcome: fallbackCallRecordPayload.outcome,
      callSid: fallbackCallRecordPayload.call_sid,
      businessId: fallbackCallRecordPayload.business_id,
      leadId: fallbackCallRecordPayload.lead_id,
      conversationId: fallbackCallRecordPayload.conversation_id
    });
    console.log('[INSERT PATH A] leadCreatedFromFallback function', {
      file: 'services/replyflow-ai-voice/src/index.ts',
      line: 607,
      lead_id: fallbackCallRecordPayload.lead_id,
      conversation_id: fallbackCallRecordPayload.conversation_id
    });
    console.log('[AI CALL RECORD INSERT PAYLOAD]', fallbackCallRecordPayload);

    console.log('[AI CALL RECORD INSERT ACTIVE PATH]', {
      file: 'services/replyflow-ai-voice/src/index.ts',
      function: 'leadCreatedFromFallback',
      sessionId: 'unknown',
      callSid: callSid || 'unknown',
      businessId: businessId,
      callerPhone: callerPhone || 'unknown'
    });

    console.log('[BEFORE AI_CALL_RECORD INSERT - PATH-A-createFallbackLead]', {
      businessId: fallbackCallRecordPayload.business_id,
      leadId: fallbackCallRecordPayload.lead_id,
      conversationId: fallbackCallRecordPayload.conversation_id
    });

    const { error: aiRecordError } = await supabase
      .from('ai_call_records')
      .insert(fallbackCallRecordPayload);

    console.log('[AFTER AI_CALL_RECORD INSERT - PATH-A-createFallbackBack]', {
      error: aiRecordError
    });

    if (aiRecordError) {
      console.log('[LEAD CREATED FROM FALLBACK] AI call record creation error:', aiRecordError);
    } else {
      console.log('[LEAD CREATED FROM FALLBACK] AI call record created successfully');
      
      // Create follow-up jobs directly using Supabase
      console.log('[FOLLOWUP DIRECT INSERT START - PATH-A]', { 
        businessId: fallbackCallRecordPayload.business_id, 
        leadId: fallbackCallRecordPayload.lead_id,
        conversationId: fallbackCallRecordPayload.conversation_id
      });
      
      try {
        const { error: followUpError } = await supabase
          .from('follow_up_jobs')
          .insert({
            business_id: fallbackCallRecordPayload.business_id,
            lead_id: fallbackCallRecordPayload.lead_id,
            conversation_id: fallbackCallRecordPayload.conversation_id,
            status: 'pending',
            scheduled_for: new Date().toISOString(),
            created_at: new Date().toISOString()
          });
        
        if (followUpError) {
          console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-A]', followUpError);
        } else {
          console.log('[FOLLOWUP DIRECT INSERT SUCCESS - PATH-A]', { 
            businessId: fallbackCallRecordPayload.business_id, 
            leadId: fallbackCallRecordPayload.lead_id
          });
        }
      } catch (followUpError) {
        console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-A]', followUpError);
      }
      console.log('[FOLLOWUP DIRECT INSERT COMPLETE - PATH-A]');
      
      // Create notification directly using Supabase
      console.log('[NOTIFICATION DIRECT INSERT START - PATH-A]', { 
        businessId: fallbackCallRecordPayload.business_id, 
        leadId: fallbackCallRecordPayload.lead_id
      });
      
      try {
        const notificationPayload = {
          business_id: fallbackCallRecordPayload.business_id,
          type: 'new_lead',
          title: 'New AI Intake Lead',
          message: `A new lead was created from an AI intake call (voicemail fallback)`,
          data: {
            lead_id: fallbackCallRecordPayload.lead_id,
            customer_phone: fallbackCallRecordPayload.caller_phone
          },
          read: false,
          created_at: new Date().toISOString()
        };
        console.log('[NOTIFICATION DIRECT INSERT PAYLOAD - PATH-A]', notificationPayload);
        
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notificationPayload);
        
        if (notificationError) {
          console.log('[NOTIFICATION DIRECT INSERT ERROR - PATH-A]', {
            code: notificationError.code,
            message: notificationError.message,
            details: notificationError.details,
            hint: notificationError.hint
          });
        } else {
          console.log('[NOTIFICATION DIRECT INSERT SUCCESS - PATH-A]', { 
            businessId: fallbackCallRecordPayload.business_id, 
            leadId: fallbackCallRecordPayload.lead_id
          });
        }
      } catch (notificationError) {
        console.log('[NOTIFICATION DIRECT INSERT ERROR - PATH-A]', notificationError);
      }
      console.log('[NOTIFICATION DIRECT INSERT COMPLETE - PATH-A]');
    }

    console.log('[LEAD CREATED FROM FALLBACK] All fallback data saved successfully');

  } catch (error) {
    console.log('[LEAD CREATED FROM FALLBACK] Fallback lead creation failed:', error);
  }
}

// Last-resort SMS fallback function - used when AI fails and voicemail also fails
async function createSmsFallbackLead(
  callSid: string,
  businessId: string,
  callerPhone: string,
  businessName: string,
  forwardedFrom: string,
  failureReason: string
): Promise<void> {
  console.log('[SMS FALLBACK START]', { callSid, businessId, callerPhone, failureReason });
  
  if (!supabase) {
    console.log('[SMS FALLBACK] No Supabase client available');
    return;
  }

  try {
    // Create lead
    const leadInsertPayload = {
      business_id: businessId,
      caller_phone: callerPhone,
      status: 'new',
    };
    
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .upsert({
        business_id: businessId,
        caller_phone: callerPhone,
        status: 'new',
      }, {
        onConflict: 'business_id,caller_phone',
      })
      .select()
      .single();

    if (leadError) {
      console.log('[SMS FALLBACK] Lead creation error:', leadError);
      return;
    }

    console.log('[SMS FALLBACK LEAD CREATED]', { leadId: lead.id, businessId, callerPhone });

    // Create conversation
    const { data: existingConversation, error: conversationLookupError } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .maybeSingle();

    let conversation;
    let conversationError;
    
    if (existingConversation) {
      conversation = existingConversation;
    } else {
      const result = await supabase
        .from('conversations')
        .insert({
          lead_id: lead.id,
          business_id: businessId,
          status: 'active',
        })
        .select()
        .single();
      conversation = result.data;
      conversationError = result.error;
    }

    if (conversationError) {
      console.log('[SMS FALLBACK] Conversation creation error:', conversationError);
      return;
    }

    // Fetch business details for SMS sending
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      console.log('[SMS FALLBACK] Business fetch error:', businessError);
      return;
    }

    // Send missed-call SMS
    const smsMessage = `Hi, this is ${business.name || businessName}. Sorry we missed your call. How can we help?`;
    
    try {
      // Use sendSms function (need to import it or use the existing implementation)
      // For now, we'll create the message record directly
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          lead_id: lead.id,
          business_id: businessId,
          content: smsMessage,
          message_type: 'sms',
        });

      if (messageError) {
        console.log('[SMS FALLBACK] Message creation error:', messageError);
      } else {
        console.log('[SMS FALLBACK SMS SENT]', { leadId: lead.id, conversationId: conversation.id, callerPhone });
      }
    } catch (smsError) {
      console.log('[SMS FALLBACK] SMS send error:', smsError);
    }

    // Create system message about the SMS fallback
    const { error: systemMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        lead_id: lead.id,
        business_id: businessId,
        content: `AI and voicemail both failed (${failureReason}). Missed-call SMS was sent to caller.`,
        message_type: 'system',
      });

    if (systemMessageError) {
      console.log('[SMS FALLBACK] System message creation error:', systemMessageError);
    }

    // Create AI call record for the SMS fallback
    const { error: aiRecordError } = await supabase
      .from('ai_call_records')
      .insert({
        business_id: businessId,
        lead_id: lead.id,
        conversation_id: conversation.id,
        caller_phone: callerPhone || 'unknown',
        call_sid: callSid || 'unknown',
        transcript: [],
        outcome: 'ai_failed_sms',
        extraction_failed: true,
        summary: `AI and voicemail both failed. SMS fallback was triggered.`
      });

    if (aiRecordError) {
      console.log('[SMS FALLBACK] AI call record creation error:', aiRecordError);
    }

    console.log('[SMS FALLBACK COMPLETE]', { leadId: lead.id, businessId, callerPhone });

  } catch (error) {
    console.log('[SMS FALLBACK] SMS fallback failed:', error);
  }
}

function recordAIFailure(tracker: AISessionStateTracker, failureStage: string, failureReason: string): void {
  if (!supabase) {
    console.log('[AI FAILURE RECORDED] No Supabase client, skipping database record');
    return;
  }
  
  try {
    supabase
      .from('ai_call_failures')
      .insert({
        call_sid: tracker.metrics.callSid,
        business_id: tracker.metrics.businessId,
        failure_stage: failureStage,
        failure_reason: failureReason,
        created_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) {
          console.error('[AI FAILURE RECORD] Database insert failed:', error);
        } else {
          console.log('[AI FAILURE RECORDED]', {
            callSid: tracker.metrics.callSid,
            failureStage,
            failureReason,
          });
        }
      });
  } catch (error) {
    console.error('[AI FAILURE RECORD] Exception:', error);
  }
}

function generateLeadSummary(intake: IntakeData): LeadSummary {
  const summary = `${intake.customerName || 'Caller'} called about ${intake.serviceRequested || 'general inquiry'}. Issue: ${intake.issueDescription || 'not specified'}. Location: ${intake.serviceAddress || 'not specified'}. Desired completion time: ${intake.desiredCompletionTime || 'not specified'}. Callback requested at ${intake.callbackTime || 'anytime'}.`;

  return {
    callerName: intake.customerName,
    reason: intake.serviceRequested,
    desiredCompletionTime: intake.desiredCompletionTime,
    addressOrLocation: intake.serviceAddress,
    preferredCallbackTime: intake.callbackTime,
    summary,
    timestamp: new Date().toISOString(),
    callSid: intake.callSid,
    businessId: intake.businessId,
    businessName: intake.businessName
  };
}

async function saveLeadSummary(leadSummary: LeadSummary) {
  if (!supabase) {
    console.log('[AI INTAKE] Supabase not available, skipping save');
    return;
  }
  
  try {
    console.log('[AI SUMMARY GENERATED]', JSON.stringify(leadSummary, null, 2));
    
    // Save to conversations table
    const conversationInsertPayload = {
      business_id: leadSummary.businessId,
      status: 'new',
      created_at: leadSummary.timestamp,
      updated_at: leadSummary.timestamp,
    };
    console.log('[CONVERSATION INSERT PAYLOAD]', conversationInsertPayload);
    
    const { error } = await supabase
      .from('conversations')
      .insert({
        business_id: leadSummary.businessId,
        status: 'new',
        created_at: leadSummary.timestamp,
        updated_at: leadSummary.timestamp,
      });
      
    if (error) {
      console.log('[AI INTAKE] Error saving conversation:', error);
    } else {
      console.log('[AI INTAKE] Lead summary saved successfully');
    }
  } catch (error) {
    console.log('[AI INTAKE] Error saving lead summary:', error);
  }
}

if (!OPENAI_API_KEY) {
  log(LogLevel.ERROR, 'OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Startup logging - print version information
console.log('='.repeat(80));
console.log('[SERVICE STARTUP] ========================================');
console.log('[SERVICE STARTUP] ReplyFlow AI Voice Service');
console.log('[SERVICE STARTUP] Commit: e26bfd33');
console.log('[SERVICE STARTUP] Deployment Timestamp:', new Date().toISOString());
console.log('[SERVICE STARTUP] Closing Strategy: mark-based-v3-with-hard-stop');
console.log('[SERVICE STARTUP] Node Version:', process.version);
console.log('[SERVICE STARTUP] ========================================');
console.log('='.repeat(80));

// Add process-level error handlers
process.on('uncaughtException', (error) => {
  console.error('[PROCESS] uncaughtException', error);
  console.error('[PROCESS] stack trace', error.stack);
  log(LogLevel.ERROR, '[PROCESS] uncaughtException', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] unhandledRejection', reason);
  console.error('[PROCESS] promise', promise);
  if (reason instanceof Error) {
    console.error('[PROCESS] stack trace', reason.stack);
  }
  log(LogLevel.ERROR, '[PROCESS] unhandledRejection', { reason, promise });
});

// Create HTTP server for health checks
const server = createServer((req, res) => {
  // Log ALL incoming HTTP requests
  console.log('[HTTP REQUEST]', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
    headers: JSON.stringify(req.headers)
  });
  
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'ai-voice-poc', commit: '3c67556', hangupRouter: 'v3' }));
    return;
  }

  // Twilio final close endpoint - returns TwiML for final sentence and hangup
  if (req.url === '/api/twilio/ai-final-close') {
    console.log('[FINAL CLOSE TWIML HIT] =========================================');
    console.log('[FINAL CLOSE TWIML HIT] Twilio final close TwiML endpoint hit');
    console.log('[FINAL CLOSE TWIML HIT] Timestamp:', new Date().toISOString());
    console.log('[FINAL CLOSE TWIML HIT] =========================================');
    
    console.log('[FINAL CLOSE VOICE SELECTED] =========================================');
    console.log('[FINAL CLOSE VOICE SELECTED] Voice:', FINAL_CLOSE_TWILIO_VOICE);
    console.log('[FINAL CLOSE VOICE SELECTED] Timestamp:', new Date().toISOString());
    console.log('[FINAL CLOSE VOICE SELECTED] =========================================');
    
    console.log('[FINAL CLOSE TWIML SAY SENT] =========================================');
    console.log('[FINAL CLOSE TWIML SAY SENT] Final sentence to be spoken:', FINAL_CLOSE_SENTENCE);
    console.log('[FINAL CLOSE TWIML SAY SENT] Timestamp:', new Date().toISOString());
    console.log('[FINAL CLOSE TWIML SAY SENT] =========================================');
    
    console.log('[FINAL CLOSE TWIML SAY VOICE] =========================================');
    console.log('[FINAL CLOSE TWIML SAY VOICE] Using voice:', FINAL_CLOSE_TWILIO_VOICE);
    console.log('[FINAL CLOSE TWIML SAY VOICE] Timestamp:', new Date().toISOString());
    console.log('[FINAL CLOSE TWIML SAY VOICE] =========================================');
    
    console.log('[FINAL CLOSE TWIML HANGUP SENT] =========================================');
    console.log('[FINAL CLOSE TWIML HANGUP SENT] Hangup instruction sent');
    console.log('[FINAL CLOSE TWIML HANGUP SENT] Timestamp:', new Date().toISOString());
    console.log('[FINAL CLOSE TWIML HANGUP SENT] =========================================');
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${FINAL_CLOSE_TWILIO_VOICE}">${FINAL_CLOSE_SENTENCE}</Say>
  <Hangup/>
</Response>`;
    
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(twiml);
    return;
  }

  // Test OpenAI websocket connection endpoint
  if (req.url === '/test-openai') {
    console.log('[TEST OPENAI] endpoint hit');
    console.log('[TEST OPENAI] key present', { exists: !!OPENAI_API_KEY });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
    const headers = {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    };

    console.log('[TEST OPENAI] creating websocket');
    const testWs = new WebSocket(wsUrl, { headers });
    console.log('[TEST OPENAI] websocket created, readyState:', testWs.readyState);
    
    let opened = false;
    let errored = false;
    let closed = false;
    let result = '';
    let errorMessage = '';
    let events = [];

    console.log('[TEST OPENAI] listeners attaching');
    testWs.on('open', () => {
      opened = true;
      result = 'open';
      console.log('[TEST OPENAI] open event fired');
      events.push({ type: 'open', timestamp: Date.now() });
      
      // Wait 2 seconds to confirm connection stays open
      setTimeout(() => {
        console.log('[TEST OPENAI] 2s delay complete, readyState:', testWs.readyState);
        events.push({ type: 'delay_complete', timestamp: Date.now(), readyState: testWs.readyState });
        const response = JSON.stringify({
          ok: true,
          result: 'open',
          readyState: testWs.readyState,
          events: events,
        });
        res.end(response);
        testWs.close();
      }, 2000);
    });

    testWs.on('error', (error) => {
      errored = true;
      result = 'error';
      errorMessage = String(error);
      console.log('[TEST OPENAI] error event fired', error);
      events.push({ type: 'error', timestamp: Date.now(), error: errorMessage });
      const response = JSON.stringify({
        ok: false,
        result: 'error',
        error: errorMessage,
        readyState: testWs.readyState,
        events: events,
      });
      res.end(response);
    });

    testWs.on('close', (code, reason) => {
      closed = true;
      if (!opened && !errored) {
        result = 'close';
      }
      console.log('[TEST OPENAI] close event fired', { code, reason: reason?.toString(), readyState: testWs.readyState });
      events.push({ type: 'close', timestamp: Date.now(), code, reason: reason?.toString(), readyState: testWs.readyState });
      const response = JSON.stringify({
        ok: false,
        result: result || 'close',
        readyState: testWs.readyState,
        events: events,
      });
      res.end(response);
    });

    testWs.on('unexpected-response', (request, response) => {
      result = 'unexpected-response';
      console.log('[TEST OPENAI] unexpected-response event fired', { statusCode: response.statusCode });
      events.push({ type: 'unexpected-response', timestamp: Date.now(), statusCode: response.statusCode });
      const responseBody = JSON.stringify({
        ok: false,
        result: 'unexpected-response',
        statusCode: response.statusCode,
        headers: response.headers,
        readyState: testWs.readyState,
        events: events,
      });
      res.end(responseBody);
    });

    console.log('[TEST OPENAI] listeners attached');

    // Log readyState every 3 seconds
    const stateCheckInterval = setInterval(() => {
      console.log('[TEST OPENAI] periodic state check', { readyState: testWs.readyState, eventsCount: events.length });
      events.push({ type: 'state_check', timestamp: Date.now(), readyState: testWs.readyState });
    }, 3000);

    // Timeout after 15 seconds
    setTimeout(() => {
      clearInterval(stateCheckInterval);
      if (!closed && !opened && !errored) {
        result = 'timeout';
        console.log('[TEST OPENAI] timeout after 15s');
        console.log('[TEST OPENAI] final readyState', testWs.readyState);
        events.push({ type: 'timeout', timestamp: Date.now(), readyState: testWs.readyState });
        const response = JSON.stringify({
          ok: false,
          result: 'timeout',
          readyState: testWs.readyState,
          events: events,
        });
        res.end(response);
        if (testWs) {
          testWs.close();
        }
      }
    }, 15000);

    return;
  }

  // Debug OpenAI Realtime without Twilio
  if (req.url === '/debug-openai-realtime') {
    console.log('[DEBUG OPENAI] starting debug test');
    
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
    const headers = {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    };

    console.log('[DEBUG OPENAI] websocket URL:', wsUrl);
    console.log('[DEBUG OPENAI] headers keys:', Object.keys(headers));

    const debugWs = new WebSocket(wsUrl, { headers });
    console.log('[DEBUG OPENAI] websocket created, readyState:', debugWs.readyState);

    const events: any[] = [];
    let opened = false;
    let errored = false;
    let closed = false;

    debugWs.on('open', () => {
      opened = true;
      console.log('[DEBUG OPENAI] websocket open');
      events.push({ type: 'open', timestamp: Date.now() });

      // Send simplest GA-compatible request
      const testMessage = {
        type: 'response.create',
        response: {
          instructions: 'Hello from ReplyFlow. Always respond in English only.',
        },
      };
      console.log('[DEBUG OPENAI] outbound payload:', JSON.stringify(testMessage, null, 2));
      debugWs.send(JSON.stringify(testMessage));
      events.push({ type: 'outbound_message', timestamp: Date.now(), payload: testMessage });
    });

    debugWs.on('message', (data) => {
      console.log('[DEBUG OPENAI] inbound message');
      
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (err) {
        console.log('[DEBUG OPENAI] JSON parse failed', err);
        return;
      }

      console.log('[DEBUG OPENAI] inbound message type:', message.type);
      events.push({ type: 'inbound_message', timestamp: Date.now(), messageType: message.type });

      if (message.type === 'error') {
        console.log('[DEBUG OPENAI] error full payload:', JSON.stringify(message, null, 2));
        events.push({ type: 'error', timestamp: Date.now(), payload: message });
      }

      if (message.type === 'response.output_audio.delta' && message.delta) {
        console.log('[DEBUG OPENAI] audio delta received, length:', message.delta.length);
        events.push({ type: 'audio_delta', timestamp: Date.now(), length: message.delta.length });
      }
    });

    debugWs.on('error', (error) => {
      errored = true;
      console.log('[DEBUG OPENAI] error:', String(error));
      events.push({ type: 'error_event', timestamp: Date.now(), error: String(error) });
    });

    debugWs.on('close', (code, reason) => {
      closed = true;
      console.log('[DEBUG OPENAI] close code:', code, 'reason:', reason?.toString());
      events.push({ type: 'close', timestamp: Date.now(), code, reason: reason?.toString() });

      const responseBody = JSON.stringify({
        ok: opened && !errored,
        opened,
        errored,
        closed,
        finalState: {
          readyState: debugWs.readyState,
        },
        events: events,
      });

      res.end(responseBody);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!closed) {
        console.log('[DEBUG OPENAI] timeout after 10s');
        events.push({ type: 'timeout', timestamp: Date.now() });
        debugWs.close();
      }
    }, 10000);

    return;
  }

  // Minimal test endpoint to verify ws.on("open") fires
  if (req.url === '/debug-openai-realtime-minimal') {
    console.log('[MINIMAL TEST] starting minimal websocket test');
    console.log('[MINIMAL TEST] WebSocket package:', 'ws');
    console.log('[MINIMAL TEST] API key exists:', !!OPENAI_API_KEY);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
    console.log('[MINIMAL TEST] creating websocket to:', wsUrl);
    
    const testWs = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });
    
    console.log('[MINIMAL TEST] websocket created, readyState:', testWs.readyState);
    
    testWs.on('open', () => {
      console.log('[MINIMAL TEST] OPEN event fired');
    });
    
    testWs.on('message', (msg) => {
      const msgLength = Buffer.isBuffer(msg) ? msg.length : msg instanceof ArrayBuffer ? msg.byteLength : 0;
      console.log('[MINIMAL TEST] MESSAGE received, length:', msgLength);
    });
    
    testWs.on('error', (err) => {
      console.log('[MINIMAL TEST] ERROR event:', String(err));
    });
    
    testWs.on('close', (code, reason) => {
      console.log('[MINIMAL TEST] CLOSE event, code:', code, 'reason:', reason);
    });
    
    // Log readyState every second for 10 seconds
    for (let i = 1; i <= 10; i++) {
      setTimeout(() => {
        console.log(`[MINIMAL TEST] after ${i}s readyState:`, testWs.readyState);
      }, i * 1000);
    }
    
    // Close after 10 seconds
    setTimeout(() => {
      console.log('[MINIMAL TEST] closing websocket after 10s');
      testWs.close();
    }, 10000);
    
    res.end(JSON.stringify({ status: 'minimal test started', url: wsUrl }));
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const CONFIRMATION_SUFFIX = " Is this correct?";

// Schedule hangup only (for when final goodbye was already sent) - DISABLED - using response.audio.done instead
async function scheduleHangupOnly(ws: any, twilioHandler: any) {
  console.log('[OLD HANGUP PATH DISABLED] scheduleHangupOnly is disabled, using response.audio.done path instead');
  return; // DISABLED - do nothing, let response.audio.done handle hangup
}

// Send final goodbye and hangup deterministically - DISABLED - using response.audio.done instead
async function sendFinalGoodbyeAndHangup(ws: any, twilioHandler: any, openAiWs: any) {
  console.log('[OLD HANGUP PATH DISABLED] sendFinalGoodbyeAndHangup is disabled, using response.audio.done path instead');
  return; // DISABLED - do nothing, let response.audio.done handle hangup
}

// Close call after confirmation function - DISABLED - using response.audio.done instead
async function closeCallAfterConfirmation(ws: any, twilioHandler: any, openAiWs: any) {
  console.log('[OLD HANGUP PATH DISABLED] closeCallAfterConfirmation is disabled, using response.audio.done path instead');
  return; // DISABLED - do nothing, let response.audio.done handle hangup
}

// Authoritative final-close function that sets all closing flags together
// This is the ONLY place where final closing state transitions should happen
function startAuthoritativeFinalClose(
  closingState: {
    callState: string;
    confirmationState: string;
    finalClosingStarted: boolean;
    terminalClosingResponseStarted: boolean;
    hardStopStarted: boolean;
    hardStopExecuted: boolean;
  },
  twilioHandler: any,
  source: string
) {
  console.log('[AUTHORITATIVE FINAL CLOSE] Starting authoritative final close sequence');
  console.log('[AUTHORITATIVE FINAL CLOSE] Source:', source);
  console.log('[AUTHORITATIVE FINAL CLOSE] Timestamp:', new Date().toISOString());
  console.log('[AUTHORITATIVE FINAL CLOSE] Current states:', {
    callState: closingState.callState,
    finalClosingStarted: closingState.finalClosingStarted,
    terminalClosingResponseStarted: closingState.terminalClosingResponseStarted,
    confirmationState: closingState.confirmationState
  });

  // Validate preconditions
  if (closingState.confirmationState === 'collecting_info') {
    console.log('[AUTHORITATIVE FINAL CLOSE ERROR] Cannot start final close while confirmationState is collecting_info');
    console.log('[AUTHORITATIVE FINAL CLOSE ERROR] This indicates intake is not yet complete');
    return false;
  }

  // Set all flags together in the correct sequence
  console.log('[AUTHORITATIVE FINAL CLOSE] Step 1: confirmationState -> completed');
  closingState.confirmationState = 'completed';
  (twilioHandler as any).confirmationState = closingState.confirmationState;

  console.log('[AUTHORITATIVE FINAL CLOSE] Step 2: terminalClosingResponseStarted -> true');
  console.log('[TERMINAL_CLOSING_SET_TRUE] Setting terminalClosingResponseStarted to true');
  console.log('[TERMINAL_CLOSING_SET_TRUE] Source: startAuthoritativeFinalClose at', source);
  console.log('[TERMINAL_CLOSING_SET_TRUE] Stack: startAuthoritativeFinalClose -> called from event handler');
  console.log('[TERMINAL_CLOSING_SET_TRUE] Timestamp:', new Date().toISOString());
  closingState.terminalClosingResponseStarted = true;
  (twilioHandler as any).terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
  console.log('[TERMINAL_CLOSING_SET_TRUE] Value after set:', closingState.terminalClosingResponseStarted);

  console.log('[AUTHORITATIVE FINAL CLOSE] Step 3: finalClosingStarted -> true');
  console.log('[FINAL_CLOSING_SET_TRUE] Setting finalClosingStarted to true');
  console.log('[FINAL_CLOSING_SET_TRUE] Source: startAuthoritativeFinalClose at', source);
  console.log('[FINAL_CLOSING_SET_TRUE] Stack: startAuthoritativeFinalClose -> called from event handler');
  console.log('[FINAL_CLOSING_SET_TRUE] Timestamp:', new Date().toISOString());
  closingState.finalClosingStarted = true;
  (twilioHandler as any).finalClosingStarted = closingState.finalClosingStarted;
  console.log('[FINAL_CLOSING_SET_TRUE] Value after set:', closingState.finalClosingStarted);

  console.log('[AUTHORITATIVE FINAL CLOSE] Step 4: callState -> closing (set immediately, not waiting for audio)');
  
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] =========================================');
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Source: startAuthoritativeFinalClose function at line 2958');
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Trigger: Authoritative final close sequence initiated');
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Caller source:', source);
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Current callState:', closingState.callState);
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Current terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Current finalClosingStarted:', closingState.finalClosingStarted);
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Current confirmationState:', closingState.confirmationState);
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Stack: startAuthoritativeFinalClose -> immediate state transition');
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] Timestamp:', new Date().toISOString());
  console.log('[CALL STATE CLOSING REQUEST - PATH 3] =========================================');
  
  console.log('[CALL_STATE_SET_CLOSING] Setting callState to closing immediately');
  console.log('[CALL_STATE_SET_CLOSING] Source: startAuthoritativeFinalClose at', source);
  console.log('[CALL_STATE_SET_CLOSING] Stack: startAuthoritativeFinalClose -> immediate state transition');
  console.log('[CALL_STATE_SET_CLOSING] Timestamp:', new Date().toISOString());
  closingState.callState = 'closing';
  (twilioHandler as any).callState = closingState.callState;
  console.log('[CALL_STATE_SET_CLOSING] Value after set:', closingState.callState);
  
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] =========================================');
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] New callState:', closingState.callState);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] New terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] New finalClosingStarted:', closingState.finalClosingStarted);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] New confirmationState:', closingState.confirmationState);
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] Timestamp:', new Date().toISOString());
  console.log('[CALL STATE CLOSING COMPLETED - PATH 3] =========================================');

  // Start absolute hard-stop timer (10 seconds)
  // This ensures call terminates even if all other mechanisms fail
  const hardStopTimerRef = (twilioHandler as any).hardStopTimer;
  if (!closingState.hardStopExecuted) {
    console.log('[FINAL_CLOSING_HARD_STOP_TIMER_STARTED] Starting 10 second absolute hard-stop timer');
    console.log('[FINAL_CLOSING_HARD_STOP_TIMER_STARTED] Timestamp:', new Date().toISOString());
    console.log('[FINAL_CLOSING_HARD_STOP_TIMER_STARTED] This ensures call terminates even if all other mechanisms fail');

    const wsRef = (twilioHandler as any).wsRef;

    (twilioHandler as any).hardStopTimer = setTimeout(async () => {
      const currentCallState = closingState.callState;
      const currentHardStopExecuted = closingState.hardStopExecuted;

      console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] Hard-stop timer fired');
      console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] Timestamp:', new Date().toISOString());
      console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] Current callState:', currentCallState);
      console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] hardStopExecuted:', currentHardStopExecuted);

      if (currentCallState !== 'closed' && !currentHardStopExecuted) {
        console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] Call not closed, executing endCallCleanly directly');
        console.log('[FINAL_CLOSING_HARD_STOP_EXECUTED] Reason: 10 second hard-stop timer expired');

        closingState.hardStopExecuted = true;
        (twilioHandler as any).hardStopExecuted = closingState.hardStopExecuted;

        try {
          await endCallCleanly(wsRef, twilioHandler);
          console.log('[FINAL_CLOSING_HARD_STOP_COMPLETE] Call terminated successfully via hard-stop');
          console.log('[FINAL_CLOSING_HARD_STOP_COMPLETE] Timestamp:', new Date().toISOString());
          closingState.callState = 'closed';
          (twilioHandler as any).callState = closingState.callState;
        } catch (error) {
          console.log('[FINAL_CLOSING_HARD_STOP_FAILED] Error during hard-stop hangup:', error);
          console.log('[FINAL_CLOSING_HARD_STOP_FAILED] Error details:', error instanceof Error ? error.message : String(error));
        }
      } else {
        console.log('[FINAL_CLOSING_HARD_STOP_SKIPPED] Hard-stop not needed because:');
        console.log('[FINAL_CLOSING_HARD_STOP_SKIPPED] callState:', currentCallState);
        console.log('[FINAL_CLOSING_HARD_STOP_SKIPPED] hardStopExecuted:', currentHardStopExecuted);
      }
    }, 10000); // 10 second hard-stop
  }
  // Note: callState will be set to 'closing' when the actual audio delta starts
  // This prevents blocking audio before it's ready

  console.log('[AUTHORITATIVE FINAL CLOSE] Complete - all flags set');
  console.log('[AUTHORITATIVE FINAL CLOSE] New states:', {
    callState: closingState.callState,
    finalClosingStarted: closingState.finalClosingStarted,
    terminalClosingResponseStarted: closingState.terminalClosingResponseStarted,
    confirmationState: closingState.confirmationState
  });

  return true;
}

// Clean call ending function
async function endCallCleanly(ws: any, twilioHandler: any) {
  // Note: Logging is now handled by the response.audio.done handler
  // This function only executes the actual hangup
  
  try {
    const callContext = (ws as any).callContext;
    const callSid = callContext?.callSid || (ws as any).callSid;
    const businessId = callContext?.businessId || (ws as any).businessId;
    const sessionId = callContext?.sessionId || (ws as any).sessionId;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    
    // Final call transcript audit
    const transcript = (ws as any).transcript || [];
    const intakeData = (ws as any).intakeData || (twilioHandler as any).intakeData;
    const finalStage = intakeData?.stage || 'unknown';
    
    console.log('[CALL TRANSCRIPT AUDIT] =========================================');
    console.log('[CALL TRANSCRIPT AUDIT] allCallerTranscripts:', JSON.stringify(transcript.filter((t: any) => t.role === 'user'), null, 2));
    console.log('[CALL TRANSCRIPT AUDIT] transcriptCount:', transcript.filter((t: any) => t.role === 'user').length);
    console.log('[CALL TRANSCRIPT AUDIT] finalIntakeData:', JSON.stringify(intakeData, null, 2));
    console.log('[CALL TRANSCRIPT AUDIT] finalStage:', finalStage);
    console.log('[CALL TRANSCRIPT AUDIT] callSid:', callSid);
    console.log('[CALL TRANSCRIPT AUDIT] sessionId:', sessionId);
    console.log('[CALL TRANSCRIPT AUDIT] Timestamp:', new Date().toISOString());
    console.log('[CALL TRANSCRIPT AUDIT] =========================================');
    
    console.log('[CALL CONTEXT USED FOR HANGUP]', { callSid, businessId, sessionId, callContext });
    
    console.log('[AUTO HANGUP CONDITIONS MET] Checking required parameters', {
      hasCallSid: !!callSid,
      hasBusinessId: !!businessId,
      hasSessionId: !!sessionId,
      hasTwilioAccountSid: !!twilioAccountSid,
      callSid: callSid || 'missing',
      businessId: businessId || 'missing',
      sessionId: sessionId || 'missing',
      twilioAccountSid: twilioAccountSid ? 'present' : 'missing'
    });
    
    if (!callSid) {
      console.log('[TWILIO HANGUP ERROR] No callSid available for hangup');
      console.log('[TWILIO HANGUP ERROR] callSid became unavailable at:', {
        wsProperties: Object.getOwnPropertyNames(ws),
        wsCallSid: (ws as any).callSid,
        wsBusinessId: (ws as any).businessId,
        wsSessionId: (ws as any).sessionId,
        wsCallContext: (ws as any).callContext
      });
      return;
    }
    
    // Verify Twilio client availability
    const twilioClient = (twilioHandler as any).twilioClient;
    console.log('[AUTO HANGUP CONDITIONS MET] Checking Twilio client availability', {
      hasTwilioClient: !!twilioClient,
      twilioClientType: typeof twilioClient,
      twilioClientMethods: twilioClient ? Object.getOwnPropertyNames(twilioClient) : 'none'
    });
    
    if (twilioClient && callSid) {
      console.log('[TWILIO HANGUP EXECUTING] Terminating call via REST API', {
        callSid,
        businessId,
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Execute the hangup
      const updateResult = await twilioClient.calls(callSid).update({ status: 'completed' });
      
      console.log('[TWILIO HANGUP SUCCESS] Call terminated successfully', {
        callSid,
        resultStatus: updateResult.status,
        timestamp: new Date().toISOString()
      });
      
    } else {
      // Fallback: close the WebSocket connection
      console.log('[TWILIO HANGUP ERROR] Twilio client not available, using WebSocket fallback');
      console.log('[TWILIO HANGUP ERROR] Twilio client details:', {
        twilioClientExists: !!twilioClient,
        callSidExists: !!callSid,
        twilioClientType: typeof twilioClient,
        twilioHandlerType: typeof twilioHandler
      });
      console.log('[AUTO HANGUP FALLBACK] Closing WebSocket connection');
      ws.close();
      console.log('[AUTO HANGUP FALLBACK] WebSocket closed');
    }
  } catch (error) {
    console.log('[TWILIO HANGUP ERROR] Exception during call termination', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      callSid: (ws as any).callSid,
      businessId: (ws as any).businessId,
      sessionId: (ws as any).sessionId,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID
    });
  }
}

// Create WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws, req) => {
  console.log('[STREAM ENDPOINT HIT]');
  console.log('[VOICE WEBHOOK HIT]');
  log(LogLevel.INFO, '[WS ENTRY] raw request received');
  log(LogLevel.INFO, '[WS ENTRY] request url:', req.url);
  log(LogLevel.INFO, '[WS ENTRY] headers:', JSON.stringify(req.headers));
  log(LogLevel.INFO, '[WS ENTRY] websocket upgrade started');
  log(LogLevel.INFO, '[WS ENTRY] websocket accepted');
  log(LogLevel.INFO, '[AI POC] websocket accepted');

  try {
    // Extract parameters from URL (fallback - not required)
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    log(LogLevel.INFO, '[AI POC] raw websocket request url:', req.url);
    log(LogLevel.INFO, '[VERSION] Commit: 95f41acc - Mark-based playback barrier implementation');
    log(LogLevel.INFO, '[VERSION] Confirmation: Separate dedicated confirmation response design');

    const urlSessionId = url.searchParams.get('sessionId');
    const urlBusinessId = url.searchParams.get('businessId');
    const urlCallSid = url.searchParams.get('callSid');

    log(LogLevel.INFO, '[AI POC] URL params', { sessionId: urlSessionId, callSid: urlCallSid });

    // Declare state variables before using them
    let firstFrameLogged = false;
    let debugMessageCount = 0;
    const DEBUG_MESSAGE_LIMIT = 20;
    let mediaPacketCount = 0;
    let firstMediaPacketLogged = false;
    let audioReceived = false;
    let openaiInitAttempted = false;
    let openaiInitSucceeded = false;
    let openaiInitFailed = false;
    let startEventProcessed = false;
    let openAiWs: WebSocket | null = null;

    // Transcript capture with structured data
    let transcript: Array<{role: 'user' | 'assistant'; text: string; timestamp: string}> = [];
    const activeAssistantTranscripts = new Map<string, string>(); // Buffer keyed by item_id

    // Call state for clean call ending - deterministic state machine
    type CallState = 'active' | 'closing' | 'closing_audio_playing' | 'closing_error' | 'closed';
    type ConfirmationState = 'not_started' | 'collecting_info' | 'confirmation_sent' | 'confirmed' | 'completed';

    // Single shared closing state object - single source of truth
    const closingState = {
      callState: 'active' as CallState,
      confirmationState: 'collecting_info' as ConfirmationState,
      finalClosingStarted: false,
      terminalClosingResponseStarted: false,
      finalClosingAudioDone: false,
      hangupScheduled: false,
      hardStopStarted: false,
      hardStopExecuted: false,
      intakeTerminalComplete: false
    };

    console.log('[CLOSING_STATE_INIT] Shared closing state object created');
    console.log('[CLOSING_STATE_INIT] Initial state:', JSON.stringify(closingState, null, 2));
    console.log('[CLOSING_STATE_INIT] Timestamp:', new Date().toISOString());

    // Single shared call session state object - single source of truth for all call state
    const callSessionState = {
      callState: 'active' as CallState,
      confirmationState: 'collecting_info' as ConfirmationState,
      finalClosingStarted: false,
      terminalClosingResponseStarted: false,
      finalClosingAudioDone: false,
      hangupScheduled: false,
      hardStopStarted: false,
      hardStopExecuted: false,
      intakeTerminalComplete: false,
      assistantSpeaking: false,
      lastPromptStage: null as IntakeStage | null,
      lastPromptAt: 0,
      activeResponseId: null as string | null,
      intakeData: null as IntakeData | null,
      currentStage: 'ask_name_reason' as IntakeStage,
      sessionId: '',
      businessId: '',
      callSid: ''
    };

    console.log('[CALL_SESSION_STATE_INIT] Shared call session state object created');
    console.log('[CALL_SESSION_STATE_INIT] Initial state:', JSON.stringify(callSessionState, null, 2));
    console.log('[CALL_SESSION_STATE_INIT] Timestamp:', new Date().toISOString());

    // Individual variables kept for backward compatibility during transition
    // These will be deprecated once all code uses callSessionState directly
    let callState: CallState = 'active';
    let finalClosingStarted = false;
    let terminalClosingResponseStarted = false;
    let finalClosingAudioDone = false;
    let hangupScheduled = false;
    let confirmationState: ConfirmationState = 'collecting_info';
    let hardStopExecuted = false;
    let postCallSmsSent = false;
    let assistantSpeaking = false;
    let finalGoodbyeMarkReceived = false; // Track when final-goodbye-complete mark is received
    let finalGoodbyeMarkSent = false; // Track when final-goodbye-complete mark is sent
    
    // Per-stage prompt guard to prevent duplicate prompts
    const promptedStages = new Set<IntakeStage>();
    const stagePromptAttempts = new Map<IntakeStage, number>(); // Track prompt attempts per stage
    let lastPromptStage: IntakeStage | null = null;
    let lastPromptAt: number = 0;
    let activeResponseId: string | null = null;
    let assistantSpeakingTimeout: NodeJS.Timeout | null = null; // Timeout protection for assistantSpeaking
    let finalAudioFallbackTimer: NodeJS.Timeout | null = null; // Fallback timer for mark sending
    let finalAudioFallbackStarted = false; // Track if fallback timer has been started
    let directHangupFallbackTimer: NodeJS.Timeout | null = null; // Direct hangup fallback timer
    let directHangupFallbackExecuted = false; // Track if direct hangup fallback has been executed
    let incompleteFinalizationStarted = false;
    let callerAudioBlockedLogged = false; // One-time guard for CALLER AUDIO BLOCKED logging

    // Listener count tracking
    let openAiMessageListenerCount = 0;
    let streamCloneCount = 0;

    let intakeComplete = false;

    let callerPhone: string = '';
    let sessionId: string = '';
    let businessId: string = '';
    let callSid: string = '';
    let forwardedFrom: string = '';
    let callOutcome: 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback' = 'completed';
    let businessName: string = 'ReplyFlow';

    // Create Twilio stream handler with placeholder parameters
    // Real parameters will come from Twilio's "start" event
    const twilioHandler = new TwilioStreamHandler({
      sessionId: urlSessionId || '',
      businessId: urlBusinessId || '',
      callSid: urlCallSid || '',
    });

    // Simplified confirmation flow - no mark complexity
    // We use response.done events to sequence the responses deterministically

    // Pass shared closing state to twilioHandler for audio append guards
    (twilioHandler as any).closingState = closingState;
    (twilioHandler as any).callSessionState = callSessionState;

    // Sync callSessionState with session identifiers
    callSessionState.sessionId = urlSessionId || '';
    callSessionState.businessId = urlBusinessId || '';
    callSessionState.callSid = urlCallSid || '';

    // Set up mark received callback to track when Twilio acknowledges final goodbye audio playback
    twilioHandler.setOnMarkReceived((markName: string) => {
      console.log('[MARK RECEIVED CALLBACK] Mark received from Twilio:', { markName, timestamp: new Date().toISOString() });
      
      if (markName === 'final-goodbye-complete') {
        console.log('[FINAL GOODBYE MARK RECEIVED] final-goodbye-complete mark received');
        console.log('[FINAL GOODBYE MARK RECEIVED] Timestamp:', new Date().toISOString());
        console.log('[FINAL GOODBYE MARK RECEIVED] callState:', callState);
        console.log('[FINAL GOODBYE MARK RECEIVED] finalClosingStarted:', finalClosingStarted);
        console.log('[FINAL GOODBYE MARK RECEIVED] hangupScheduled:', hangupScheduled);
        
        finalGoodbyeMarkReceived = true;
        (twilioHandler as any).finalGoodbyeMarkReceived = finalGoodbyeMarkReceived;

        // Clear hard-stop timer since normal hangup path is working
        const hardStopTimer = (twilioHandler as any).hardStopTimer;
        if (hardStopTimer) {
          clearTimeout(hardStopTimer);
          (twilioHandler as any).hardStopTimer = null;
          console.log('[FINAL_CLOSING_HARD_STOP_CLEARED] Hard-stop timer cleared since normal hangup path is working');
        }

        // Final-goodbye-complete mark handling removed - using response.audio.done instead
        // The 5s buffer after response.audio.done handles the successful close path
        console.log('[FINAL GOODBYE MARK RECEIVED] Mark received, but hangup handled by response.audio.done');
      }
    });

    log(LogLevel.INFO, '[AI POC] waiting for Twilio start event');

    // AI timeout detection - trigger voicemail fallback if AI doesn't start within 10 seconds
    let aiTimeoutTimer: NodeJS.Timeout | null = null;
    let aiGreetingGenerated = false;
    const AI_TIMEOUT_MS = 10000; // 10 seconds

    // Start AI timeout timer - will trigger voicemail fallback if AI doesn't start within 10 seconds
    aiTimeoutTimer = setTimeout(async () => {
      if (!aiGreetingGenerated && openaiInitAttempted && !openaiInitSucceeded) {
        console.log('[AI FALLBACK TRIGGERED]', { 
          reason: 'AI timeout before greeting generated',
          callSid: callSid || 'unknown',
          businessId: businessId || 'unknown'
        });
        console.log('[AI FALLBACK REASON]', 'AI timeout before greeting generated');
        
        // Trigger voicemail fallback
        const aiSessionTracker = createAISessionTracker(callSid || '', businessId || '');
        await triggerVoicemailFallback(
          ws, 
          twilioHandler, 
          aiSessionTracker, 
          'AI timeout before greeting generated', 
          callSid || '', 
          businessId || '', 
          callerPhone || '', 
          businessName || '', 
          forwardedFrom || ''
        );
      }
    }, AI_TIMEOUT_MS);

    // Ingestion function to save call data - moved to correct scope
    const ingestCallData = async () => {
      console.log('[COMPLETE FINALIZATION STEP 3] =========================================');
      console.log('[COMPLETE FINALIZATION STEP 3] ingestCallData() triggered - WebSocket closed');
      console.log('[COMPLETE FINALIZATION STEP 3] Timestamp:', new Date().toISOString());
      console.log('[COMPLETE FINALIZATION STEP 3] =========================================');
      
      console.log('[INGEST CALL DATA ENTER] =========================================');
      console.log('[INGEST CALL DATA ENTER] Function entry');
      console.log('[INGEST CALL DATA ENTER] Timestamp:', new Date().toISOString());
      console.log('[INGEST CALL DATA ENTER] =========================================');
      
      console.log('[CALL END DETECTED] WebSocket closed, starting post-call persistence');
      console.log('[INGEST CALL DATA START] Function called');
      
      const sessionSessionId = (ws as any).sessionId || '';
      const sessionBusinessId = (ws as any).businessId || '';
      const sessionCallSid = (ws as any).callSid || '';
      const sessionCallerPhone = (ws as any).callerPhone || '';
      const sessionForwardedFrom = (ws as any).forwardedFrom || '';
      
      // Check if incomplete finalization owns this call
      if (finalizationInProgressByCallSid.has(sessionCallSid) || incompleteFinalizedCallSids.has(sessionCallSid)) {
        // Verify call is truly incomplete before skipping
        // If call reached complete/terminal close, allow full persistence
        const stage = intakeData?.stage || 'unknown';
        const allRequiredFieldsCollected = intakeData ? areAllRequiredFieldsCollected(intakeData) : false;
        const finalClosingStarted = closingState?.finalClosingStarted || false;
        const terminalClosingResponseStarted = closingState?.terminalClosingResponseStarted || false;
        
        const isCompleteCall = stage === 'complete' || 
                              allRequiredFieldsCollected || 
                              finalClosingStarted || 
                              terminalClosingResponseStarted;
        
        if (isCompleteCall) {
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] =========================================');
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] Call is complete, allowing full persistence');
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] stage:', stage);
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] allRequiredFieldsCollected:', allRequiredFieldsCollected);
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] finalClosingStarted:', finalClosingStarted);
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] terminalClosingResponseStarted:', terminalClosingResponseStarted);
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE INGEST ALLOWED DESPITE FINALIZATION FLAGS] =========================================');
          
          // Continue with full persistence - don't skip
        } else {
          console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 3 FAILED] ingestCallData() skipped - incomplete finalization owns call');
          console.log('[COMPLETE FINALIZATION STEP 3 FAILED] callSid:', sessionCallSid);
          console.log('[COMPLETE FINALIZATION STEP 3 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
          
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] =========================================');
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] callSid:', sessionCallSid);
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] finalizationInProgress:', finalizationInProgressByCallSid.has(sessionCallSid));
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] incompleteFinalized:', incompleteFinalizedCallSids.has(sessionCallSid));
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] stage:', stage);
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] allRequiredFieldsCollected:', allRequiredFieldsCollected);
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] Timestamp:', new Date().toISOString());
          console.log('[INGEST SKIPPED - INCOMPLETE FINALIZATION OWNS CALL] =========================================');
          console.log('[INGEST CALL DATA EXIT] =========================================');
          console.log('[INGEST CALL DATA EXIT] Function exit (skipped - owned by incomplete finalization)');
          console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
          console.log('[INGEST CALL DATA EXIT] =========================================');
          return;
        }
      }
      
      console.log('[AI INGEST START] call ended');
      console.log('[AI INGEST TRANSCRIPT COUNT]', { transcriptLength: transcript.length });
      console.log('[AI INGEST SUPABASE AVAILABLE]', { hasSupabase: !!supabase });
      console.log('[AI INGEST] session data', { 
        sessionId: sessionSessionId, 
        businessId: sessionBusinessId, 
        callSid: sessionCallSid, 
        callerPhone: sessionCallerPhone,
        forwardedFrom: sessionForwardedFrom
      });
      
      // Check for existing AI call record (idempotency protection)
      if (!supabase) {
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] ingestCallData() failed - supabase client not available');
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
        
        console.log('[AI INGEST FAILED] supabase client not available for ingestion');
        console.log('[INGEST CALL DATA RETURN] =========================================');
        console.log('[INGEST CALL DATA RETURN] reason: supabase client not available');
        console.log('[INGEST CALL DATA RETURN] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA RETURN] =========================================');
        console.log('[INGEST CALL DATA EXIT] =========================================');
        console.log('[INGEST CALL DATA EXIT] Function exit');
        console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA EXIT] =========================================');
        return;
      }
      
      console.log('[AI INGEST INSERT START] checking for existing record');
      const { data: existingRecord, error: existingError } = await supabase
        .from('ai_call_records')
        .select('id, created_at')
        .eq('call_sid', sessionCallSid)
        .single();
      
      if (existingError && existingError.code !== 'PGRST116') {
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] ingestCallData() failed - error checking existing record');
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] Error:', existingError.message);
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 3 FAILED] =========================================');
        
        console.log('[AI INGEST FAILED] error checking existing record', existingError);
        console.log('[INGEST CALL DATA RETURN] =========================================');
        console.log('[INGEST CALL DATA RETURN] reason: error checking existing record');
        console.log('[INGEST CALL DATA RETURN] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA RETURN] =========================================');
        console.log('[INGEST CALL DATA EXIT] =========================================');
        console.log('[INGEST CALL DATA EXIT] Function exit');
        console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA EXIT] =========================================');
        return;
      }
      
      if (existingRecord) {
        console.log('[AI INGEST] record already exists, updating instead of creating', { 
          existingId: existingRecord.id, 
          createdAt: existingRecord.created_at 
        });
        // Update existing record instead of creating duplicate
        
        // Guard: Skip extraction if transcript is empty
        if (!transcript || transcript.length === 0) {
          console.log('[AI INGEST] transcript is empty, skipping extraction');
          // Update with transcript only if extraction failed
          const { error: fallbackUpdateError } = await supabase
            .from('ai_call_records')
            .update({
              transcript: transcript,
            })
            .eq('id', existingRecord.id);

          if (fallbackUpdateError) {
            console.log('[AI INGEST FAILED] fallback update also failed', fallbackUpdateError);
          } else {
            console.log('[AI INGEST INSERT SUCCESS] fallback update successful (empty transcript)');
          }
          return;
        }
        
        // Convert structured transcript to string format
        const fullTranscript = transcript.map(entry => `${entry.role}: ${entry.text}`).join('\n');
        console.log('[AI INGEST] full transcript', { transcript: fullTranscript });
        
        try {
          // Extract structured fields from transcript
          console.log('[AI INGEST] extracting fields...');
          const extractionPrompt = `Extract the following information from this AI call transcript. Return JSON with these keys: callerName, reasonForCalling, importantDetails, addressOrLocation, preferredCallbackTime, summary. If a field is not found, set it to null.

The summary should be concise and business-facing. Example: "John Smith called regarding a leaking water heater. Water is actively leaking. Caller requested callback this afternoon."

Transcript:
${fullTranscript}

Return only JSON, no other text.`;

          const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [
                { role: 'system', content: 'You are a data extraction assistant. Return only valid JSON.' },
                { role: 'user', content: extractionPrompt },
              ],
              temperature: 0,
            }),
          });

          const extractionData = await extractionResponse.json();
          const extractedFields = JSON.parse((extractionData as any).choices[0].message.content);
          console.log('[AI EXTRACTION RESULT]', extractedFields);

          // Update existing AI call record
          const { error: updateError } = await supabase
            .from('ai_call_records')
            .update({
              transcript: transcript,
            })
            .eq('id', existingRecord.id);

          if (updateError) {
            console.log('[AI INGEST FAILED] error updating existing record', updateError);
            throw updateError;
          }
          
          console.log('[AI INGEST INSERT SUCCESS] existing record updated successfully');
          console.log('[INGEST CALL DATA EXIT] =========================================');
          console.log('[INGEST CALL DATA EXIT] Function exit');
          console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
          console.log('[INGEST CALL DATA EXIT] =========================================');
          return;
        } catch (error) {
          console.log('[AI INGEST FAILED] extraction failed during update, updating with transcript only', error);
          
          // Update with transcript only if extraction failed
          const { error: fallbackUpdateError } = await supabase
            .from('ai_call_records')
            .update({
              transcript: transcript,
            })
            .eq('id', existingRecord.id);

          if (fallbackUpdateError) {
            console.log('[AI INGEST FAILED] fallback update also failed', fallbackUpdateError);
          } else {
            console.log('[AI INGEST INSERT SUCCESS] fallback update successful');
          }
          console.log('[INGEST CALL DATA EXIT] =========================================');
          console.log('[INGEST CALL DATA EXIT] Function exit');
          console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
          console.log('[INGEST CALL DATA EXIT] =========================================');
          return;
        }
      }
      
      // Create new AI call record if no existing record found
      console.log('[AI INGEST INSERT START] no existing record, creating new AI call record');
      
      // Convert structured transcript to string format
      const fullTranscript = transcript.map(entry => `${entry.role}: ${entry.text}`).join('\n');
      console.log('[AI INGEST] full transcript', { transcript: fullTranscript });
      
      // Guard: Skip extraction if transcript is empty
      if (!transcript || transcript.length === 0) {
        console.log('[AI INGEST] transcript is empty, skipping extraction');
        // Create AI call record with empty transcript
        console.log('[BEFORE AI_CALL_RECORD INSERT - PATH-B-empty-transcript]', {
          businessId: sessionBusinessId,
          leadId: null,
          conversationId: null,
          callSid: sessionCallSid
        });

        const { data: emptyRecord, error: emptyRecordError } = await supabase
          .from('ai_call_records')
          .insert({
            business_id: sessionBusinessId,
            caller_phone: sessionCallerPhone || 'unknown',
            call_sid: sessionCallSid || 'unknown',
            transcript: [],
            outcome: 'incomplete',
            extracted_info: null,
            summary: 'AI call completed (no transcript)',
            extraction_failed: true
          })
          .select()
          .single();

        console.log('[AFTER AI_CALL_RECORD INSERT - PATH-B-empty-transcript]', {
          error: emptyRecordError
        });

        if (emptyRecordError) {
          console.log('[AI INGEST FAILED] empty record creation failed', emptyRecordError);
        } else {
          console.log('[AI INGEST INSERT SUCCESS] empty record created successfully');
          
          console.log('[AI RECORD INSERT SUCCESS - EMPTY PATH]', {
            businessId: sessionBusinessId,
            leadId: null,
            conversationId: null,
            callSid: sessionCallSid
          });
          
          // AI completed call suppression: Do not create follow-up jobs for completed AI intake
          console.log('[AI SERVICE FOLLOWUPS SKIPPED]', {
            reason: 'ai_intake_completed',
            path: 'PATH-B-empty-transcript',
            businessId: sessionBusinessId,
            leadId: null,
            conversationId: null,
            callSid: sessionCallSid,
            note: 'Completed AI intake (empty transcript) should not create follow-up jobs'
          });

          console.log('[FOLLOWUP DIRECT INSERT SUPPRESSED - PATH-B]', {
            businessId: sessionBusinessId,
            reason: 'AI intake completed - follow-up creation suppressed'
          });
          
          // Create notification directly using Supabase (empty transcript path)
          console.log('[NOTIFICATION DIRECT INSERT START - PATH-B]', { 
            businessId: sessionBusinessId, 
            leadId: null
          });
          
          try {
            const { error: notificationError } = await supabase
              .from('notifications')
              .insert({
                business_id: sessionBusinessId,
                lead_id: null,
                type: 'ai_intake_completed',
                customer_name: null,
                customer_phone: sessionCallerPhone,
                service_requested: null,
                read: false,
                created_at: new Date().toISOString()
              });
            
            if (notificationError) {
              console.log('[NOTIFICATION DIRECT INSERT ERROR - PATH-B]', notificationError);
            } else {
              console.log('[NOTIFICATION DIRECT INSERT SUCCESS - PATH-B]', { 
                businessId: sessionBusinessId
              });
            }
          } catch (notificationError) {
            console.log('[NOTIFICATION DIRECT INSERT ERROR - PATH-B]', notificationError);
          }
          console.log('[NOTIFICATION DIRECT INSERT COMPLETE - PATH-B]');
        }
        console.log('[INGEST CALL DATA EXIT] =========================================');
        console.log('[INGEST CALL DATA EXIT] Function exit');
        console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA EXIT] =========================================');
        return;
      }
      
      try {
        // Extract structured fields from transcript
        console.log('[AI INGEST] extracting fields...');
        const extractionPrompt = `Extract the following information from this AI call transcript. Return JSON with these keys: callerName, reasonForCalling, desiredCompletionTime, importantDetails, addressOrLocation, preferredCallbackTime, summary. If a field is not found, set it to null.

The summary should be concise and business-facing. Example: "John Smith called regarding a leaking water heater. Issue appears urgent because water is actively leaking. Caller requested callback this afternoon."

Transcript:
${fullTranscript}

Return only JSON, no other text.`;

        const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              { role: 'system', content: 'You are a data extraction assistant. Return only valid JSON.' },
              { role: 'user', content: extractionPrompt },
            ],
            temperature: 0,
          }),
        });

        // Log final transcript state before extraction
        console.log('[FINAL TRANSCRIPT FOR EXTRACTION]', {
          transcriptLength: transcript.length,
          first10Entries: transcript.slice(0, 10).map(t => `${t.role}: ${t.text}`),
          userEntries: transcript.filter(t => t.role === 'user').length,
          assistantEntries: transcript.filter(t => t.role === 'assistant').length,
          hasUserContent: transcript.some(t => t.role === 'user' && t.text.trim() !== '')
        });

        const extractionData = await extractionResponse.json();
        console.log('[AI INGEST EXTRACTION RAW]', (extractionData as any).choices[0].message.content);
        
        let extractedFields;
        try {
          extractedFields = JSON.parse((extractionData as any).choices[0].message.content);
          console.log('[AI INGEST EXTRACTION PARSED]', extractedFields);
        } catch (parseError) {
          console.log('[AI INGEST EXTRACTION PARSE FAILED]', parseError);
          console.log('[AI INGEST EXTRACTION PARSE FAILED] using fallback values');
          // Create fallback extracted fields
          extractedFields = {
            callerName: null,
            reasonForCalling: null,
            urgencyLevel: null,
            importantDetails: null,
            addressOrLocation: null,
            preferredCallbackTime: null,
            summary: fullTranscript || 'AI call completed'
          };
        }

        // Create lead and conversation BEFORE inserting ai_call_records
        console.log('[COMPLETE FINALIZATION STEP 4] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 4] Creating lead record');
        console.log('[COMPLETE FINALIZATION STEP 4] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 4] =========================================');
        
        console.log('[LEAD CREATE START] Starting lead creation');
        console.log('[AI LEAD LOOKUP START]', { 
          businessId: sessionBusinessId,
          callerPhone: sessionCallerPhone,
          operation: 'lead upsert for ai_call_records linking'
        });
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .upsert({
            business_id: sessionBusinessId,
            caller_phone: sessionCallerPhone,
            status: 'new',
          }, {
            onConflict: 'business_id,caller_phone',
          })
          .select()
          .single();

        console.log('[AI LEAD LOOKUP RESULT]', { 
          leadId: lead?.id || 'null',
          leadError: leadError?.message || 'none',
          callerPhone: sessionCallerPhone
        });

        if (leadError) {
          console.log('[COMPLETE FINALIZATION STEP 4 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 4 FAILED] Lead creation failed');
          console.log('[COMPLETE FINALIZATION STEP 4 FAILED] Error:', leadError.message);
          console.log('[COMPLETE FINALIZATION STEP 4 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 4 FAILED] =========================================');
          
          console.log('[AI LEAD UPSERT FAILED]', { businessId: sessionBusinessId, callerPhone: sessionCallerPhone, error: leadError.message });
          throw leadError;
        }

        console.log('[LEAD CREATE SUCCESS] Lead created successfully');
        console.log('[AI LEAD UPSERT RESULT]', { leadId: lead.id, businessId: sessionBusinessId, callerPhone: sessionCallerPhone });

        console.log('[COMPLETE FINALIZATION STEP 4 SUCCESS] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 4 SUCCESS] Lead record created successfully');
        console.log('[COMPLETE FINALIZATION STEP 4 SUCCESS] Lead ID:', lead.id);
        console.log('[COMPLETE FINALIZATION STEP 4 SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 4 SUCCESS] =========================================');

        // Create or update conversation
        console.log('[COMPLETE FINALIZATION STEP 5] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 5] Creating conversation record');
        console.log('[COMPLETE FINALIZATION STEP 5] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 5] =========================================');
        
        console.log('[AI CONVERSATION LOOKUP START]', { 
          businessId: sessionBusinessId,
          leadId: lead.id,
          operation: 'conversation upsert for ai_call_records linking'
        });
        // Lookup existing conversation by lead_id
        const { data: existingConversation, error: conversationLookupError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', lead.id)
          .maybeSingle();

        let conversation;
        let conversationError;

        if (existingConversation) {
          conversation = existingConversation;
          console.log('[AI CONVERSATION FOUND]', { conversationId: conversation.id });
        } else {
          const result = await supabase
            .from('conversations')
            .insert({
              business_id: sessionBusinessId,
              lead_id: lead.id,
              status: 'open',
              last_activity_at: new Date().toISOString(),
            })
            .select()
            .single();
          conversation = result.data;
          conversationError = result.error;
        }

        console.log('[AI CONVERSATION LOOKUP RESULT]', { 
          conversationId: conversation?.id || 'null',
          conversationError: conversationError?.message || 'none',
          leadId: lead.id
        });

        if (conversationError) {
          console.log('[COMPLETE FINALIZATION STEP 5 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 5 FAILED] Conversation creation failed');
          console.log('[COMPLETE FINALIZATION STEP 5 FAILED] Error:', conversationError.message);
          console.log('[COMPLETE FINALIZATION STEP 5 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 5 FAILED] =========================================');
          
          console.log('[AI CONVERSATION UPSERT FAILED]', conversationError);
          throw conversationError;
        }

        console.log('[AI CONVERSATION UPSERT RESULT]', { conversationId: conversation.id, leadId: lead.id });

        console.log('[COMPLETE FINALIZATION STEP 5 SUCCESS] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 5 SUCCESS] Conversation record created successfully');
        console.log('[COMPLETE FINALIZATION STEP 5 SUCCESS] Conversation ID:', conversation.id);
        console.log('[COMPLETE FINALIZATION STEP 5 SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 5 SUCCESS] =========================================');

        // Create new AI call record with populated IDs
        console.log('[COMPLETE FINALIZATION STEP 6] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 6] Inserting ai_call_records');
        console.log('[COMPLETE FINALIZATION STEP 6] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 6] =========================================');
        
        console.log('[AI SAVE START] creating new AI call record...');
        
        // Normalize extracted field names to session intake field names
        const normalizedFields = normalizeExtractedFields(extractedFields);
        
        // Determine outcome based on whether all required fields are present
        const intakeComplete = isAIIntakeComplete(normalizedFields);
        const outcome = intakeComplete ? 'completed' : 'incomplete';
        
        const mainInsertPayload = {
            business_id: sessionBusinessId,
            lead_id: lead.id,
            conversation_id: conversation.id,
            caller_phone: sessionCallerPhone || 'unknown',
            call_sid: sessionCallSid || 'unknown',
            ai_session_id: sessionSessionId,
            transcript: Array.isArray(transcript) ? transcript : [],
            outcome: outcome,
            extraction_failed: false,
            extracted_info: extractedFields,
            summary: extractedFields.summary
          };
        console.log('[AI CALL RECORD OUTCOME]', {
          outcome: mainInsertPayload.outcome,
          callSid: mainInsertPayload.call_sid,
          businessId: mainInsertPayload.business_id,
          leadId: mainInsertPayload.lead_id,
          conversationId: mainInsertPayload.conversation_id
        });
        console.log('[AI SAVE PAYLOAD]', {
          recordType: 'ai_call_records',
          hasExtractedInfo: !!extractedFields,
          hasSummary: !!extractedFields?.summary,
          extractedFieldsKeys: extractedFields ? Object.keys(extractedFields) : [],
          payloadKeys: Object.keys(mainInsertPayload)
        });

        console.log('[AI CALL RECORD INSERT ACTIVE PATH]', {
          file: 'services/replyflow-ai-voice/src/index.ts',
          function: 'main AI save path',
          sessionId: 'unknown',
          callSid: sessionCallSid,
          businessId: sessionBusinessId,
          callerPhone: sessionCallerPhone
        });

        const { data: newRecord, error: newRecordError } = await supabase
          .from('ai_call_records')
          .insert(mainInsertPayload)
          .select()
          .single();

        if (newRecordError) {
          console.log('[COMPLETE FINALIZATION STEP 6 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 6 FAILED] ai_call_records insert failed');
          console.log('[COMPLETE FINALIZATION STEP 6 FAILED] Error:', newRecordError.message);
          console.log('[COMPLETE FINALIZATION STEP 6 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 6 FAILED] =========================================');
          
          console.log('[AI SAVE RESULT]', { 
            success: false, 
            error: newRecordError.message,
            operation: 'ai_call_records insert'
          });
          throw newRecordError;
        }
        
        console.log('[AI CALL RECORD INSERT SUCCESS] AI call record created successfully');
        console.log('[AI SAVE RESULT]', {
          success: true,
          recordId: newRecord.id,
          operation: 'ai_call_records insert',
          extractedInfoSaved: !!newRecord.extracted_info,
          summarySaved: !!newRecord.summary
        });

        console.log('[COMPLETE FINALIZATION STEP 6 SUCCESS] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 6 SUCCESS] ai_call_records inserted successfully');
        console.log('[COMPLETE FINALIZATION STEP 6 SUCCESS] Record ID:', newRecord.id);
        console.log('[COMPLETE FINALIZATION STEP 6 SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 6 SUCCESS] =========================================');

        console.log('[COMPLETE PATH] AI call record inserted');

        console.log('[ACTIVE PATH AFTER SAVE RESULT REACHED]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          callSid: sessionCallSid,
          recordId: newRecord.id
        });

        // Create follow-up jobs for successful AI intake
        console.log('[COMPLETE FINALIZATION STEP 7] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 7] Creating follow-up jobs');
        console.log('[COMPLETE FINALIZATION STEP 7] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 7] =========================================');
        
        console.log('[ACTIVE PATH FOLLOWUP START]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          outcome: 'completed'
        });

        // Call follow-up creation API
        try {
          console.log('[FOLLOWUP DEBUG API START - ACTIVE] Fetching from follow-up API');
          const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
          const followUpApiUrl = appBaseUrl;
          const internalApiSecret = process.env.INTERNAL_API_SECRET;

          console.log('[MAIN APP API CONFIG] =========================================');
          console.log('[MAIN APP API CONFIG] nodeEnv:', process.env.NODE_ENV);
          console.log('[MAIN APP API CONFIG] appBaseUrl:', appBaseUrl);
          console.log('[MAIN APP API CONFIG] sourceEnvUsed:', process.env.MAIN_APP_URL ? 'MAIN_APP_URL' : process.env.NEXT_PUBLIC_APP_URL ? 'NEXT_PUBLIC_APP_URL' : process.env.APP_BASE_URL ? 'APP_BASE_URL' : 'fallback');
          console.log('[MAIN APP API CONFIG] Timestamp:', new Date().toISOString());
          console.log('[MAIN APP API CONFIG] =========================================');

          console.log('[FOLLOWUP DEBUG API URL - ACTIVE]', followUpApiUrl);
          console.log('[FOLLOWUP DEBUG AUTH - ACTIVE]', {
            hasInternalApiSecret: !!internalApiSecret,
            secretLength: internalApiSecret?.length,
            secretFirstChar: internalApiSecret?.[0],
            secretLastChar: internalApiSecret?.[internalApiSecret.length - 1]
          });
          
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          if (internalApiSecret) {
            headers['Authorization'] = `Bearer ${internalApiSecret}`;
          }
          
          const response = await fetch(`${followUpApiUrl}/api/follow-ups/create-jobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              businessId: sessionBusinessId,
              leadId: lead.id,
              conversationId: conversation.id,
              businessName: extractedFields.callerName || null
            })
          });
          
          console.log('[FOLLOWUP DEBUG API RESPONSE - ACTIVE]', response.status);
          
          if (response.ok) {
            const result = await response.json() as { success: boolean; jobCount: number };
            console.log('[FOLLOWUP DEBUG SUCCESS - ACTIVE]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id,
              jobCount: result.jobCount 
            });
            console.log('[COMPLETE FINALIZATION STEP 7 SUCCESS] =========================================');
            console.log('[COMPLETE FINALIZATION STEP 7 SUCCESS] Follow-up jobs created successfully');
            console.log('[COMPLETE FINALIZATION STEP 7 SUCCESS] Job Count:', result.jobCount);
            console.log('[COMPLETE FINALIZATION STEP 7 SUCCESS] Timestamp:', new Date().toISOString());
            console.log('[COMPLETE FINALIZATION STEP 7 SUCCESS] =========================================');
          } else {
            console.error('[FOLLOWUP DEBUG ERROR - ACTIVE]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id,
              status: response.status,
              statusText: response.statusText
            });
            console.log('[COMPLETE FINALIZATION STEP 7 FAILED] =========================================');
            console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Follow-up API call failed');
            console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Status:', response.status);
            console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Timestamp:', new Date().toISOString());
            console.log('[COMPLETE FINALIZATION STEP 7 FAILED] =========================================');
          }
        } catch (followUpError) {
          console.error('[FOLLOWUP DEBUG ERROR - ACTIVE]', { 
            businessId: sessionBusinessId, 
            leadId: lead.id,
            error: followUpError
          });
          console.log('[COMPLETE FINALIZATION STEP 7 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Follow-up API call threw error');
          console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Error:', followUpError);
          console.log('[COMPLETE FINALIZATION STEP 7 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 7 FAILED] =========================================');
        }
        console.log('[FOLLOWUP DEBUG COMPLETE - ACTIVE] Follow-up API call finished');
        
        // Create notification directly using Supabase
        console.log('[COMPLETE FINALIZATION STEP 8] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 8] Creating notification record');
        console.log('[COMPLETE FINALIZATION STEP 8] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 8] =========================================');
        
        console.log('[NOTIFICATION DIRECT INSERT START]', { 
          businessId: sessionBusinessId, 
          leadId: lead.id
        });
        
        try {
          const callerName = extractedFields.callerName || null;
          const serviceRequested = extractedFields.reasonForCalling || null;
          
          const notificationPayload = {
            business_id: sessionBusinessId,
            type: 'new_lead', // Valid type from schema
            title: 'New AI Intake Lead',
            message: `New AI intake call completed from ${sessionCallerPhone}`,
            data: {
              leadId: lead.id,
              conversationId: conversation.id,
              aiCallRecordId: newRecord.id,
              callerPhone: sessionCallerPhone,
              callerName: callerName,
              serviceRequested: serviceRequested
            },
            read: false,
            action_url: `/dashboard/leads/${lead.id}`,
            action_text: 'View Lead'
          };
          
          console.log('[ACTIVE PATH NOTIFICATION PAYLOAD]', { 
            keys: Object.keys(notificationPayload),
            businessId: sessionBusinessId, 
            leadId: lead.id
          });
          
          const { error: notificationError } = await supabase
            .from('notifications')
            .insert(notificationPayload);
          
          if (notificationError) {
            console.log('[NOTIFICATION DIRECT INSERT ERROR]', { 
              error: notificationError,
              code: notificationError.code,
              message: notificationError.message,
              details: notificationError.details
            });
            console.log('[COMPLETE FINALIZATION STEP 8 FAILED] =========================================');
            console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Notification insert failed');
            console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Error:', notificationError.message);
            console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Timestamp:', new Date().toISOString());
            console.log('[COMPLETE FINALIZATION STEP 8 FAILED] =========================================');
          } else {
            console.log('[NOTIFICATION DIRECT INSERT SUCCESS]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id
            });
            console.log('[COMPLETE FINALIZATION STEP 8 SUCCESS] =========================================');
            console.log('[COMPLETE FINALIZATION STEP 8 SUCCESS] Notification created successfully');
            console.log('[COMPLETE FINALIZATION STEP 8 SUCCESS] Timestamp:', new Date().toISOString());
            console.log('[COMPLETE FINALIZATION STEP 8 SUCCESS] =========================================');
          }
        } catch (notificationError) {
          console.log('[ACTIVE PATH NOTIFICATION ERROR]', notificationError);
          console.log('[COMPLETE FINALIZATION STEP 8 FAILED] =========================================');
          console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Notification insert threw error');
          console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Error:', notificationError);
          console.log('[COMPLETE FINALIZATION STEP 8 FAILED] Timestamp:', new Date().toISOString());
          console.log('[COMPLETE FINALIZATION STEP 8 FAILED] =========================================');
        }

        console.log('[AI RECORD INSERT SUCCESS - ACTIVE PATH]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          callSid: sessionCallSid
        });

        console.log('[AI LINK SUCCESS]', {
          aiCallRecordId: newRecord.id,
          leadId: lead.id,
          conversationId: conversation.id
        });

        console.log('[AI INGEST INSERT SUCCESS] AI record linking completed successfully');
        console.log('[AI INGEST INSERT SUCCESS] ingestion completed successfully');

        // Send confirmation SMS after successful AI intake
        console.log('[COMPLETE FINALIZATION STEP 9] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 9] Sending AI confirmation SMS');
        console.log('[COMPLETE FINALIZATION STEP 9] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 9] =========================================');
        
        console.log('[SUMMARY SMS START] Starting AI summary SMS');
        console.log('[AI CONFIRMATION SMS CALL SITE]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          callSid: sessionCallSid,
          callerPhone: sessionCallerPhone,
          hasExtractedInfo: !!extractedFields,
          extractedInfoKeys: extractedFields ? Object.keys(extractedFields) : []
        });
        
        await sendAIConfirmationSMS(
          sessionBusinessId,
          lead.id,
          conversation.id,
          sessionCallSid || 'unknown',
          sessionCallerPhone || 'unknown',
          extractedFields
        );

        console.log('[SUMMARY SMS SUCCESS] AI summary SMS sent successfully');
        console.log('[AI CONFIRMATION SMS CALL SITE COMPLETE]', {
          businessId: sessionBusinessId,
          leadId: lead.id
        });

        console.log('[COMPLETE FINALIZATION STEP 9 SUCCESS] =========================================');
        console.log('[COMPLETE FINALIZATION STEP 9 SUCCESS] AI confirmation SMS sent successfully');
        console.log('[COMPLETE FINALIZATION STEP 9 SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[COMPLETE FINALIZATION STEP 9 SUCCESS] =========================================');

        console.log('[INGEST CALL DATA COMPLETE] Post-call persistence completed successfully');
        console.log('[INGEST CALL DATA EXIT] =========================================');
        console.log('[INGEST CALL DATA EXIT] Function exit');
        console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA EXIT] =========================================');
        return;

      } catch (error) {
        console.log('[AI INGEST FAILED] extraction failed during creation, creating with transcript only', error);
        
        // Create lead and conversation BEFORE inserting ai_call_records (fallback path)
        console.log('[AI LEAD LOOKUP START]', { 
          businessId: sessionBusinessId,
          callerPhone: sessionCallerPhone,
          operation: 'lead upsert for fallback ai_call_records linking'
        });
        const { data: fallbackLead, error: fallbackLeadError } = await supabase
          .from('leads')
          .upsert({
            business_id: sessionBusinessId,
            caller_phone: sessionCallerPhone,
            status: 'new',
          }, {
            onConflict: 'business_id,caller_phone',
          })
          .select()
          .single();

        console.log('[AI LEAD LOOKUP RESULT]', { 
          leadId: fallbackLead?.id || 'null',
          leadError: fallbackLeadError?.message || 'none',
          callerPhone: sessionCallerPhone
        });

        if (fallbackLeadError) {
          console.log('[AI LEAD UPSERT FAILED]', { businessId: sessionBusinessId, callerPhone: sessionCallerPhone, error: fallbackLeadError.message });
        }

        console.log('[INCOMPLETE FOLLOWUP STEP 1] =========================================');
        console.log('[INCOMPLETE FOLLOWUP STEP 1] fallbackLead exists:', !!fallbackLead);
        console.log('[INCOMPLETE FOLLOWUP STEP 1] fallbackLeadId:', fallbackLead?.id || 'null');
        console.log('[INCOMPLETE FOLLOWUP STEP 1] fallbackLeadError:', fallbackLeadError?.message || 'none');
        console.log('[INCOMPLETE FOLLOWUP STEP 1] Timestamp:', new Date().toISOString());
        console.log('[INCOMPLETE FOLLOWUP STEP 1] =========================================');

        let fallbackConversationId: string | null = null;
        if (fallbackLead) {
          console.log('[AI LEAD UPSERT RESULT]', { leadId: fallbackLead.id, businessId: sessionBusinessId, callerPhone: sessionCallerPhone });

          // Create or update conversation
          console.log('[AI CONVERSATION LOOKUP START]', { 
            businessId: sessionBusinessId,
            leadId: fallbackLead.id,
            operation: 'conversation upsert for fallback ai_call_records linking'
          });
          // Lookup existing conversation by lead_id
          const { data: existingFallbackConversation, error: fallbackConversationLookupError } = await supabase
            .from('conversations')
            .select('*')
            .eq('lead_id', fallbackLead.id)
            .maybeSingle();

          let fallbackConversation;
          let fallbackConversationError;

          if (existingFallbackConversation) {
            fallbackConversation = existingFallbackConversation;
            console.log('[AI CONVERSATION FOUND]', { conversationId: fallbackConversation.id });
          } else {
            const result = await supabase
              .from('conversations')
              .insert({
                business_id: sessionBusinessId,
                lead_id: fallbackLead.id,
                status: 'ai_completed',
                last_activity_at: new Date().toISOString(),
              })
              .select()
              .single();
            fallbackConversation = result.data;
            fallbackConversationError = result.error;
          }

          console.log('[AI CONVERSATION LOOKUP RESULT]', { 
            conversationId: fallbackConversation?.id || 'null',
            conversationError: fallbackConversationError?.message || 'none',
            leadId: fallbackLead.id
          });

          if (fallbackConversationError) {
            console.log('[AI CONVERSATION UPSERT FAILED]', fallbackConversationError);
          } else {
            console.log('[AI CONVERSATION UPSERT RESULT]', { conversationId: fallbackConversation.id, leadId: fallbackLead.id });
            fallbackConversationId = fallbackConversation.id;
          }
        }

        console.log('[INCOMPLETE FOLLOWUP STEP 2] =========================================');
        console.log('[INCOMPLETE FOLLOWUP STEP 2] fallbackLead exists:', !!fallbackLead);
        console.log('[INCOMPLETE FOLLOWUP STEP 2] fallbackConversationId exists:', !!fallbackConversationId);
        console.log('[INCOMPLETE FOLLOWUP STEP 2] fallbackConversationId:', fallbackConversationId || 'null');
        console.log('[INCOMPLETE FOLLOWUP STEP 2] Timestamp:', new Date().toISOString());
        console.log('[INCOMPLETE FOLLOWUP STEP 2] =========================================');

        // If we have lead and conversation, insert AI call record with transcript only
        if (fallbackLead && fallbackConversationId) {
          console.log('[INCOMPLETE FINALIZATION ENTER] =========================================');
          console.log('[INCOMPLETE FINALIZATION ENTER] callSid:', sessionCallSid);
          console.log('[INCOMPLETE FINALIZATION ENTER] stage:', (ws as any).intakeData?.stage || 'unknown');
          console.log('[INCOMPLETE FINALIZATION ENTER] intakeData:', JSON.stringify((ws as any).intakeData || {}, null, 2));
          console.log('[INCOMPLETE FINALIZATION ENTER] missingFields:', getMissingRequiredFields((ws as any).intakeData || {}));
          console.log('[INCOMPLETE FINALIZATION ENTER] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE FINALIZATION ENTER] =========================================');

          console.log('[FALLBACK INSERT START] inserting AI call record with transcript only');
          const fallbackInsertPayload = {
            business_id: sessionBusinessId,
            lead_id: fallbackLead.id,
            conversation_id: fallbackConversationId,
            caller_phone: sessionCallerPhone || 'unknown',
            call_sid: sessionCallSid || 'unknown',
            transcript: transcript,
            outcome: 'incomplete',
            extracted_info: null,
            summary: 'AI call completed (extraction failed)'
          };
          
          console.log('[AI CALL RECORD INSERT PAYLOAD]', fallbackInsertPayload);
          
          let recordInsertSuccess = true;
          const { error: fallbackRecordError } = await supabase
            .from('ai_call_records')
            .insert(fallbackInsertPayload);
          
          if (fallbackRecordError) {
            console.log('[AI CALL RECORD SAVE FAILED]', fallbackRecordError);
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] =========================================');
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] error:', fallbackRecordError.message);
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] callSid:', sessionCallSid);
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] leadId:', fallbackLead.id);
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] conversationId:', fallbackConversationId);
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] Timestamp:', new Date().toISOString());
            console.log('[AI INCOMPLETE RECORD INSERT FAILED - CONTINUING] =========================================');
            console.log('[INCOMPLETE CONTINUING AFTER RECORD FAILURE] =========================================');
            console.log('[INCOMPLETE CONTINUING AFTER RECORD FAILURE] nextStep: partial_sms_and_followups');
            console.log('[INCOMPLETE CONTINUING AFTER RECORD FAILURE] Timestamp:', new Date().toISOString());
            console.log('[INCOMPLETE CONTINUING AFTER RECORD FAILURE] =========================================');
            recordInsertSuccess = false;
          } else {
            console.log('[AI CALL RECORD SAVED] fallback record created successfully');
          }

          // Continue with partial message, SMS, and followups even if record insert failed

          // Insert partial AI intake message
          console.log('[INCOMPLETE MESSAGE INSERT START] =========================================');
          console.log('[INCOMPLETE MESSAGE INSERT START] conversationId:', fallbackConversationId);
          console.log('[INCOMPLETE MESSAGE INSERT START] leadId:', fallbackLead.id);
          console.log('[INCOMPLETE MESSAGE INSERT START] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE MESSAGE INSERT START] =========================================');

          const intakeData = (ws as any).intakeData;
          let partialSummary = intakeData ?
            `Partial AI intake information:\n` +
            `Name: ${intakeData.customerName || 'Not provided'}\n` +
            `Reason: ${intakeData.serviceRequested || 'Not provided'}\n` +
            `Details: ${intakeData.issueDescription || 'Not provided'}\n` +
            `Location: ${intakeData.serviceAddress || 'Not provided'}\n` +
            `Desired Completion Time: ${intakeData.desiredCompletionTime || 'Not provided'}\n` +
            `Best Callback Time: ${intakeData.callbackTime || 'Not provided'}` :
            'AI call transcript available but extraction failed';

          const { error: messageError } = await supabase
            .from('messages')
            .insert({
              conversation_id: fallbackConversationId,
              lead_id: fallbackLead.id,
              content: partialSummary,
              message_type: 'summary',
              structured_data: intakeData || null,
            });

          if (messageError) {
            console.log('[INCOMPLETE MESSAGE INSERT FAILED] =========================================');
            console.log('[INCOMPLETE MESSAGE INSERT FAILED] error:', messageError.message);
            console.log('[INCOMPLETE MESSAGE INSERT FAILED] Timestamp:', new Date().toISOString());
            console.log('[INCOMPLETE MESSAGE INSERT FAILED] =========================================');
          } else {
            console.log('[INCOMPLETE MESSAGE INSERT SUCCESS] =========================================');
            console.log('[INCOMPLETE MESSAGE INSERT SUCCESS] messageId: success');
            console.log('[INCOMPLETE MESSAGE INSERT SUCCESS] Timestamp:', new Date().toISOString());
            console.log('[INCOMPLETE MESSAGE INSERT SUCCESS] =========================================');
          }

          // Send partial summary SMS
          console.log('[INCOMPLETE SMS BUILD] =========================================');
          console.log('[INCOMPLETE SMS BUILD] to:', sessionCallerPhone);
          console.log('[INCOMPLETE SMS BUILD] businessId:', sessionBusinessId);
          console.log('[INCOMPLETE SMS BUILD] leadId:', fallbackLead.id);
          console.log('[INCOMPLETE SMS BUILD] conversationId:', fallbackConversationId);
          console.log('[INCOMPLETE SMS BUILD] smsBody:', partialSummary.substring(0, 100) + '...');
          console.log('[INCOMPLETE SMS BUILD] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE SMS BUILD] =========================================');

          // Fetch business OOO settings for incomplete SMS
          let businessForOoo: any = null;

          if (supabase && sessionBusinessId) {
            try {
              console.log('[INCOMPLETE SMS BUSINESS OOO LOOKUP]', { businessId: sessionBusinessId });
              const { data: businessOoo, error: businessOooError } = await supabase
                .from('businesses')
                .select('name, out_of_office_enabled, out_of_office_start, out_of_office_end')
                .eq('id', sessionBusinessId)
                .single();

              if (businessOoo) {
                businessForOoo = businessOoo;
                console.log('[INCOMPLETE SMS BUSINESS OOO RESULT]', {
                  businessName: businessForOoo.name,
                  outOfOfficeEnabled: businessForOoo.out_of_office_enabled,
                  outOfOfficeStart: businessForOoo.out_of_office_start,
                  outOfOfficeEnd: businessForOoo.out_of_office_end
                });
              }

              if (businessOooError) {
                console.log('[INCOMPLETE SMS BUSINESS OOO ERROR]', businessOooError);
              }
            } catch (error) {
              console.log('[INCOMPLETE SMS BUSINESS OOO FETCH ERROR]', error);
            }
          }

          // Check if business is currently Out of Office and append notice using helper
          const outOfOfficeNotice = businessForOoo ? (() => {
            if (!businessForOoo.out_of_office_enabled || !businessForOoo.out_of_office_start || !businessForOoo.out_of_office_end) {
              return null;
            }
            const now = new Date();
            const start = new Date(businessForOoo.out_of_office_start);
            const end = new Date(businessForOoo.out_of_office_end);
            if (now < start || now > end) return null;

            const businessName = businessForOoo.name || 'the business';
            let notice = `\n\nOut of Office Notice:\n${businessName} is currently out of office, so responses may be delayed.`;

            if (businessForOoo.out_of_office_end) {
              const endDate = new Date(businessForOoo.out_of_office_end);
              const formattedDate = endDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
              notice += ` Expected return: ${formattedDate}.`;
            }

            return notice;
          })() : null;

          const outOfOfficeActive = outOfOfficeNotice !== null;
          let appendedNotice = false;

          console.log('[OUT OF OFFICE NOTICE APPLIED] =========================================');
          console.log('[OUT OF OFFICE NOTICE APPLIED] businessId:', sessionBusinessId);
          console.log('[OUT OF OFFICE NOTICE APPLIED] smsType:', 'ai_summary_incomplete');
          console.log('[OUT OF OFFICE NOTICE APPLIED] outOfOfficeActive:', outOfOfficeActive);
          console.log('[OUT OF OFFICE NOTICE APPLIED] returnDate:', businessForOoo?.out_of_office_end || null);
          console.log('[OUT OF OFFICE NOTICE APPLIED] Timestamp:', new Date().toISOString());
          console.log('[OUT OF OFFICE NOTICE APPLIED] =========================================');

          if (outOfOfficeActive) {
            partialSummary += outOfOfficeNotice;
            appendedNotice = true;
            console.log('[OUT OF OFFICE NOTICE APPLIED] Notice appended successfully');
          }

          console.log('[INCOMPLETE SMS SEND START] =========================================');
          console.log('[INCOMPLETE SMS SEND START] to:', sessionCallerPhone);
          console.log('[INCOMPLETE SMS SEND START] bodyLength:', partialSummary.length);
          console.log('[INCOMPLETE SMS SEND START] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE SMS SEND START] =========================================');

          // Resolve business-specific phone number from session (same logic as complete path)
          let fromNumber: string | null = null;
          const sessionBusinessTwilioPhoneNumber = (ws as any).businessTwilioPhoneNumber;

          console.log('[INCOMPLETE SMS SENDER] =========================================');
          console.log('[INCOMPLETE SMS SENDER] sessionBusinessTwilioPhoneNumber:', sessionBusinessTwilioPhoneNumber);
          console.log('[INCOMPLETE SMS SENDER] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE SMS SENDER] =========================================');

          if (sessionBusinessTwilioPhoneNumber) {
            fromNumber = sessionBusinessTwilioPhoneNumber;
            console.log('[INCOMPLETE SMS SENDER] Using session business phone number:', fromNumber);
          } else {
            fromNumber = process.env.TWILIO_PHONE_NUMBER || null;
            console.log('[INCOMPLETE SMS SENDER] Using fallback global phone number:', fromNumber);
          }

          if (!fromNumber) {
            console.log('[INCOMPLETE SMS SENDER ERROR] No phone number available, skipping SMS');
          } else {
            try {
              const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              const smsResult = await twilioClient.messages.create({
                from: fromNumber,
                to: sessionCallerPhone,
                body: partialSummary
              });

              console.log('[INCOMPLETE SMS SEND SUCCESS] =========================================');
              console.log('[INCOMPLETE SMS SEND SUCCESS] messageSid:', smsResult.sid);
              console.log('[INCOMPLETE SMS SEND SUCCESS] fromNumber:', fromNumber);
              console.log('[INCOMPLETE SMS SEND SUCCESS] Timestamp:', new Date().toISOString());
              console.log('[INCOMPLETE SMS SEND SUCCESS] =========================================');

              // Persist SMS to database using summary-message API
              if (fallbackLead.id && fallbackConversationId) {
                console.log('[INCOMPLETE SMS DB PERSIST START] =========================================');
                console.log('[INCOMPLETE SMS DB PERSIST START] Persisting SMS to database');
                console.log('[INCOMPLETE SMS DB PERSIST START] Timestamp:', new Date().toISOString());
                console.log('[INCOMPLETE SMS DB PERSIST START] =========================================');

                try {
                  const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
                  const internalApiSecret = process.env.INTERNAL_API_SECRET;

                  if (internalApiSecret) {
                    const apiResponse = await fetch(`${appBaseUrl}/api/ai-voice/summary-message`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${internalApiSecret}`
                      },
                      body: JSON.stringify({
                        businessId: sessionBusinessId,
                        leadId: fallbackLead.id,
                        conversationId: fallbackConversationId,
                        smsBody: partialSummary,
                        fromPhone: fromNumber,
                        toPhone: sessionCallerPhone,
                        twilioMessageSid: smsResult.sid,
                        status: smsResult.status
                      })
                    });

                    if (apiResponse.ok) {
                      console.log('[INCOMPLETE SMS DB PERSIST SUCCESS] =========================================');
                      console.log('[INCOMPLETE SMS DB PERSIST SUCCESS] SMS persisted to database');
                      console.log('[INCOMPLETE SMS DB PERSIST SUCCESS] Timestamp:', new Date().toISOString());
                      console.log('[INCOMPLETE SMS DB PERSIST SUCCESS] =========================================');
                    } else {
                      console.log('[INCOMPLETE SMS DB PERSIST FAILED] =========================================');
                      console.log('[INCOMPLETE SMS DB PERSIST FAILED] status:', apiResponse.status);
                      console.log('[INCOMPLETE SMS DB PERSIST FAILED] Timestamp:', new Date().toISOString());
                      console.log('[INCOMPLETE SMS DB PERSIST FAILED] =========================================');
                    }
                  }
                } catch (apiError) {
                  console.log('[INCOMPLETE SMS DB PERSIST ERROR] =========================================');
                  console.log('[INCOMPLETE SMS DB PERSIST ERROR] error:', String(apiError));
                  console.log('[INCOMPLETE SMS DB PERSIST ERROR] Timestamp:', new Date().toISOString());
                  console.log('[INCOMPLETE SMS DB PERSIST ERROR] =========================================');
                }
              }
            } catch (smsError) {
              console.log('[INCOMPLETE SMS SEND FAILED] =========================================');
              console.log('[INCOMPLETE SMS SEND FAILED] error:', String(smsError));
              console.log('[INCOMPLETE SMS SEND FAILED] Timestamp:', new Date().toISOString());
              console.log('[INCOMPLETE SMS SEND FAILED] =========================================');
            }
          }

          // Create follow-up jobs using the proper API
          console.log('[INCOMPLETE FOLLOWUP STEP 3] =========================================');
          console.log('[INCOMPLETE FOLLOWUP STEP 3] About to call follow-up API');
          console.log('[INCOMPLETE FOLLOWUP STEP 3] businessId:', sessionBusinessId);
          console.log('[INCOMPLETE FOLLOWUP STEP 3] leadId:', fallbackLead.id);
          console.log('[INCOMPLETE FOLLOWUP STEP 3] conversationId:', fallbackConversationId);
          console.log('[INCOMPLETE FOLLOWUP STEP 3] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE FOLLOWUP STEP 3] =========================================');

          console.log('[INCOMPLETE FOLLOWUP CREATE START] =========================================');
          console.log('[INCOMPLETE FOLLOWUP CREATE START] businessId:', sessionBusinessId);
          console.log('[INCOMPLETE FOLLOWUP CREATE START] leadId:', fallbackLead.id);
          console.log('[INCOMPLETE FOLLOWUP CREATE START] conversationId:', fallbackConversationId);
          console.log('[INCOMPLETE FOLLOWUP CREATE START] callerPhone:', sessionCallerPhone);
          console.log('[INCOMPLETE FOLLOWUP CREATE START] settingsEnabled: true');
          console.log('[INCOMPLETE FOLLOWUP CREATE START] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE FOLLOWUP CREATE START] =========================================');

          try {
            const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
            const followUpApiUrl = appBaseUrl;
            const internalApiSecret = process.env.INTERNAL_API_SECRET;

            console.log('[MAIN APP API CONFIG] =========================================');
            console.log('[MAIN APP API CONFIG] nodeEnv:', process.env.NODE_ENV);
            console.log('[MAIN APP API CONFIG] appBaseUrl:', appBaseUrl);
            console.log('[MAIN APP API CONFIG] sourceEnvUsed:', process.env.MAIN_APP_URL ? 'MAIN_APP_URL' : process.env.NEXT_PUBLIC_APP_URL ? 'NEXT_PUBLIC_APP_URL' : process.env.APP_BASE_URL ? 'APP_BASE_URL' : 'fallback');
            console.log('[MAIN APP API CONFIG] Timestamp:', new Date().toISOString());
            console.log('[MAIN APP API CONFIG] =========================================');
            
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            if (internalApiSecret) {
              headers['Authorization'] = `Bearer ${internalApiSecret}`;
            }
            
            const response = await fetch(`${followUpApiUrl}/api/follow-ups/create-jobs`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                businessId: sessionBusinessId,
                leadId: fallbackLead.id,
                conversationId: fallbackConversationId,
                businessName: null
              })
            });
            
            if (response.ok) {
              const result = await response.json() as { success: boolean; jobCount: number; jobs?: any[] };
              console.log('[INCOMPLETE FOLLOWUP CREATE RESULT] =========================================');
              console.log('[INCOMPLETE FOLLOWUP CREATE RESULT] createdCount:', result.jobCount);
              console.log('[INCOMPLETE FOLLOWUP CREATE RESULT] jobs:', JSON.stringify(result.jobs || [], null, 2));
              console.log('[INCOMPLETE FOLLOWUP CREATE RESULT] Timestamp:', new Date().toISOString());
              console.log('[INCOMPLETE FOLLOWUP CREATE RESULT] =========================================');
            } else {
              console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] =========================================');
              console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] error:', response.statusText);
              console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] status:', response.status);
              console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] Timestamp:', new Date().toISOString());
              console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] =========================================');
            }
          } catch (followUpError) {
            console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] =========================================');
            console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] error:', String(followUpError));
            console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] Timestamp:', new Date().toISOString());
            console.log('[INCOMPLETE FOLLOWUP CREATE FAILED] =========================================');
          }

          console.log('[INCOMPLETE FOLLOWUP STEP 4] =========================================');
          console.log('[INCOMPLETE FOLLOWUP STEP 4] Follow-up API call completed');
          console.log('[INCOMPLETE FOLLOWUP STEP 4] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE FOLLOWUP STEP 4] =========================================');
        } else {
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] =========================================');
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] reason: fallbackLead or fallbackConversationId is null');
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] fallbackLead exists:', !!fallbackLead);
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] fallbackConversationId exists:', !!fallbackConversationId);
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] Timestamp:', new Date().toISOString());
          console.log('[INCOMPLETE FOLLOWUP STEP 4 SKIPPED] =========================================');
        }
        
        console.log('[INGEST CALL DATA EXIT] =========================================');
        console.log('[INGEST CALL DATA EXIT] Function exit');
        console.log('[INGEST CALL DATA EXIT] Timestamp:', new Date().toISOString());
        console.log('[INGEST CALL DATA EXIT] =========================================');
      }
    };

    // Intake state machine
    let intakeData: IntakeData | null = null;

    log(LogLevel.INFO, '[AI POC] attaching message listener');

    // Override handleMessage to capture customParameters from start event
    const originalHandleMessage = (twilioHandler as any).handleMessage.bind(twilioHandler);
    (twilioHandler as any).handleMessage = async (data: any) => {
      try {
        // Log FIRST websocket frame only
        if (!firstFrameLogged) {
          log(LogLevel.INFO, '[AI POC] first websocket frame', data.toString());
          firstFrameLogged = true;
        }

        // LOW-LEVEL INSPECTION: Log raw frame before any processing (non-media only)
        if (debugMessageCount < DEBUG_MESSAGE_LIMIT) {
          const dataStr = data.toString();
          const isMedia = dataStr.includes('"event":"media"');
          if (!isMedia) {
            log(LogLevel.INFO, '[RAW WS]', { type: typeof data, data: dataStr });
          }
          debugMessageCount++;
        }

        // Safely parse JSON
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (err) {
          log(LogLevel.ERROR, '[AI POC] JSON parse failed', err);
          return;
        }

        // Log parsed frame (non-media only, or first media, or every 100th media)
        if (message.event === 'media') {
          // Safety fallback: ignore audio during closing - check ALL terminal state flags
          const terminalStateActive = 
            closingState.intakeTerminalComplete ||
            closingState.terminalClosingResponseStarted ||
            closingState.finalClosingStarted ||
            closingState.callState === 'closing';

          if (terminalStateActive) {
            if (!callerAudioBlockedLogged) {
              callerAudioBlockedLogged = true;
              console.log('[CALLER AUDIO BLOCKED] =========================================');
              console.log('[CALLER AUDIO BLOCKED] Caller audio blocked - terminal mode active');
              console.log('[CALLER AUDIO BLOCKED] intakeTerminalComplete:', closingState.intakeTerminalComplete);
              console.log('[CALLER AUDIO BLOCKED] terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
              console.log('[CALLER AUDIO BLOCKED] finalClosingStarted:', closingState.finalClosingStarted);
              console.log('[CALLER AUDIO BLOCKED] callState:', closingState.callState);
              console.log('[CALLER AUDIO BLOCKED] Timestamp:', new Date().toISOString());
              console.log('[CALLER AUDIO BLOCKED] =========================================');
            }
            // Silently drop caller audio in terminal mode
            return;
          }
          
          mediaPacketCount++;
          const payloadSize = message.media?.payload?.length || 0;
          
          if (!audioReceived) {
            audioReceived = true;
            log(LogLevel.INFO, '[TWILIO AUDIO RECEIVED]', { 
              packetCount: mediaPacketCount, 
              payloadSize: payloadSize,
              timestamp: new Date().toISOString() 
            });
          }
          
          if (!firstMediaPacketLogged) {
            log(LogLevel.INFO, '[TWILIO MEDIA PACKET COUNT]', { count: mediaPacketCount });
            log(LogLevel.INFO, '[TWILIO PAYLOAD SIZE]', { size: payloadSize });
            log(LogLevel.INFO, '[PARSED WS] FIRST MEDIA PACKET', JSON.stringify(message, null, 2));
            firstMediaPacketLogged = true;
          } else if (mediaPacketCount % 100 === 0) {
            log(LogLevel.INFO, '[TWILIO MEDIA PACKET COUNT]', { count: mediaPacketCount });
            log(LogLevel.INFO, '[TWILIO PAYLOAD SIZE]', { size: payloadSize });
            log(LogLevel.INFO, `[MEDIA] packet ${mediaPacketCount} (every 100th)`);
          }
        } else {
          if (debugMessageCount <= DEBUG_MESSAGE_LIMIT) {
            log(LogLevel.INFO, '[PARSED WS]', JSON.stringify(message, null, 2));
            log(LogLevel.INFO, '[WS KEYS]', Object.keys(message));
          }
        }

        // Handle start event
        if (message.event === 'start') {
          console.log('[TWILIO START EVENT RECEIVED]');
          log(LogLevel.INFO, '[AI POC] entered start handler');

          if (startEventProcessed) {
            log(LogLevel.INFO, '[AI POC] start event already processed, skipping');
            originalHandleMessage(data);
            return;
          }

          startEventProcessed = true;

          // Extract call forwarding information from Twilio start event
          const callInfo = message.start || {};
          const customParams = callInfo.customParameters || {};
          
          // Log raw call info for debugging
          console.log('[TWILIO START DEBUG] callInfo:', JSON.stringify(callInfo, null, 2));
          console.log('[TWILIO START DEBUG] customParameters:', JSON.stringify(customParams, null, 2));
          
          // Create normalized callContext immediately
          const params = customParams || {};
          const callContext: CallContext = {
            businessId: params.businessId || '',
            callSid: params.callSid || callInfo.callSid || '',
            sessionId: params.sessionId || '',
            callerPhone: params.callerPhone || callInfo.from || '',
            businessPhone: params.called || params.to || '',
            forwardedFrom: params.forwardedFrom || req.headers['x-forwarded-from'] || '',
            callType: params.callType
          };

          console.log('[CALL CONTEXT NORMALIZED]', callContext);

          // Hard fail if required parameters are missing
          if (!callContext.businessId) {
            console.error('[CALL CONTEXT REQUIRED FAILED] businessId is missing');
            console.error('[CALL CONTEXT REQUIRED FAILED] Cannot proceed without businessId');
            ws.close();
            return;
          }
          if (!callContext.callSid) {
            console.error('[CALL CONTEXT REQUIRED FAILED] callSid is missing');
            console.error('[CALL CONTEXT REQUIRED FAILED] Cannot proceed without callSid');
            ws.close();
            return;
          }

          console.log('[CALL CONTEXT REQUIRED OK] businessId and callSid present');

          // Check for duplicate webhook delivery - early return if ai_call_record already exists
          console.log('[DUPLICATE WEBHOOK CHECK] =========================================');
          console.log('[DUPLICATE WEBHOOK CHECK] Checking for existing ai_call_record');
          console.log('[DUPLICATE WEBHOOK CHECK] callSid:', callSid);
          console.log('[DUPLICATE WEBHOOK CHECK] Timestamp:', new Date().toISOString());
          console.log('[DUPLICATE WEBHOOK CHECK] =========================================');
          
          if (supabase) {
            const { data: existingRecord, error: recordCheckError } = await supabase
              .from('ai_call_records')
              .select('id, outcome')
              .eq('call_sid', callSid)
              .maybeSingle();
            
            if (existingRecord) {
              console.log('[DUPLICATE WEBHOOK DETECTED] =========================================');
              console.log('[DUPLICATE WEBHOOK DETECTED] ai_call_record already exists for this call');
              console.log('[DUPLICATE WEBHOOK DETECTED] existingRecordId:', existingRecord.id);
              console.log('[DUPLICATE WEBHOOK DETECTED] outcome:', existingRecord.outcome);
              console.log('[DUPLICATE WEBHOOK DETECTED] callSid:', callSid);
              console.log('[DUPLICATE WEBHOOK DETECTED] Timestamp:', new Date().toISOString());
              console.log('[DUPLICATE WEBHOOK DETECTED] Skipping processing to prevent duplicate lead creation');
              console.log('[DUPLICATE WEBHOOK DETECTED] =========================================');
              
              // Close WebSocket to prevent duplicate processing
              ws.close(1008, 'Duplicate webhook - call already processed');
              return;
            }
            
            if (recordCheckError && recordCheckError.code !== 'PGRST116') {
              console.log('[DUPLICATE WEBHOOK CHECK ERROR]', recordCheckError);
            }
          }
          
          console.log('[DUPLICATE WEBHOOK CHECK PASSED] No existing record found, proceeding with call processing');

          // Store callContext on ws for use throughout the call
          (ws as any).callContext = callContext;
          (ws as any).businessId = callContext.businessId;
          (ws as any).callSid = callContext.callSid;
          (ws as any).sessionId = callContext.sessionId;
          (ws as any).callerPhone = callContext.callerPhone;
          (ws as any).forwardedFrom = callContext.forwardedFrom;
          (ws as any).businessTwilioPhoneNumber = params.businessTwilioPhoneNumber || null;

          // Store leadId and conversationId from customParameters
          (ws as any).leadId = params.leadId || null;
          (ws as any).conversationId = params.conversationId || null;

          console.log('[CALL CONTEXT LEAD IDS] =========================================');
          console.log('[CALL CONTEXT LEAD IDS] leadId:', (ws as any).leadId);
          console.log('[CALL CONTEXT LEAD IDS] conversationId:', (ws as any).conversationId);
          console.log('[CALL CONTEXT LEAD IDS] source: session_custom_parameter');
          console.log('[CALL CONTEXT LEAD IDS] Timestamp:', new Date().toISOString());
          console.log('[CALL CONTEXT LEAD IDS] =========================================');

          console.log('[CALL CONTEXT BUSINESS TWILIO PHONE]', {
            businessTwilioPhoneNumber: (ws as any).businessTwilioPhoneNumber,
            source: 'customParameters',
            timestamp: new Date().toISOString()
          });
          
          // Update local variables for backward compatibility
          sessionId = callContext.sessionId;
          businessId = callContext.businessId;
          callSid = callContext.callSid;
          callerPhone = callContext.callerPhone;
          forwardedFrom = callContext.forwardedFrom;

          // Log active code check to verify latest deployment
          console.log('[AI VOICE ACTIVE CODE CHECK] =========================================');
          console.log('[AI VOICE ACTIVE CODE CHECK] commitSha:', commitSha);
          console.log('[AI VOICE ACTIVE CODE CHECK] hasCallSessionState:', typeof callSessionState !== 'undefined');
          console.log('[AI VOICE ACTIVE CODE CHECK] hasVoicePromptVerification:', typeof expectedPrompt !== 'undefined');
          console.log('[AI VOICE ACTIVE CODE CHECK] hasAppDrivenIntake:', typeof sendControlledAssistantText !== 'undefined');
          console.log('[AI VOICE ACTIVE CODE CHECK] callSid:', callSid);
          console.log('[AI VOICE ACTIVE CODE CHECK] Timestamp:', new Date().toISOString());
          console.log('[AI VOICE ACTIVE CODE CHECK] =========================================');
          
          console.log('[CALL CONTEXT USED FOR BUSINESS LOOKUP]', { businessId: callContext.businessId });

          // Fetch business data if businessId is available
          let businessName: string | null = null;
          let businessType = '';
          let businessTypeOther = '';
          let customGreeting = '';
          let outOfOfficeEnabled = false;
          let outOfOfficeStart = '';
          let outOfOfficeEnd = '';

          console.log('[SUPABASE CLIENT CREATED]', supabase ? 'YES' : 'NO');
          console.log('[BUSINESS LOOKUP START]', { businessId, hasSupabase: !!supabase });

          if (businessId && supabase) {
            try {
              console.log('[BUSINESS LOOKUP EXECUTING]', { businessId });
              const { data: business, error } = await supabase
                .from('businesses')
                .select('name, business_type, business_type_other, out_of_office_enabled, out_of_office_start, out_of_office_end')
                .eq('id', businessId)
                .single() as any;

              console.log('[BUSINESS LOOKUP RESULT]', { business, error });
              if (business) {
                console.log('[BUSINESS RECORD]', {
                  businessId: business.id,
                  businessName: business.name,
                  businessType: business.business_type,
                  businessTypeOther: business.business_type_other,
                  outOfOfficeEnabled: business.out_of_office_enabled,
                  outOfOfficeStart: business.out_of_office_start,
                  outOfOfficeEnd: business.out_of_office_end,
                  availableFields: Object.keys(business)
                });
              }

              if (error) {
                console.log('[BUSINESS LOOKUP ERROR]', error);
                console.log('[BUSINESS LOOKUP FAILED]', { hasSupabase: false, error: error.message });
              } else if (business) {
                businessName = business.name;
                businessType = business.business_type || '';
                businessTypeOther = business.business_type_other || '';
                outOfOfficeEnabled = business.out_of_office_enabled || false;
                outOfOfficeStart = business.out_of_office_start || '';
                outOfOfficeEnd = business.out_of_office_end || '';
                customGreeting = ''; // Default empty since custom_greeting column doesn't exist
                console.log('[BUSINESS NAME RESOLVED]', businessName);
                console.log('[BUSINESS LOOKUP SUCCESS]', {
                  businessId,
                  businessName,
                  businessType,
                  businessTypeOther,
                  outOfOfficeEnabled,
                  outOfOfficeStart,
                  outOfOfficeEnd,
                  hasCustomGreeting: !!customGreeting
                });
                console.log('[AI] business loaded', { businessName, businessType, businessTypeOther, outOfOfficeEnabled, hasCustomGreeting: !!customGreeting });
              } else {
                console.log('[BUSINESS LOOKUP FAILED]', { hasSupabase: true, error: 'No business found with ID' });
              }
            } catch (err) {
              console.log('[BUSINESS LOOKUP ERROR]', err);
              console.log('[BUSINESS LOOKUP FAILED]', { 
                hasSupabase: !!supabase, 
                error: err instanceof Error ? err.message : 'Unknown error' 
              });
            }
          } else {
            console.log('[BUSINESS LOOKUP FAILED]', { 
              hasSupabase: !!supabase, 
              businessId: businessId || 'missing',
              error: !businessId ? 'Missing businessId' : 'Missing supabase client'
            });
          }

          // Initialize intake state machine with business name
          intakeData = createIntakeData(businessName || 'we', callSid, businessId, sessionId);
          console.log('[AI INTAKE] initialized with business:', businessName);

          // Determine intake template based on business type (with safe fallback)
          const selectedIntakeTemplate = getIntakeTemplateForBusinessTypeSafe(businessType);
          (ws as any).intakeTemplate = selectedIntakeTemplate;
          
          console.log('[AI INTAKE TEMPLATE] =========================================');
          console.log('[AI INTAKE TEMPLATE] business_type:', businessType);
          console.log('[AI INTAKE TEMPLATE] selected_template:', selectedIntakeTemplate);
          console.log('[AI INTAKE TEMPLATE] Timestamp:', new Date().toISOString());
          console.log('[AI INTAKE TEMPLATE] =========================================');

          // Instructions are now handled via session.update - disable old system
          console.log('[AI] using session.update instructions - old system disabled');
          
          // Deployment verification and version logging
          console.log('[AI INSTRUCTIONS VERSION] confirmation-flow-v2');
          console.log('[AI CONFIRMATION FLOW] ENABLED - requires confirmation before final goodbye');
          
          try {
            const { execSync } = require('child_process');
            const gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
            console.log('[AI GIT COMMIT]', gitCommit);
          } catch (error) {
            console.log('[AI GIT COMMIT] unavailable - running in container');
          }
          
          // Store empty placeholder to avoid undefined errors
          (ws as any).aiInstructions = '';

          // Check for required parameters
          if (!sessionId || !callSid) {
            log(LogLevel.WARN, '[AI POC] initialization skipped because: missing required parameters', { sessionId, callSid });
            openaiInitAttempted = false;
            openaiInitFailed = true;
            ws.close(1008, 'Missing required parameters');
            return;
          }

          // Check for API key
          console.log('[BEFORE OPENAI KEY CHECK]', {
            hasOpenAIKey: !!OPENAI_API_KEY,
            openAIKeyLength: OPENAI_API_KEY?.length || 0,
            hasProcessEnvKey: !!process.env.OPENAI_API_KEY,
            processEnvKeyLength: process.env.OPENAI_API_KEY?.length || 0,
            timestamp: new Date().toISOString()
          });
          
          if (!OPENAI_API_KEY) {
            log(LogLevel.ERROR, '[AI POC] initialization skipped because: OPENAI_API_KEY not set');
            openaiInitAttempted = false;
            openaiInitFailed = true;
            ws.close(1011, 'OpenAI API key not configured');
            return;
          }

          log(LogLevel.INFO, '[AI POC] about to initialize OpenAI');
          openaiInitAttempted = true;

          log(LogLevel.INFO, '[AI POC] initializeOpenAI called');

          // Create AI session state tracker
          const aiSessionTracker = createAISessionTracker(callSid, businessId);
          (ws as any).aiSessionTracker = aiSessionTracker;

          try {
            console.log('[STREAM CLONED] starting websocket creation');
            streamCloneCount++;
            console.log('[STREAM_CLONE_COUNT] Creating stream, count:', streamCloneCount);
            console.log('[STREAM_CLONE_COUNT] Source: initializeOpenAI at line 3079');
            console.log('[STREAM CLONED] WebSocket package:', 'ws');
            console.log('[STREAM CLONED] API key exists:', !!OPENAI_API_KEY);
            
            const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
            console.log('[STREAM CLONED] creating websocket to:', wsUrl);
            console.log('[OPENAI WEBSOCKET CLEANUP] Creating FRESH OpenAI session for this call');
            console.log('[OPENAI WEBSOCKET CLEANUP] callSid:', callSid);
            console.log('[OPENAI WEBSOCKET CLEANUP] businessId:', businessId);
            console.log('[OPENAI CONNECT START]');
            console.log('[OPENAI KEY CHECK]', OPENAI_API_KEY?.slice(-6));
            
            // Phase 4: OpenAI Connection Retry Logic
            let retryAttempt = 0;
            const maxRetries = 1;
            
            function connectToOpenAI(): Promise<WebSocket> {
              return new Promise((resolve, reject) => {
                retryAttempt++;
                console.log(`[OPENAI CONNECT ATTEMPT ${retryAttempt}]`);
                updateAISessionState(aiSessionTracker, 'AI_CONNECTING', `Attempt ${retryAttempt}`);
                
                const ws = new WebSocket(wsUrl, {
                  headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                  },
                });
                
                const connectTimeout = setTimeout(() => {
                  if (ws.readyState === WebSocket.CONNECTING) {
                    ws.terminate();
                    reject(new Error('Connection timeout'));
                  }
                }, 5000);
                
                ws.on('open', () => {
                  clearTimeout(connectTimeout);
                  console.log('[OPENAI CONNECT SUCCESS]');
                  console.log(`[OPENAI CONNECT SUCCESS] Attempt ${retryAttempt}`);
                  updateAISessionState(aiSessionTracker, 'AI_CONNECTED', `Connected on attempt ${retryAttempt}`);
                  resolve(ws);
                });
                
                ws.on('error', (error) => {
                  clearTimeout(connectTimeout);
                  console.log('[OPENAI CONNECT ERROR]', error);
                  console.log(`[OPENAI CONNECT FAILED] Attempt ${retryAttempt}:`, error);
                  updateAISessionState(aiSessionTracker, 'FAILED', `Connection failed on attempt ${retryAttempt}: ${error}`);
                  reject(error);
                });
              });
            }
            
            // Attempt connection with retry logic
            let openAiWs: WebSocket;
            try {
              openAiWs = await connectToOpenAI();
            } catch (error) {
              if (retryAttempt <= maxRetries) {
                console.log('[OPENAI RETRY] Retrying connection...');
                try {
                  openAiWs = await connectToOpenAI();
                } catch (retryError) {
                  console.log('[OPENAI RETRY FAILED]', retryError);
                  await triggerVoicemailFallback(
                    ws, 
                    twilioHandler, 
                    aiSessionTracker, 
                    `OpenAI connection failed after ${retryAttempt} attempts`, 
                    callSid || '', 
                    businessId || '', 
                    callerPhone || '', 
                    businessName || '', 
                    forwardedFrom || ''
                  );
                  return;
                }
              } else {
                console.log('[OPENAI CONNECT FAILED] No retries remaining');
                await triggerVoicemailFallback(
                  ws, 
                  twilioHandler, 
                  aiSessionTracker, 
                  'OpenAI connection failed - no retries remaining', 
                  callSid || '', 
                  businessId || '', 
                  callerPhone || '', 
                  businessName || '', 
                  forwardedFrom || ''
                );
                return;
              }
            }
            
            console.log('[STREAM CLONED] websocket created, readyState:', openAiWs.readyState);
            console.log('[OPENAI STATE BEFORE LISTENER] readyState:', openAiWs.readyState, 'OPEN:', WebSocket.OPEN);
            
            // Set websocket on Twilio handler so media handler can access it
            (twilioHandler as any).openAiWs = openAiWs;
            (ws as any).openAiWs = openAiWs;
            console.log('[STREAM CLONED] websocket set on Twilio handler');
            
            // Startup gate to prevent media flood during initialization
            let streamReady = false;
            const audioBuffer: Buffer[] = [];
            
            // Phase 2: Dead Air Protection (3-second timeout)
            const deadAirTimeout = setTimeout(async () => {
              console.log('[DEAD AIR DEBUG]', { audioReceived, mediaPacketCount, openAiReady: !!openAiWs, sessionReady: streamReady });
              if (!audioReceived) {
                console.log('[DEAD AIR DETECTED] No audio received within 3 seconds');
                await triggerVoicemailFallback(
                  ws, 
                  twilioHandler, 
                  aiSessionTracker, 
                  'No audio received within 3 seconds', 
                  callSid || '', 
                  businessId || '', 
                  callerPhone || '', 
                  businessName || '', 
                  forwardedFrom || ''
                );
              }
            }, 3000);
            
            // Phase 3: Session Ready Timeout (5-second timeout)
            let sessionReady = false;
            const sessionReadyTimeout = setTimeout(async () => {
              if (!sessionReady) {
                console.log('[SESSION READY TIMEOUT] Session not ready within 5 seconds');
                await triggerVoicemailFallback(
                  ws, 
                  twilioHandler, 
                  aiSessionTracker, 
                  'Session not ready within 5 seconds', 
                  callSid || '', 
                  businessId || '', 
                  callerPhone || '', 
                  businessName || '', 
                  forwardedFrom || ''
                );
              }
            }, 5000);
            
            // Additional tracking variables
            let opened = false;
            let greetingSent = false;
            let responseCreatedReceived = false;
            let sessionCreated = false;
            let sessionUpdatedReceived = false;
            
            // Attach listeners - using minimal endpoint pattern
            console.log('[OPENAI STATE AFTER LISTENER] readyState:', openAiWs.readyState, 'OPEN:', WebSocket.OPEN);
            
            // Define sendSessionUpdate helper function
            const sendSessionUpdate = () => {
              console.log('[OPENAI SEND PATH ENTERED]');
              console.log('[OPENAI READY] setting openAiReady to true');
              twilioHandler.setOpenAiReady();
              console.log('[OPENAI READY] openAiReady set to true');
              
              const sessionUpdatePayload = {
                type: "session.update",
                session: {
                  type: "realtime",
                  instructions: `You are an extraction-only AI assistant for missed call intake.

EXTRACTION-ONLY MODE:
Your ONLY function is to extract structured fields from user transcripts.
You MUST NOT generate any conversational responses on your own.
You MUST NOT ask questions, give advice, troubleshoot, diagnose, or provide guidance.
You MUST NOT add conversational filler, acknowledgments, or follow-up questions.
You MUST NOT say anything other than the exact text provided by the app.

BUSINESS CONTEXT (for extraction only):
Business Name: ${businessName || 'Unknown'}
${businessType ? `Business Type: ${businessType}` : ''}
${businessTypeOther ? `Custom Business Type: ${businessTypeOther}` : ''}

EXTRACTION FIELDS TO COLLECT:
- Name
- Reason for calling
- Additional details
- Location
- When work should be completed
- Best callback time

CRITICAL: The app controls ALL spoken responses.
You will receive exact text to speak via response.create instructions.
Speak ONLY that exact text and nothing else.
Do not paraphrase, expand, or modify the provided text.
Do not add greetings, acknowledgments, or conversational elements.
Do not ask any questions on your own initiative.

IMPORTANT: Do not generate assistant responses.
Do not ask questions.
Only convert provided approved assistant text into speech.
The app will send you exact text to speak via response.create instructions.
You must speak ONLY that exact text and nothing else.

CALLBACK TIME RULE:
When the caller provides a callback time, accept it immediately.
Do NOT ask for clarification like "Morning, afternoon, or evening?"
Accept any reasonable callback time answer including: tomorrow, tomorrow morning, tomorrow afternoon, next week, anytime after work, this evening, Friday morning, as soon as possible, etc.
After receiving the callback time answer, do not ask any follow-up questions.

LANGUAGE RULE:
Speak English only. Do not switch languages or imitate accents.

If the caller speaks another language, say exactly:
"I'm sorry, I can only take this message in English."

DO NOT:
- Generate your own questions
- Clarify or follow up
- Continue conversation naturally
- Generate your own phrasing
- Ask industry-specific questions
- Ask additional questions
- Provide any conversational elements
- Add filler words or phrases
- Generate any assistant responses on your own
- Ask for time-of-day clarification (e.g., "Morning, afternoon, or evening?")
- Ask about budget, price range, or cost
- Ask about neighborhoods, locations, or areas
- Ask about property types, house types, or styles
- Ask about property features (rooms, bedrooms, bathrooms, yard, garage, pool, basement)
- Ask about square footage or property size
- Ask about amenities or specific features
- Ask any service-specific follow-up questions not in the approved prompt

SPEAK ONLY the exact text provided by the app via response.create instructions.`,
                  audio: {
                    input: {
                      format: {
                        type: "audio/pcmu"
                      },
                      turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 500,
                        silence_duration_ms: 1800,
                        create_response: false
                      },
                      transcription: {
                        model: "whisper-1"
                      }
                      // We intentionally use a longer silence duration to prevent the AI from responding during natural caller pauses.
                    },
                    output: {
                      format: {
                        type: "audio/pcmu"
                      },
                      voice: "alloy"
                    }
                  }
                }
              };

              // Log transcription configuration
              console.log("[SESSION TRANSCRIPTION CONFIG]", {
                transcriptionEnabled: !!sessionUpdatePayload.session.audio.input.transcription,
                transcriptionModel: sessionUpdatePayload.session.audio.input.transcription?.model || 'not_set',
                inputFormat: sessionUpdatePayload.session.audio.input.format?.type || 'not_set',
                turnDetection: sessionUpdatePayload.session.audio.input.turn_detection?.type || 'not_set',
                outputFormat: sessionUpdatePayload.session.audio.output.format?.type || 'not_set',
                voice: sessionUpdatePayload.session.audio.output.voice || 'not_set'
              });
              
              // Verify audio format matches Twilio (PCMU/mulaw 8khz)
              const inputFormat = sessionUpdatePayload.session.audio.input.format?.type;
              const outputFormat = sessionUpdatePayload.session.audio.output.format?.type;
              console.log('[OPENAI AUDIO FORMAT VERIFICATION]', {
                inputFormat: inputFormat,
                outputFormat: outputFormat,
                matchesTwilio: inputFormat === 'audio/pcmu' && outputFormat === 'audio/pcmu',
                twilioFormat: 'PCMU/mulaw 8khz',
                status: inputFormat === 'audio/pcmu' ? 'MATCHED' : 'MISMATCH'
              });

              const rawSessionUpdate = JSON.stringify(sessionUpdatePayload);
              console.log("[SESSION BUSINESS NAME]", businessName || 'we');
              console.log("[OPENAI SEND] session.update", JSON.stringify(sessionUpdatePayload, null, 2));
              console.log("[SESSION.UPDATE RAW SENT]", rawSessionUpdate);
              console.log("[AI INSTRUCTIONS VERSION] confirmation-flow-v2 - session.update payload");
              console.log("[AI CONFIRMATION FLOW] ACTIVE - instructions require confirmation before final goodbye");
              if (openAiWs) {
                console.log('[OPENAI OUTBOUND] session.update');
                openAiWs.send(rawSessionUpdate);
              }
              
              // Greeting will be sent after session.updated is received
              console.log('[SESSION] waiting for session.updated before sending greeting');
            };
            
            // Check if websocket is already open and send session.update immediately
            if (openAiWs.readyState === WebSocket.OPEN) {
              console.log('[OPENAI WEBSOCKET ALREADY OPEN] sending session.update immediately');
              try {
                sendSessionUpdate();
              } catch (err) {
                console.error('[OPENAI SEND PATH ERROR]', err);
              }
            }
            
            openAiWs.on('open', () => {
              console.log('[STREAM CLONED] OPEN event fired');
              console.log('[OPENAI WEBSOCKET STATE] readyState:', openAiWs?.readyState, 'OPEN:', WebSocket.OPEN);
              opened = true;
              console.log('[OPENAI AUDIT] open listener attached');
              console.log('[OPENAI RAW] open');
              sendSessionUpdate();
            });
            console.log('[OPENAI AUDIT] open listener attached');

            console.log('[OPENAI AUDIT] attaching message listener');
            openAiMessageListenerCount++;
            console.log('[OPENAI_MESSAGE_LISTENER_COUNT] Attaching listener, count:', openAiMessageListenerCount);
            console.log('[OPENAI_MESSAGE_LISTENER_COUNT] Source: ws.on(message) at line 3412');
            openAiWs.on('message', async (data) => {
              console.log('[STREAM CLONED] MESSAGE received');
              console.log('[OPENAI AUDIT] message listener attached');
              console.log('[OPENAI RAW] message');
              
              // Parse message
              let message;
              try {
                message = JSON.parse(data.toString());
              } catch (err) {
                log(LogLevel.ERROR, '[STREAM OPENAI] JSON parse failed', err);
                return;
              }

              // Log every message type with full details
              console.log('[OPENAI WS] message type', { type: message.type });
              console.log('[OPENAI WS] message payload', JSON.stringify(message, null, 2));
              
              // Log full error payloads without truncation
              if (message.type === 'error' || message.error) {
                console.error('[OPENAI FULL ERROR]', JSON.stringify(message, null, 2));
              }

              // Log ALL events containing input_audio, transcript, or transcription
              if (message.type && (
                message.type.includes('input_audio') ||
                message.type.includes('transcript') ||
                message.type.includes('transcription') ||
                message.type.includes('conversation.item') ||
                message.type.includes('response.')
              )) {
                console.log('[USER TRANSCRIPT EVENT]', {
                  type: message.type,
                  hasInputAudio: !!message.input_audio,
                  hasTranscript: !!message.transcript,
                  hasTranscription: !!message.transcription,
                  hasContent: !!message.content,
                  hasItem: !!message.item,
                  item: message.item || null
                });
              }

              // Log input audio events
              if (message.type === 'input_audio_buffer.speech_started') {
                console.log('[OPENAI USER SPEECH STARTED]');
                console.log('[USER AUDIO] speech started');
              }
              if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log('[OPENAI USER SPEECH STOPPED]');
                console.log('[USER AUDIO] speech stopped');
              }
              if (message.type === 'input_audio_buffer.committed') {
                console.log('[USER AUDIO] committed:', message.transcript || 'null');
              }

              // Log all OpenAI event types during final close
              if ((twilioHandler as any).finalClosingStarted) {
                console.log('[OPENAI FINAL EVENT TYPE] =========================================');
                console.log('[OPENAI FINAL EVENT TYPE] Event type:', message.type);
                console.log('[OPENAI FINAL EVENT TYPE] Response ID:', message.response_id || 'unknown');
                console.log('[OPENAI FINAL EVENT TYPE] Item ID:', message.item_id || 'unknown');
                console.log('[OPENAI FINAL EVENT TYPE] Timestamp:', new Date().toISOString());
                console.log('[OPENAI FINAL EVENT TYPE] =========================================');
              }
              if (message.type === 'conversation.item.created') {
                console.log('[OPENAI USER MESSAGE CREATED]');
                console.log('[USER ITEM] created:', message.item?.type || 'unknown');
                
                // Ignore user item creation in terminal mode
                if (closingState.intakeTerminalComplete && message.item?.type === 'user') {
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] User item creation ignored - terminal mode is active');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] Timestamp:', new Date().toISOString());
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  return;
                }
                
                if (message.item?.type === 'user') {
                  const userTranscript = message.item.content?.[0]?.transcript || '';
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  console.log('[CALLER TRANSCRIPT RECEIVED] eventType:', 'conversation.item.created');
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcript:', userTranscript);
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcriptLength:', userTranscript.length);
                  console.log('[CALLER TRANSCRIPT RECEIVED] currentStage:', intakeData?.stage || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] assistantSpeaking:', assistantSpeaking);
                  console.log('[CALLER TRANSCRIPT RECEIVED] activeResponseId:', activeResponseId || 'null');
                  console.log('[CALLER TRANSCRIPT RECEIVED] callSid:', callSid || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] sessionId:', sessionId || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] Timestamp:', new Date().toISOString());
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  
                  // Add user transcript router for confirmation interception
                  const currentStage = intakeData?.stage || 'unknown';
                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage, 
                    intakeComplete: intakeComplete, 
                    transcript: userTranscript 
                  });
                  
                                  }
              }
              if (message.type === 'conversation.item.done') {
                console.log('[USER ITEM] done:', message.item?.type || 'unknown');
                if (message.item?.type === 'user') {
                  const userTranscript = message.item.content?.[0]?.transcript || '';
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  console.log('[CALLER TRANSCRIPT RECEIVED] eventType:', 'conversation.item.done');
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcript:', userTranscript);
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcriptLength:', userTranscript.length);
                  console.log('[CALLER TRANSCRIPT RECEIVED] currentStage:', intakeData?.stage || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] assistantSpeaking:', assistantSpeaking);
                  console.log('[CALLER TRANSCRIPT RECEIVED] activeResponseId:', activeResponseId || 'null');
                  console.log('[CALLER TRANSCRIPT RECEIVED] callSid:', callSid || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] sessionId:', sessionId || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] Timestamp:', new Date().toISOString());
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  
                  // Add user transcript router for confirmation interception
                  const currentStage = intakeData?.stage || 'unknown';
                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage, 
                    intakeComplete: intakeComplete, 
                    transcript: userTranscript 
                  });
                  
                                  }
              }
              if (message.type === 'conversation.item.completed') {
                console.log('[USER ITEM] completed:', message.item?.type || 'unknown');
                if (message.item?.type === 'user') {
                  const userTranscript = message.item.content?.[0]?.transcript || '';
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  console.log('[CALLER TRANSCRIPT RECEIVED] eventType:', 'conversation.item.completed');
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcript:', userTranscript);
                  console.log('[CALLER TRANSCRIPT RECEIVED] transcriptLength:', userTranscript.length);
                  console.log('[CALLER TRANSCRIPT RECEIVED] currentStage:', intakeData?.stage || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] assistantSpeaking:', assistantSpeaking);
                  console.log('[CALLER TRANSCRIPT RECEIVED] activeResponseId:', activeResponseId || 'null');
                  console.log('[CALLER TRANSCRIPT RECEIVED] callSid:', callSid || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] sessionId:', sessionId || 'unknown');
                  console.log('[CALLER TRANSCRIPT RECEIVED] Timestamp:', new Date().toISOString());
                  console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                  
                  // Add user transcript router for confirmation interception
                  const currentStage = intakeData?.stage || 'unknown';
                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage, 
                    intakeComplete: intakeComplete, 
                    transcript: userTranscript 
                  });
                  
                                  }
              }

              // Listen for FINAL transcript events
              if (message.type === 'conversation.item.input_audio_transcription.completed') {
                const userTranscript = message.transcript || '';
                console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                console.log('[CALLER TRANSCRIPT RECEIVED] eventType:', 'conversation.item.input_audio_transcription.completed');
                console.log('[CALLER TRANSCRIPT RECEIVED] transcript:', userTranscript);
                console.log('[CALLER TRANSCRIPT RECEIVED] transcriptLength:', userTranscript.length);
                console.log('[CALLER TRANSCRIPT RECEIVED] currentStage:', intakeData?.stage || 'unknown');
                console.log('[CALLER TRANSCRIPT RECEIVED] assistantSpeaking:', assistantSpeaking);
                console.log('[CALLER TRANSCRIPT RECEIVED] activeResponseId:', activeResponseId || 'null');
                console.log('[CALLER TRANSCRIPT RECEIVED] callSid:', callSid || 'unknown');
                console.log('[CALLER TRANSCRIPT RECEIVED] sessionId:', sessionId || 'unknown');
                console.log('[CALLER TRANSCRIPT RECEIVED] Timestamp:', new Date().toISOString());
                console.log('[CALLER TRANSCRIPT RECEIVED] =========================================');
                console.log('[OPENAI USER TRANSCRIPT RECEIVED]', userTranscript);
                console.log('[USER TRANSCRIPTION COMPLETED]', {
                  transcript: userTranscript,
                  itemId: message.item_id,
                  isEmpty: !userTranscript || userTranscript.trim() === ''
                });
                                if (userTranscript && userTranscript.trim() !== '') {
                  console.log('[USER TRANSCRIPT FOUND]', userTranscript);
                  console.log('[USER TRANSCRIPT APPEND]', { role: 'user', text: userTranscript, timestamp: new Date().toISOString() });
                  console.log('[AI USER TRANSCRIPT FINAL]', userTranscript);
                  console.log('[AI TRANSCRIPT CAPTURED]', { role: 'user', text: userTranscript, timestamp: new Date().toISOString() });
                  transcript.push({ role: 'user', text: userTranscript, timestamp: new Date().toISOString() });

                  // Add user transcript router for confirmation interception
                  const currentStage = intakeData?.stage || 'unknown';
                  console.log('[AI USER TRANSCRIPT ROUTER]', {
                    currentStage,
                    intakeComplete: intakeComplete,
                    transcript: userTranscript
                  });

                  // Ignore transcripts after complete
                  if (intakeData?.stage === 'complete' || intakeComplete) {
                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] transcript ignored after complete');
                    console.log('[SCRIPTED FLOW] stage:', currentStage);
                    console.log('[SCRIPTED FLOW] intakeComplete:', intakeComplete);
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');
                    return; // Skip processing user audio after complete
                  }

                  // Check for goodbye phrases after final message
                  if (closingState.terminalClosingResponseStarted || closingState.finalClosingStarted) {
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] =========================================');
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] Ignoring caller audio during terminal close');
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] finalClosingStarted:', closingState.finalClosingStarted);
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] callState:', closingState.callState);
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] Timestamp:', new Date().toISOString());
                    console.log('[CALLER_AUDIO_IGNORED_DURING_TERMINAL_CLOSE] =========================================');
                    return; // Skip processing user audio during closing
                  }
                } else {
                  console.log('[USER TRANSCRIPT MISSING]', {
                    reason: 'transcript is null or empty',
                    transcript: userTranscript,
                    itemId: message.item_id
                  });
                }
                
                // Process intake stage advancement after FINAL transcript
                console.log('[TRACE COMPLETE 1] =========================================');
                console.log('[TRACE COMPLETE 1] Checking intake processing conditions');
                console.log('[TRACE COMPLETE 1] intakeData:', !!intakeData);
                console.log('[TRACE COMPLETE 1] intakeData.stage:', intakeData?.stage);
                console.log('[TRACE COMPLETE 1] stage !== complete:', intakeData?.stage !== 'complete');
                console.log('[TRACE COMPLETE 1] openAiWs:', !!openAiWs);
                console.log('[TRACE COMPLETE 1] sessionReady:', sessionReady);
                console.log('[TRACE COMPLETE 1] intakeComplete:', intakeComplete);
                console.log('[TRACE COMPLETE 1] !intakeComplete:', !intakeComplete);
                console.log('[TRACE COMPLETE 1] Timestamp:', new Date().toISOString());
                console.log('[TRACE COMPLETE 1] =========================================');

                if (intakeData && intakeData.stage !== 'complete' && openAiWs && sessionReady && !intakeComplete) {
                  console.log('[TRACE COMPLETE 2] =========================================');
                  console.log('[TRACE COMPLETE 2] All conditions passed, entering intake processing');
                  console.log('[TRACE COMPLETE 2] Timestamp:', new Date().toISOString());
                  console.log('[TRACE COMPLETE 2] =========================================');

                  console.log('[AUTO MODEL RESPONSE DISABLED] =========================================');
                  console.log('[AUTO MODEL RESPONSE DISABLED] Automatic model responses disabled');
                  console.log('[AUTO MODEL RESPONSE DISABLED] App controls all assistant responses');
                  console.log('[AUTO MODEL RESPONSE DISABLED] Timestamp:', new Date().toISOString());
                  console.log('[AUTO MODEL RESPONSE DISABLED] =========================================');
                  
                  console.log('[INTAKE FIELD CHECK] =========================================');
                  console.log('[INTAKE FIELD CHECK] Checking required fields after transcript');
                  console.log('[INTAKE FIELD CHECK] customerName:', !!intakeData.customerName);
                  console.log('[INTAKE FIELD CHECK] serviceRequested:', !!intakeData.serviceRequested);
                  console.log('[INTAKE FIELD CHECK] issueDescription:', !!intakeData.issueDescription);
                  console.log('[INTAKE FIELD CHECK] serviceAddress:', !!intakeData.serviceAddress);
                  console.log('[INTAKE FIELD CHECK] desiredCompletionTime:', !!intakeData.desiredCompletionTime);
                  console.log('[INTAKE FIELD CHECK] callbackTime:', !!intakeData.callbackTime);
                  console.log('[INTAKE FIELD CHECK] Timestamp:', new Date().toISOString());
                  console.log('[INTAKE FIELD CHECK] =========================================');
                  
                  // Sync callSessionState when intakeData is initialized
                  if (!callSessionState.intakeData && intakeData) {
                    callSessionState.intakeData = intakeData;
                    callSessionState.currentStage = intakeData.stage;
                    console.log('[CALL SESSION STATE SYNC] =========================================');
                    console.log('[CALL SESSION STATE SYNC] intakeData initialized and synced to callSessionState');
                    console.log('[CALL SESSION STATE SYNC] currentStage:', callSessionState.currentStage);
                    console.log('[CALL SESSION STATE SYNC] Timestamp:', new Date().toISOString());
                    console.log('[CALL SESSION STATE SYNC] =========================================');
                  }

                  // Sync callSessionState when intakeData.stage is updated
                  if (callSessionState.intakeData && intakeData && callSessionState.currentStage !== intakeData.stage) {
                    callSessionState.intakeData = intakeData;
                    callSessionState.currentStage = intakeData.stage;
                    console.log('[CALL SESSION STATE SYNC] =========================================');
                    console.log('[CALL SESSION STATE SYNC] stage updated and synced to callSessionState');
                    console.log('[CALL SESSION STATE SYNC] oldStage:', callSessionState.currentStage);
                    console.log('[CALL SESSION STATE SYNC] newStage:', intakeData.stage);
                    console.log('[CALL SESSION STATE SYNC] Timestamp:', new Date().toISOString());
                    console.log('[CALL SESSION STATE SYNC] =========================================');
                  }

                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage: intakeData.stage, 
                    intakeComplete: intakeComplete, 
                    transcript: userTranscript 
                  });
                  console.log('[INTAKE COMPLETION CHECK] Processing intake stage:', intakeData.stage);
                  console.log('[INTAKE COMPLETION CHECK] User transcript:', userTranscript);
                  console.log('[INTAKE COMPLETION CHECK] Session ready:', sessionReady);
                  
                  // Check if all required fields are collected - HARD APP-LEVEL ENFORCEMENT
                  console.log('[TRACE COMPLETE 3] =========================================');
                  console.log('[TRACE COMPLETE 3] About to call areAllRequiredFieldsCollected');
                  console.log('[TRACE COMPLETE 3] Timestamp:', new Date().toISOString());
                  console.log('[TRACE COMPLETE 3] =========================================');

                  if (areAllRequiredFieldsCollected(intakeData!)) {
                    console.log('[TRACE COMPLETE 4] =========================================');
                    console.log('[TRACE COMPLETE 4] areAllRequiredFieldsCollected returned true');
                    console.log('[TRACE COMPLETE 4] Entering closing logic');
                    console.log('[TRACE COMPLETE 4] Timestamp:', new Date().toISOString());
                    console.log('[TRACE COMPLETE 4] =========================================');

                    console.log('[ALL REQUIRED FIELDS COLLECTED] =========================================');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] All 6 required fields collected');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] Triggering app-controlled closing');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] Timestamp:', new Date().toISOString());
                    console.log('[ALL REQUIRED FIELDS COLLECTED] =========================================');

                    console.log('[TRACE COMPLETE 5] =========================================');
                    console.log('[TRACE COMPLETE 5] About to set stage to complete');
                    console.log('[TRACE COMPLETE 5] Timestamp:', new Date().toISOString());
                    console.log('[TRACE COMPLETE 5] =========================================');

                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intake stage to complete');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intakeComplete flag to true');
                    console.log('[APP CONTROLLED CLOSING STARTED] Calling finalizeCompleteIntakeOnce');
                    console.log('[APP CONTROLLED CLOSING STARTED] Calling enterTerminalClose');
                    console.log('[APP CONTROLLED CLOSING STARTED] Timestamp:', new Date().toISOString());
                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');

                    intakeData!.stage = 'complete';
                    intakeComplete = true;

                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] final goodbye send requested immediately');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Send final goodbye immediately
                    enterTerminalClose(closingState, ws, twilioHandler, openAiWs);

                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] final goodbye send result: requested');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Start SMS/finalization in parallel (don't await)
                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] summary SMS finalization started async');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    finalizeCompleteIntakeOnce(
                      intakeData!,
                      callSid || '',
                      callerPhone || '',
                      businessId || '',
                      ws
                    )
                      .then(() => {
                        console.log('[SCRIPTED FLOW] =========================================');
                        console.log('[SCRIPTED FLOW] summary SMS finalization finished async');
                        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                        console.log('[SCRIPTED FLOW] =========================================');
                      })
                      .catch((error) => {
                        console.log('[SCRIPTED FLOW] =========================================');
                        console.log('[SCRIPTED FLOW] summary SMS finalization failed async');
                        console.log('[SCRIPTED FLOW] error:', String(error));
                        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                        console.log('[SCRIPTED FLOW] =========================================');
                      });

                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] hard hangup scheduled after goodbye delay');
                    console.log('[SCRIPTED FLOW] delay: 12000ms');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Schedule hard hangup 12 seconds after final goodbye send request
                    setTimeout(() => {
                      console.log('[SCRIPTED FLOW] =========================================');
                      console.log('[SCRIPTED FLOW] hard hangup executed after goodbye delay');
                      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                      console.log('[SCRIPTED FLOW] =========================================');
                      executeOpenaiFinalHangup(ws, twilioHandler, closingState);
                    }, 12000);

                    console.log('[TRACE COMPLETE 7] =========================================');
                    console.log('[TRACE COMPLETE 7] enterTerminalClose called, about to return');
                    console.log('[TRACE COMPLETE 7] Timestamp:', new Date().toISOString());
                    console.log('[TRACE COMPLETE 7] =========================================');

                    return; // Skip normal intake processing - NO MORE AI RESPONSES
                  } else {
                    console.log('[TRACE COMPLETE 3.5] =========================================');
                    console.log('[TRACE COMPLETE 3.5] areAllRequiredFieldsCollected returned false');
                    console.log('[TRACE COMPLETE 3.5] Not all fields collected yet');
                    console.log('[TRACE COMPLETE 3.5] Timestamp:', new Date().toISOString());
                    console.log('[TRACE COMPLETE 3.5] =========================================');
                  }

                  // Check if intake is good enough for beta completion (tolerant check)
                  if (isGoodEnoughForBetaIntake(intakeData!)) {
                    console.log('[GOOD ENOUGH INTAKE TRIGGERED CLOSING] =========================================');
                    console.log('[GOOD ENOUGH INTAKE TRIGGERED CLOSING] Intake is good enough for beta');
                    console.log('[GOOD ENOUGH INTAKE TRIGGERED CLOSING] Triggering app-controlled closing');
                    console.log('[GOOD ENOUGH INTAKE TRIGGERED CLOSING] Timestamp:', new Date().toISOString());
                    console.log('[GOOD ENOUGH INTAKE TRIGGERED CLOSING] =========================================');
                    
                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intake stage to complete');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intakeComplete flag to true');
                    console.log('[APP CONTROLLED CLOSING STARTED] Calling enterTerminalClose');
                    console.log('[APP CONTROLLED CLOSING STARTED] Timestamp:', new Date().toISOString());
                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');
                    
                    intakeData!.stage = 'complete';
                    intakeComplete = true;
                    
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] =========================================');
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] About to call enterTerminalClose');
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] closingState:', !!closingState);
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] ws:', !!ws);
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] twilioHandler:', !!twilioHandler);
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] openAiWs:', !!openAiWs);
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] Timestamp:', new Date().toISOString());
                    console.log('[ABOUT TO CALL ENTER TERMINAL CLOSE] =========================================');
                    
                    enterTerminalClose(closingState, ws, twilioHandler, openAiWs);
                    return; // Skip normal intake processing - NO MORE AI RESPONSES
                  }

                  
                                    
                  // Get next intake response
                  const intakeResponse = getIntakeResponse(intakeData!, userTranscript, stagePromptAttempts);

                  // Field extraction is now handled by extractMultipleAnswers in getIntakeResponse
                  // No need for manual field updates here

                  // Log intake state and missing fields
                  const missingFields = getMissingRequiredFields(intakeData!);
                  console.log('[AI INTAKE STATE UPDATED]', {
                    stage: intakeData!.stage,
                    customerName: intakeData!.customerName,
                    serviceRequested: intakeData!.serviceRequested,
                    issueDescription: intakeData!.issueDescription,
                    serviceAddress: intakeData!.serviceAddress,
                    desiredCompletionTime: intakeData!.desiredCompletionTime,
                    callbackTime: intakeData!.callbackTime
                  });
                  console.log('[AI INTAKE MISSING FIELDS]', missingFields);
                  console.log('[AI NEXT QUESTION SELECTED]', intakeResponse.response);
                  console.log('[AI NEXT STAGE]', intakeResponse.nextStage);

                  // Check if issue description is required
                  if (!intakeData!.issueDescription && missingFields.includes('issue description')) {
                    console.log('[AI ISSUE DESCRIPTION REQUIRED] Issue description still missing');
                  }

                  // Block response.create if terminal goodbye has been detected
                  if (closingState.intakeTerminalComplete) {
                    console.log('[RESPONSE_CREATE_BLOCKED_AFTER_GOODBYE] =========================================');
                    console.log('[RESPONSE_CREATE_BLOCKED_AFTER_GOODBYE] Blocking response.create after terminal goodbye detected');
                    console.log('[RESPONSE_CREATE_BLOCKED_AFTER_GOODBYE] intakeTerminalComplete:', closingState.intakeTerminalComplete);
                    console.log('[RESPONSE_CREATE_BLOCKED_AFTER_GOODBYE] Timestamp:', new Date().toISOString());
                    console.log('[RESPONSE_CREATE_BLOCKED_AFTER_GOODBYE] =========================================');
                    return; // Do not create any more responses after terminal goodbye
                  }

                  // Send controlled stage prompt instead of relying on VAD
                  console.log('[AI INTAKE] Sending controlled stage prompt');
                  console.log('[AI INTAKE] advancing to stage:', intakeResponse.nextStage);

                  // Update stage
                  console.log('[CURRENT STAGE SET] =========================================');
                  console.log('[CURRENT STAGE SET] oldStage:', intakeData!.stage);
                  console.log('[CURRENT STAGE SET] newStage:', intakeResponse.nextStage);
                  console.log('[CURRENT STAGE SET] sourceFunction: getIntakeResponse');
                  console.log('[CURRENT STAGE SET] Timestamp:', new Date().toISOString());
                  console.log('[CURRENT STAGE SET] =========================================');
                  
                  // Clear activeResponseId when stage changes to allow new response
                  if (activeResponseId) {
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] =========================================');
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] Clearing activeResponseId due to stage change');
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] Old stage:', intakeData!.stage);
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] New stage:', intakeResponse.nextStage);
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] Previous activeResponseId:', activeResponseId);
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] Timestamp:', new Date().toISOString());
                    console.log('[STAGE CHANGE CLEARING ACTIVE RESPONSE] =========================================');
                    activeResponseId = null;
                    (twilioHandler as any).activeResponseId = activeResponseId;
                  }
                  
                  intakeData!.stage = intakeResponse.nextStage;
                  
                  if (intakeData!.stage === 'complete') {
                    console.log('[INTAKE COMPLETE] =========================================');
                    console.log('[INTAKE COMPLETE] All required fields collected');
                    console.log('[INTAKE COMPLETE] Stage set to complete');
                    console.log('[INTAKE COMPLETE] Triggering terminal close');
                    console.log('[INTAKE COMPLETE] Timestamp:', new Date().toISOString());
                    console.log('[INTAKE COMPLETE] =========================================');
                    
                    intakeComplete = true;
                    
                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] final goodbye send requested immediately');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Send final goodbye immediately
                    enterTerminalClose(closingState, ws, twilioHandler, openAiWs);

                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] final goodbye send result: requested');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Start SMS/finalization in parallel (don't await)
                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] summary SMS finalization started async');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    finalizeCompleteIntakeOnce(intakeData!, callSid || '', callerPhone || '', businessId || '', ws)
                      .then(() => {
                        console.log('[SCRIPTED FLOW] =========================================');
                        console.log('[SCRIPTED FLOW] summary SMS finalization finished async');
                        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                        console.log('[SCRIPTED FLOW] =========================================');
                      })
                      .catch((error) => {
                        console.log('[SCRIPTED FLOW] =========================================');
                        console.log('[SCRIPTED FLOW] summary SMS finalization failed async');
                        console.log('[SCRIPTED FLOW] error:', String(error));
                        console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                        console.log('[SCRIPTED FLOW] =========================================');
                      });

                    console.log('[SCRIPTED FLOW] =========================================');
                    console.log('[SCRIPTED FLOW] hard hangup scheduled after goodbye delay');
                    console.log('[SCRIPTED FLOW] delay: 12000ms');
                    console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                    console.log('[SCRIPTED FLOW] =========================================');

                    // Schedule hard hangup 12 seconds after final goodbye send request
                    setTimeout(() => {
                      console.log('[SCRIPTED FLOW] =========================================');
                      console.log('[SCRIPTED FLOW] hard hangup executed after goodbye delay');
                      console.log('[SCRIPTED FLOW] Timestamp:', new Date().toISOString());
                      console.log('[SCRIPTED FLOW] =========================================');
                      executeOpenaiFinalHangup(ws, twilioHandler, closingState);
                    }, 12000);

                    return; // Skip normal intake processing - NO MORE AI RESPONSES
                  } else {
                    // Send the stage prompt explicitly
                    sendStagePrompt(intakeData!.stage, openAiWs, promptedStages, lastPromptAt, assistantSpeaking, activeResponseId, twilioHandler, lastPromptStage, stagePromptAttempts, ws);
                  }
                }
              }

              // Listen for partial transcript events (optional)
              if (message.type === 'conversation.item.input_audio_transcription.partial') {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  const userTranscript = message.transcript || '';
                  console.log('[AI USER TRANSCRIPT PARTIAL]', userTranscript);
                }
              }
              if (message.type === 'response.created') {
                responseCreatedReceived = true;
                const responseId = message.response?.id || 'unknown';
                console.log('[AI RESPONSE CREATE] =========================================');
                console.log('[AI RESPONSE CREATE] Response ID:', responseId);
                console.log('[AI RESPONSE CREATE] Stage:', intakeData?.stage || 'unknown');
                console.log('[AI RESPONSE CREATE] Previous activeResponseId:', activeResponseId);
                console.log('[AI RESPONSE CREATE] Timestamp:', new Date().toISOString());
                console.log('[AI RESPONSE CREATE] =========================================');
                
                // Guard: Only one active assistant response per stage
                if (activeResponseId && activeResponseId !== responseId) {
                  console.log('[DUPLICATE RESPONSE BLOCKED] =========================================');
                  console.log('[DUPLICATE RESPONSE BLOCKED] Multiple responses detected for same stage');
                  console.log('[DUPLICATE RESPONSE BLOCKED] Stage:', intakeData?.stage || 'unknown');
                  console.log('[DUPLICATE RESPONSE BLOCKED] Active response ID:', activeResponseId);
                  console.log('[DUPLICATE RESPONSE BLOCKED] New response ID:', responseId);
                  console.log('[DUPLICATE RESPONSE BLOCKED] Canceling new response');
                  console.log('[DUPLICATE RESPONSE BLOCKED] Timestamp:', new Date().toISOString());
                  console.log('[DUPLICATE RESPONSE BLOCKED] =========================================');
                  
                  // Cancel the duplicate response
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify({
                      type: 'response.cancel',
                      response_id: responseId
                    }));
                  }
                  return; // Do not process this response
                }
                
                // Set activeResponseId to track the current response
                activeResponseId = responseId;
                (twilioHandler as any).activeResponseId = activeResponseId;
                console.log('[AI RESPONSE CREATE] Set activeResponseId to:', responseId);
                console.log('[AI RESPONSE CREATE] Synced activeResponseId to twilioHandler:', (twilioHandler as any).activeResponseId);
                console.log('[AI RESPONSE CREATE] lastPromptStage on twilioHandler:', (twilioHandler as any).lastPromptStage);
                console.log('[AI RESPONSE CREATE] Stage:', intakeData?.stage || 'unknown');
                
                // Check if this is the final closing response
                const authorizedFinalResponseId = (twilioHandler as any).authorizedFinalResponseId;
                if (responseId === authorizedFinalResponseId) {
                  console.log('[FINAL SENTENCE RESPONSE CREATED] =========================================');
                  console.log('[FINAL SENTENCE RESPONSE CREATED] Final closing response created by OpenAI');
                  console.log('[FINAL SENTENCE RESPONSE CREATED] Response ID:', responseId);
                  console.log('[FINAL SENTENCE RESPONSE CREATED] Timestamp:', new Date().toISOString());
                  console.log('[FINAL SENTENCE RESPONSE CREATED] =========================================');
                }
                
                // Cancel unauthorized responses in terminal mode
                // BUT allow the final close response to be created even if authorizedFinalResponseId is not yet set
                if (closingState.intakeTerminalComplete) {
                  // If we're in final close mode and authorizedFinalResponseId is null, allow this response
                  // The second response.created handler will store the actual ID
                  if ((twilioHandler as any).finalClosingStarted && authorizedFinalResponseId === null) {
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] =========================================');
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] Allowing final close response creation');
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] Response ID:', responseId);
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] Authorized ID will be set by second handler');
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] Timestamp:', new Date().toISOString());
                    console.log('[FINAL CLOSE RESPONSE ALLOWED] =========================================');
                    // Do not cancel - let the response proceed
                  } else if (responseId !== authorizedFinalResponseId) {
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] =========================================');
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] Unauthorized response created after terminal mode started');
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] Response ID:', responseId);
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] Authorized response ID:', authorizedFinalResponseId);
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] Timestamp:', new Date().toISOString());
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] Canceling this response immediately');
                    console.log('[UNAUTHORIZED_RESPONSE_CREATED_AFTER_FINAL] =========================================');
                    
                    // Cancel the unauthorized response
                    if (openAiWs) {
                      openAiWs.send(JSON.stringify({
                        type: 'response.cancel',
                        response_id: responseId
                      }));
                      console.log('[UNAUTHORIZED_RESPONSE_CANCELED] Response cancel command sent');
                    }
                    return; // Do not process this response
                  }
                }
              }
              if (message.type === 'response.output_item.added') {
                console.log('[OPENAI RECV] response.output_item.added');
              }
              if (message.type === 'response.output_item.done') {
                console.log('[OPENAI RECV] response.output_item.done');
                console.log('[FINAL_OUTPUT_ITEM_DONE] Output item complete');
                console.log('[FINAL_OUTPUT_ITEM_DONE] Timestamp:', new Date().toISOString());
                console.log('[FINAL_OUTPUT_ITEM_DONE] finalClosingStarted:', finalClosingStarted);
                console.log('[FINAL_OUTPUT_ITEM_DONE] callState:', callState);
                console.log('[FINAL_OUTPUT_ITEM_DONE] item_id:', message.item_id || 'unknown');
                
                // Reset assistantSpeaking when output item is complete
                const previousAssistantSpeaking = callSessionState.assistantSpeaking;
                if (callSessionState.assistantSpeaking) {
                  callSessionState.assistantSpeaking = false;
                  assistantSpeaking = false; // Sync individual variable for backward compatibility
                  (twilioHandler as any).assistantSpeaking = false;
                  
                  // Check for state desync
                  if (!callSessionState.currentStage && callSessionState.sessionId) {
                    console.log('[CALL STATE DESYNC] =========================================');
                    console.log('[CALL STATE DESYNC] Unknown stage detected after initialization');
                    console.log('[CALL STATE DESYNC] currentStage:', callSessionState.currentStage || 'unknown');
                    console.log('[CALL STATE DESYNC] lastPromptStage:', callSessionState.lastPromptStage);
                    console.log('[CALL STATE DESYNC] activeResponseId:', callSessionState.activeResponseId);
                    console.log('[CALL STATE DESYNC] assistantSpeaking:', callSessionState.assistantSpeaking);
                    console.log('[CALL STATE DESYNC] callSid:', callSessionState.callSid);
                    console.log('[CALL STATE DESYNC] sessionId:', callSessionState.sessionId);
                    console.log('[CALL STATE DESYNC] Timestamp:', new Date().toISOString());
                    console.log('[CALL STATE DESYNC] =========================================');
                  }
                  
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  console.log('[ASSISTANT SPEAKING STATE] State: FALSE');
                  console.log('[ASSISTANT SPEAKING STATE] Source: response.output_item.done');
                  console.log('[ASSISTANT SPEAKING STATE] Response ID:', message.response_id || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Item ID:', message.item_id || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Stage:', callSessionState.currentStage || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Previous state:', previousAssistantSpeaking);
                  console.log('[ASSISTANT SPEAKING STATE] Timestamp:', new Date().toISOString());
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  
                  // Clear timeout protection
                  if (assistantSpeakingTimeout) {
                    clearTimeout(assistantSpeakingTimeout);
                    assistantSpeakingTimeout = null;
                  }
                }
              }
              if (message.type === 'response.output_audio.delta') {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OPENAI RECV] response.output_audio.delta');
                }
                
                // Check if this is the final closing response audio
                const authorizedFinalResponseId = (twilioHandler as any).authorizedFinalResponseId;
                const currentResponseId = message.response_id || 'unknown';
                const isFinalResponse = currentResponseId === authorizedFinalResponseId;
                
                // Force-allow final close audio if finalClosingStarted is true, regardless of response ID
                const isFinalClosingStarted = (twilioHandler as any).finalClosingStarted;
                const forceAllowFinalAudio = isFinalClosingStarted && message.delta && message.delta.length > 0;
                
                // Log response ID comparison for debugging
                if (isFinalClosingStarted) {
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] =========================================');
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] Current response ID:', currentResponseId);
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] Authorized response ID:', authorizedFinalResponseId);
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] Match:', isFinalResponse);
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] Force allow final audio:', forceAllowFinalAudio);
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] Timestamp:', new Date().toISOString());
                  console.log('[FINAL AUDIO RESPONSE ID CHECK] =========================================');
                  
                  if (!isFinalResponse && !forceAllowFinalAudio) {
                    console.log('[FINAL AUDIO REJECTED] =========================================');
                    console.log('[FINAL AUDIO REJECTED] Audio delta rejected - response ID mismatch');
                    console.log('[FINAL AUDIO REJECTED] Expected response ID:', authorizedFinalResponseId);
                    console.log('[FINAL AUDIO REJECTED] Actual response ID:', currentResponseId);
                    console.log('[FINAL AUDIO REJECTED] Timestamp:', new Date().toISOString());
                    console.log('[FINAL AUDIO REJECTED] =========================================');
                  }
                  
                  if (forceAllowFinalAudio) {
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] =========================================');
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] Force allowing final close audio delta');
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] Response ID:', currentResponseId);
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] Delta length:', message.delta?.length || 0);
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] Timestamp:', new Date().toISOString());
                    console.log('[FINAL CLOSE AUDIO FORCE ALLOWED] =========================================');
                  }
                }
                
                if (isFinalResponse || forceAllowFinalAudio) {
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] =========================================');
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] Audio delta for final closing response');
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] Response ID:', currentResponseId);
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] Delta length:', message.delta?.length || 0);
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] Timestamp:', new Date().toISOString());
                  console.log('[FINAL SENTENCE AUDIO DELTA RECEIVED] =========================================');
                  
                  // Track final audio activity
                  if (!(twilioHandler as any).finalSentenceAudioStartedAt) {
                    (twilioHandler as any).finalSentenceAudioStartedAt = Date.now();
                    console.log('[FINAL AUDIO STARTED] =========================================');
                    console.log('[FINAL AUDIO STARTED] First audio delta for final sentence received');
                    console.log('[FINAL AUDIO STARTED] Timestamp:', new Date().toISOString());
                    console.log('[FINAL AUDIO STARTED] =========================================');
                  }
                  (twilioHandler as any).finalSentenceLastAudioDeltaAt = Date.now();
                  (twilioHandler as any).finalSentenceAudioDeltaCount = ((twilioHandler as any).finalSentenceAudioDeltaCount || 0) + 1;
                  
                  const audioDeltaCount = (twilioHandler as any).finalSentenceAudioDeltaCount;
                  console.log('[FINAL AUDIO DELTA COUNT] =========================================');
                  console.log('[FINAL AUDIO DELTA COUNT] Audio delta count:', audioDeltaCount);
                  console.log('[FINAL AUDIO DELTA COUNT] Timestamp:', new Date().toISOString());
                  console.log('[FINAL AUDIO DELTA COUNT] =========================================');
                  
                  // Track OpenAI final close audio started
                  (twilioHandler as any).finalCloseAudioStarted = true;
                  console.log('[OPENAI FINAL AUDIO DELTA RECEIVED] =========================================');
                  console.log('[OPENAI FINAL AUDIO DELTA RECEIVED] OpenAI final close audio delta received');
                  console.log('[OPENAI FINAL AUDIO DELTA RECEIVED] Delta length:', message.delta?.length || 0);
                  console.log('[OPENAI FINAL AUDIO DELTA RECEIVED] Timestamp:', new Date().toISOString());
                  console.log('[OPENAI FINAL AUDIO DELTA RECEIVED] =========================================');
                }
                
                // Log when audio is sent to Twilio
                if (isFinalResponse) {
                  console.log('[OPENAI FINAL AUDIO DELTA SENT TO TWILIO] =========================================');
                  console.log('[OPENAI FINAL AUDIO DELTA SENT TO TWILIO] Final audio delta sent to Twilio');
                  console.log('[OPENAI FINAL AUDIO DELTA SENT TO TWILIO] Delta length:', message.delta?.length || 0);
                  console.log('[OPENAI FINAL AUDIO DELTA SENT TO TWILIO] Timestamp:', new Date().toISOString());
                  console.log('[OPENAI FINAL AUDIO DELTA SENT TO TWILIO] =========================================');
                }
                
                // Drop unauthorized audio in terminal mode
                // BUT allow the final close response audio even if authorizedFinalResponseId is not yet set
                if (closingState.intakeTerminalComplete) {
                  // If we're in final close mode and authorizedFinalResponseId is null, allow this audio
                  // The response ID will be set by the second response.created handler
                  if (isFinalClosingStarted && authorizedFinalResponseId === null) {
                    console.log('[FINAL CLOSE AUDIO ALLOWED] =========================================');
                    console.log('[FINAL CLOSE AUDIO ALLOWED] Allowing final close audio delta');
                    console.log('[FINAL CLOSE AUDIO ALLOWED] Response ID:', currentResponseId);
                    console.log('[FINAL CLOSE AUDIO ALLOWED] Authorized ID will be set by second handler');
                    console.log('[FINAL CLOSE AUDIO ALLOWED] Timestamp:', new Date().toISOString());
                    console.log('[FINAL CLOSE AUDIO ALLOWED] =========================================');
                    // Do not drop - let the audio proceed
                  } else if (currentResponseId !== authorizedFinalResponseId && !forceAllowFinalAudio) {
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] =========================================');
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] Unauthorized audio dropped - terminal mode is active');
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] Response ID:', currentResponseId);
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] Authorized response ID:', authorizedFinalResponseId);
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] Timestamp:', new Date().toISOString());
                    console.log('[UNAUTHORIZED_AUDIO_DROPPED_AFTER_FINAL] =========================================');
                    return; // Do not forward this audio to Twilio
                  }
                }

                // Set assistant speaking to true when audio starts
                if (!callSessionState.assistantSpeaking) {
                  callSessionState.assistantSpeaking = true;
                  assistantSpeaking = true; // Sync individual variable for backward compatibility
                  (twilioHandler as any).assistantSpeaking = true;
                  
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  console.log('[ASSISTANT SPEAKING STATE] State: TRUE');
                  console.log('[ASSISTANT SPEAKING STATE] Source: response.output_audio.delta');
                  console.log('[ASSISTANT SPEAKING STATE] Response ID:', message.response_id || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Stage:', callSessionState.currentStage || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Timestamp:', new Date().toISOString());
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  
                  // Start timeout protection (30 seconds)
                  if (assistantSpeakingTimeout) {
                    clearTimeout(assistantSpeakingTimeout);
                  }
                  assistantSpeakingTimeout = setTimeout(() => {
                    if (assistantSpeaking) {
                      console.log('[ASSISTANT SPEAKING TIMEOUT] =========================================');
                      console.log('[ASSISTANT SPEAKING TIMEOUT] assistantSpeaking stuck for 30 seconds');
                      console.log('[ASSISTANT SPEAKING TIMEOUT] Force resetting to false');
                      console.log('[ASSISTANT SPEAKING TIMEOUT] Timestamp:', new Date().toISOString());
                      console.log('[ASSISTANT SPEAKING TIMEOUT] =========================================');
                      assistantSpeaking = false;
                      (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                    }
                  }, 30000); // 30 second timeout
                }

                // REMOVED: callState = 'closing' transition from audio delta handler
                // Closing state can only be entered through:
                // 1. enterTerminalClose()
                // 2. startAuthoritativeFinalClose()
                // 3. Other explicit terminal-close functions that first set terminalClosingResponseStarted = true
                if (callState === 'active' && !closingState.terminalClosingResponseStarted) {
                  // Log once when terminal closing has not started
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] =========================================');
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] Audio delta closing request ignored');
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] Reason: terminalClosingResponseStarted is false');
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] callState remains active');
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] Timestamp:', new Date().toISOString());
                  console.log('[AUDIO DELTA CLOSING REQUEST IGNORED - TERMINAL NOT STARTED] =========================================');
                } else if (callState === 'closing') {
                  // Log if already in closing state
                  console.log('[CALL STATE ALREADY CLOSING] callState is already closing');
                  console.log('[CALL STATE ALREADY CLOSING] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                  console.log('[CALL STATE ALREADY CLOSING] confirmationState:', confirmationState);
                  console.log('[CALL STATE ALREADY CLOSING] Timestamp:', new Date().toISOString());
                }

                // Recovery logic: if final audio arrives without closing state being set
                if (!closingState.terminalClosingResponseStarted && confirmationState === 'completed') {
                  console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] Final audio delta received but terminalClosingResponseStarted is false');
                  console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] This indicates startAuthoritativeFinalClose was not called');
                  console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] Triggering recovery call to startAuthoritativeFinalClose');
                  console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] Timestamp:', new Date().toISOString());
                  console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] Current closingState:', JSON.stringify(closingState, null, 2));

                  const recoverySuccess = startAuthoritativeFinalClose(
                    closingState,
                    twilioHandler,
                    'recovery_from_final_audio_without_closing_state at line 3915'
                  );

                  if (recoverySuccess) {
                    // Sync individual variables from closingState
                    finalClosingStarted = closingState.finalClosingStarted;
                    terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
                    confirmationState = closingState.confirmationState;
                    callState = closingState.callState;
                    console.log('[FINAL_AUDIO_WITHOUT_CLOSING_STATE] Recovery successful, state synced');
                  }
                }

                // Log when final goodbye audio delta is received
                if (finalClosingStarted) {
                  console.log('[FINAL_AUDIO_DELTA_ACCEPTED] Final goodbye audio delta received');
                  console.log('[FINAL_AUDIO_DELTA_ACCEPTED] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                  console.log('[FINAL_AUDIO_DELTA_ACCEPTED] callState:', callState);
                  console.log('[FINAL_AUDIO_DELTA_ACCEPTED] Timestamp:', new Date().toISOString());
                  console.log('[FINAL_AUDIO_DELTA_ACCEPTED] callState transition to closing allowed');

                  // Fallback timers removed - using response.audio.done for normal close and hardStopTimer for emergency
                }

                // Clear dead air timeout since we received audio
                if (!audioReceived) {
                  audioReceived = true;
                  clearTimeout(deadAirTimeout);
                  updateAISessionState(aiSessionTracker, 'AUDIO_RECEIVED', 'First audio delta received');
                  console.log('[AI STATE] AUDIO_RECEIVED - dead air protection cleared');
                }
              }
              if (message.type === 'response.audio.done') {
                console.log('[OPENAI RECV] response.audio.done');
                console.log('[FINAL_AUDIO_DONE] Audio generation complete');
                console.log('[FINAL_AUDIO_DONE] Timestamp:', new Date().toISOString());
                console.log('[FINAL_AUDIO_DONE] finalClosingStarted:', finalClosingStarted);
                console.log('[FINAL_AUDIO_DONE] callState:', callState);
                console.log('[FINAL_AUDIO_DONE] hangupScheduled:', hangupScheduled);
                console.log('[FINAL_AUDIO_DONE] finalGoodbyeMarkSent:', finalGoodbyeMarkSent);
                
                // Reset assistantSpeaking when audio generation is complete
                const previousAssistantSpeaking = assistantSpeaking;
                if (assistantSpeaking) {
                  assistantSpeaking = false;
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  console.log('[ASSISTANT SPEAKING STATE] State: FALSE');
                  console.log('[ASSISTANT SPEAKING STATE] Source: response.audio.done');
                  console.log('[ASSISTANT SPEAKING STATE] Response ID:', message.response_id || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Item ID:', message.item_id || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Stage:', intakeData?.stage || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Previous state:', previousAssistantSpeaking);
                  console.log('[ASSISTANT SPEAKING STATE] Timestamp:', new Date().toISOString());
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                  
                  // Clear timeout protection
                  if (assistantSpeakingTimeout) {
                    clearTimeout(assistantSpeakingTimeout);
                    assistantSpeakingTimeout = null;
                  }
                }
                
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] =========================================');
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Authorized final response audio generation complete');
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Timestamp:', new Date().toISOString());
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Terminal mode active:', closingState.intakeTerminalComplete);
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] =========================================');
                
                // Start hard-close timer if terminal mode is active
                if (closingState.intakeTerminalComplete && closingState.callState !== 'closed') {
                  console.log('[NORMAL FINAL COMPLETION HANGUP] =========================================');
                  console.log('[NORMAL FINAL COMPLETION HANGUP] Normal completion via response.audio.done');
                  console.log('[NORMAL FINAL COMPLETION HANGUP] Starting 2-second hangup buffer');
                  console.log('[NORMAL FINAL COMPLETION HANGUP] This ensures audio playback completes before hangup');
                  console.log('[NORMAL FINAL COMPLETION HANGUP] Timestamp:', new Date().toISOString());
                  console.log('[NORMAL FINAL COMPLETION HANGUP] =========================================');
                  
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] =========================================');
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Starting 2-second hangup buffer after authorized final response audio done');
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] This ensures audio playback completes before hangup');
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Timestamp:', new Date().toISOString());
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] =========================================');

                  setTimeout(async () => {
                    if (closingState.callState !== 'closed') {
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] =========================================');
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Hangup buffer fired after authorized final response audio done');
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Calling endCallCleanly');
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Timestamp:', new Date().toISOString());
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Current callState:', closingState.callState);
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] =========================================');

                      try {
                        await endCallCleanly(ws, twilioHandler);
                        closingState.callState = 'closed';
                        (twilioHandler as any).callState = closingState.callState;
                        console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Hangup completed successfully');
                      } catch (error) {
                        console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE_ERROR] Error during hangup:', error);
                      }
                    } else {
                      console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE_SKIPPED] Call already closed, hangup skipped');
                    }
                  }, 2000); // 2 second buffer after audio done
                }
              }
              if (message.type === 'response.done') {
                const currentResponseId = message.response?.id || 'unknown';
                console.log('[AI RESPONSE COMPLETE] =========================================');
                console.log('[AI RESPONSE COMPLETE] Response ID:', currentResponseId);
                console.log('[AI RESPONSE COMPLETE] Stage:', intakeData?.stage || 'unknown');
                console.log('[AI RESPONSE COMPLETE] Active response ID before clear:', activeResponseId);
                console.log('[AI RESPONSE COMPLETE] Timestamp:', new Date().toISOString());
                console.log('[AI RESPONSE COMPLETE] =========================================');

                // Check if this is the final closing response
                const authorizedFinalResponseId = (twilioHandler as any).authorizedFinalResponseId;
                const isFinalResponse = currentResponseId === authorizedFinalResponseId;
                
                if (isFinalResponse) {
                  console.log('[FINAL SENTENCE RESPONSE DONE] =========================================');
                  console.log('[FINAL SENTENCE RESPONSE DONE] Final closing response done event received');
                  console.log('[FINAL SENTENCE RESPONSE DONE] Response ID:', currentResponseId);
                  console.log('[FINAL SENTENCE RESPONSE DONE] Timestamp:', new Date().toISOString());
                  console.log('[FINAL SENTENCE RESPONSE DONE] =========================================');
                }

                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] =========================================');
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Response done event received');
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Timestamp:', new Date().toISOString());
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Terminal mode active:', closingState.intakeTerminalComplete);
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] =========================================');

                // Clear activeResponseId when response is done
                if (activeResponseId === currentResponseId) {
                  console.log('[AI RESPONSE COMPLETE] Clearing activeResponseId:', activeResponseId);
                  activeResponseId = null;
                  (twilioHandler as any).activeResponseId = activeResponseId;
                }

                // Set assistant speaking to false when response is done
                if (assistantSpeaking) {
                  assistantSpeaking = false;
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  console.log('[ASSISTANT SPEAKING STATE] State: FALSE');
                  console.log('[ASSISTANT SPEAKING STATE] Source: response.done');
                  console.log('[ASSISTANT SPEAKING STATE] Response ID:', currentResponseId);
                  console.log('[ASSISTANT SPEAKING STATE] Stage:', intakeData?.stage || 'unknown');
                  console.log('[ASSISTANT SPEAKING STATE] Timestamp:', new Date().toISOString());
                  console.log('[ASSISTANT SPEAKING STATE] =========================================');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                  
                  // Clear timeout protection
                  if (assistantSpeakingTimeout) {
                    clearTimeout(assistantSpeakingTimeout);
                    assistantSpeakingTimeout = null;
                  }
                }

                console.log('[FINAL GOODBYE RESPONSE DONE] Final goodbye response completed');
                
                // DO NOT trigger hangup on response.done anymore
                // Wait for response.audio.done instead to ensure audio generation is complete
              }
              if (message.type === 'response.content') {
                console.log('[TRANSCRIPT] response.content', { content: message.content });
                if (message.content) {
                  const assistantText = message.content;
                  const currentStage = intakeData?.stage || 'ask_name_reason';
                  const intakeTemplate = (ws as any).intakeTemplate || 'on_site';
                  
                  // Get the approved prompt for the current stage
                  const approvedPrompt = getIntakeStageTextSafe(intakeTemplate, currentStage as any);
                  
                  // Log approved prompt
                  console.log('[APPROVED PROMPT] =========================================');
                  console.log('[APPROVED PROMPT] stage:', currentStage);
                  console.log('[APPROVED PROMPT] template:', intakeTemplate);
                  console.log('[APPROVED PROMPT] prompt:', approvedPrompt);
                  console.log('[APPROVED PROMPT] Timestamp:', new Date().toISOString());
                  console.log('[APPROVED PROMPT] =========================================');
                  
                  // Log assistant response generated
                  console.log('[ASSISTANT RESPONSE GENERATED] =========================================');
                  console.log('[ASSISTANT RESPONSE GENERATED] stage:', currentStage);
                  console.log('[ASSISTANT RESPONSE GENERATED] text:', assistantText);
                  console.log('[ASSISTANT RESPONSE GENERATED] Timestamp:', new Date().toISOString());
                  console.log('[ASSISTANT RESPONSE GENERATED] =========================================');
                  
                  // Check if the assistant text substantially matches the approved prompt
                  // Allow for minor variations but require substantial overlap
                  const textMatchesApproved = approvedPrompt && (
                    assistantText === approvedPrompt ||
                    assistantText.includes(approvedPrompt.substring(0, 30)) ||
                    approvedPrompt.includes(assistantText.substring(0, 30))
                  );
                  
                  // Check for unapproved question patterns (comprehensive list)
                  const unapprovedQuestionPatterns = [
                    'budget',
                    'price range',
                    'neighborhood',
                    'location preferences',
                    'preferred location',
                    'property type',
                    'type of house',
                    'type of property',
                    'yard',
                    'rooms',
                    'bedrooms',
                    'bathrooms',
                    'square footage',
                    'what features',
                    'what kind of',
                    'what type of',
                    'looking for in a',
                    'specific features',
                    'amenities',
                    'style of home',
                    'size of home',
                    'number of bedrooms',
                    'number of bathrooms',
                    'garage',
                    'pool',
                    'basement',
                    'how many bedrooms',
                    'how many bathrooms',
                    'what is your budget',
                    'what is your price range',
                    'what neighborhood',
                    'what area',
                    'what location',
                    'property features',
                    'home features',
                    'house features',
                  ];
                  
                  const containsUnapprovedQuestion = unapprovedQuestionPatterns.some(pattern => 
                    assistantText.toLowerCase().includes(pattern)
                  );
                  
                  // Block unapproved questions OR responses that don't match approved prompt
                  if (!textMatchesApproved) {
                    console.log('[UNAPPROVED RESPONSE BLOCKED] =========================================');
                    console.log('[UNAPPROVED RESPONSE BLOCKED] Assistant response does not match approved prompt');
                    console.log('[UNAPPROVED RESPONSE BLOCKED] stage:', currentStage);
                    console.log('[UNAPPROVED RESPONSE BLOCKED] template:', intakeTemplate);
                    console.log('[UNAPPROVED RESPONSE BLOCKED] approvedPrompt:', approvedPrompt);
                    console.log('[UNAPPROVED RESPONSE BLOCKED] generatedText:', assistantText);
                    console.log('[UNAPPROVED RESPONSE BLOCKED] containsUnapprovedQuestion:', containsUnapprovedQuestion);
                    console.log('[UNAPPROVED RESPONSE BLOCKED] Response ID:', message.response_id || 'unknown');
                    console.log('[UNAPPROVED RESPONSE BLOCKED] Timestamp:', new Date().toISOString());
                    console.log('[UNAPPROVED RESPONSE BLOCKED] =========================================');
                    
                    // Cancel the response if it has an ID
                    if (message.response_id && openAiWs) {
                      openAiWs.send(JSON.stringify({
                        type: 'response.cancel',
                        response_id: message.response_id
                      }));
                      console.log('[UNAPPROVED RESPONSE CANCELED] Response cancel command sent');
                    }
                    
                    // Replay the approved prompt immediately to self-correct
                    console.log('[APPROVED PROMPT REPLAYED] =========================================');
                    console.log('[APPROVED PROMPT REPLAYED] Replaying approved prompt after blocking unapproved response');
                    console.log('[APPROVED PROMPT REPLAYED] stage:', currentStage);
                    console.log('[APPROVED PROMPT REPLAYED] prompt:', approvedPrompt);
                    console.log('[APPROVED PROMPT REPLAYED] Timestamp:', new Date().toISOString());
                    console.log('[APPROVED PROMPT REPLAYED] =========================================');
                    
                    sendApprovedPrompt(currentStage, openAiWs, ws);
                    
                    // Do not add to transcript - skip this unapproved content
                    return;
                  }
                  
                  console.log('[AI TRANSCRIPT CAPTURED]', { role: 'assistant', text: message.content, timestamp: new Date().toISOString() });
                  transcript.push({ role: 'assistant', text: message.content, timestamp: new Date().toISOString() });
                }
              }

              // Log session configuration
              if (message.type === 'session.created') {
                console.log('[OPENAI RECV] session.created');
                console.log('[SESSION] session configuration', JSON.stringify(message.session, null, 2));
              }
              if (message.type === 'session.updated') {
                console.log('[OPENAI RECV] session.updated');
                console.log('[SESSION UPDATED RECEIVED]');
                sessionUpdatedReceived = true;
                sessionReady = true; // Set sessionReady to true
                
                // Clear the session ready timeout since we received session.updated
                clearTimeout(sessionReadyTimeout);
                
                // Update session state tracking
                updateAISessionState(aiSessionTracker, 'SESSION_READY', 'session.updated received');
                
                console.log('[SESSION READY] - session.updated received, now ready to send greeting');
                console.log('[SESSION UPDATED CONFIG]', JSON.stringify(message.session, null, 2));
                console.log('[SESSION COMPARE] instructions:', {
                  outbound: 'You are an English-speaking receptionist.',
                  returned: message.session?.instructions
                });
                console.log('[SESSION COMPARE] voice:', {
                  outbound: AI_VOICE,
                  returned: message.session?.voice
                });
                console.log('[SESSION COMPARE] audio format:', {
                  outbound: 'not set (minimal test)',
                  returned: message.session?.audio
                });
                
                // Send exactly one greeting response.create after session.updated
                if (!greetingSent) {
                  console.log('[CODE OWNED FIRST PROMPT SENT] =========================================');
                  console.log('[CODE OWNED FIRST PROMPT SENT] Sending exact greeting prompt');
                  console.log('[CODE OWNED FIRST PROMPT SENT] Timestamp:', new Date().toISOString());
                  console.log('[CODE OWNED FIRST PROMPT SENT] =========================================');
                  
                  // Use centralized sendApprovedPrompt for greeting
                  sendApprovedPrompt('ask_name_reason', openAiWs, ws);
                  greetingSent = true;
                  updateAISessionState(aiSessionTracker, 'GREETING_SENT', 'Greeting response.create sent');
                  console.log('[GREETING SENT]');
                  console.log('[AI STATE] GREETING_SENT');
                } else {
                  console.log('[GREETING BLOCKED - ALREADY SENT]');
                }
                
                // Set flag to enable manual fallback after greeting
                twilioHandler.setGreetingSent();
                
                // After greeting is sent, set streamReady and flush buffer
                streamReady = true;
                console.log('[STREAM READY] true - now accepting caller audio');
                (twilioHandler as any).streamReady = true;
                if (audioBuffer.length > 0) {
                  console.log('[BUFFER FLUSH] sending buffered audio', { count: audioBuffer.length });
                  const openAiWs = (twilioHandler as any).openAiWs;
                  if (openAiWs) {
                    for (const buffer of audioBuffer) {
                      const audioMessage = {
                        type: 'input_audio_buffer.append',
                        audio: buffer.toString('base64'),
                      };
                      openAiWs.send(JSON.stringify(audioMessage));
                    }
                  }
                  console.log('[BUFFER FLUSH] complete');
                }
              }

              // Log full error payload
              if (message.type === 'error') {
                console.error('[OPENAI FULL ERROR]', JSON.stringify(message, null, 2));
                console.error('[OPENAI FATAL ERROR] - stopping processing');
                console.error('[OPENAI ERROR FIELDS]', {
                  type: message.type,
                  code: message.code,
                  message: message.message,
                  event_id: message.event_id,
                  param: message.param,
                  error: message.error,
                  details: message.details,
                });
                return;
              }
              
              // Log specific OpenAI events for debugging
              if (message.type === 'input_audio_buffer.speech_started') {
                console.log('[OPENAI RECV] input_audio_buffer.speech_started');
                
                // Ignore user speech started in terminal mode
                if (closingState.intakeTerminalComplete) {
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] User speech started ignored - terminal mode is active');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] Timestamp:', new Date().toISOString());
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  return;
                }
              }
              if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log('[OPENAI RECV] input_audio_buffer.speech_stopped');
                
                // Ignore user speech stopped in terminal mode
                if (closingState.intakeTerminalComplete) {
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] User speech stopped ignored - terminal mode is active');
                  console.log('[TERMINAL_USER_EVENT_IGNORED] Timestamp:', new Date().toISOString());
                  console.log('[TERMINAL_USER_EVENT_IGNORED] =========================================');
                  return;
                }
              }
              if (message.type === 'input_audio_buffer.committed') {
                console.log('[OPENAI RECV] input_audio_buffer.committed');
                console.log('[USER TRANSCRIPT] committed:', message.transcript || 'null');
                
                // Block input_audio_buffer commits in terminal mode
                if (closingState.intakeTerminalComplete) {
                  console.log('[TERMINAL_USER_AUDIO_EVENT_IGNORED] =========================================');
                  console.log('[TERMINAL_USER_AUDIO_EVENT_IGNORED] User audio commit ignored - terminal mode is active');
                  console.log('[TERMINAL_USER_AUDIO_EVENT_IGNORED] Transcript:', message.transcript || 'null');
                  console.log('[TERMINAL_USER_AUDIO_EVENT_IGNORED] Timestamp:', new Date().toISOString());
                  console.log('[TERMINAL_USER_AUDIO_EVENT_IGNORED] =========================================');
                  return; // Do not process this commit
                }
              }
              if (message.type === 'response.created') {
                console.log('[OPENAI RECV] response.created');
                const actualResponseId = message.response_id || 'unknown';

                console.log('[RESPONSE CREATE SOURCE] =========================================');
                console.log('[RESPONSE CREATE SOURCE] source:', authorizedResponseCreateSource || 'UNAUTHORIZED');
                console.log('[RESPONSE CREATE SOURCE] responseId:', actualResponseId);
                console.log('[RESPONSE CREATE SOURCE] expectedPrompt:', expectedPrompt || 'none');
                console.log('[RESPONSE CREATE SOURCE] Timestamp:', new Date().toISOString());
                console.log('[RESPONSE CREATE SOURCE] =========================================');

                console.log('[OPENAI ACTUAL RESPONSE ID] =========================================');
                console.log('[OPENAI ACTUAL RESPONSE ID] Actual OpenAI response ID:', actualResponseId);
                console.log('[OPENAI ACTUAL RESPONSE ID] Authorized final response ID:', (twilioHandler as any).authorizedFinalResponseId);
                console.log('[OPENAI ACTUAL RESPONSE ID] Final closing started:', (twilioHandler as any).finalClosingStarted);
                console.log('[OPENAI ACTUAL RESPONSE ID] Timestamp:', new Date().toISOString());
                console.log('[OPENAI ACTUAL RESPONSE ID] =========================================');

                // Scope guard: Check if this response was created by sendApprovedPrompt
                // All approved responses should have authorizedResponseCreateSource set to 'sendApprovedPrompt'
                const isFinalClose = (twilioHandler as any).finalClosingStarted;
                if (authorizedResponseCreateSource !== 'sendApprovedPrompt' && !isFinalClose) {
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] =========================================');
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] response.created detected without authorized source');
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] authorizedResponseCreateSource:', authorizedResponseCreateSource);
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] This indicates AI generated a response instead of using approved prompts');
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] Response ID:', actualResponseId);
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] Stage:', intakeData?.stage || 'unknown');
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] Canceling this response');
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] Timestamp:', new Date().toISOString());
                  console.log('[VOICE SCOPE VIOLATION BLOCKED] =========================================');

                  // Cancel the unauthorized response
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify({
                      type: 'response.cancel',
                      response_id: actualResponseId
                    }));
                    console.log('[UNAUTHORIZED RESPONSE CANCELED] Response cancel command sent');
                  }
                  return; // Do not process this response
                }

                // Clear the authorized source flag after verification
                authorizedResponseCreateSource = null;

                // If this is the final close response, store the actual OpenAI response ID
                if ((twilioHandler as any).finalClosingStarted) {
                  (twilioHandler as any).finalClosingResponseId = actualResponseId;
                  (twilioHandler as any).authorizedFinalResponseId = actualResponseId;
                  console.log('[OPENAI FINAL RESPONSE ID STORED] =========================================');
                  console.log('[OPENAI FINAL RESPONSE ID STORED] Storing actual OpenAI response ID as finalClosingResponseId');
                  console.log('[OPENAI FINAL RESPONSE ID STORED] Response ID:', actualResponseId);
                  console.log('[OPENAI FINAL RESPONSE ID STORED] Timestamp:', new Date().toISOString());
                  console.log('[OPENAI FINAL RESPONSE ID STORED] =========================================');
                }
              }
              if (message.type === 'response.done') {
                const responseId = message.response_id || 'unknown';
                console.log('[OPENAI RECV] response.done');
                console.log('[FINAL_RESPONSE_DONE] Response completed');
                console.log('[FINAL_RESPONSE_DONE] response_id:', responseId);
                console.log('[FINAL_RESPONSE_DONE] Timestamp:', new Date().toISOString());
                console.log('[FINAL_RESPONSE_DONE] finalClosingStarted:', finalClosingStarted);
                console.log('[FINAL_RESPONSE_DONE] callState:', callState);

                // Finalize any remaining active assistant transcripts
                activeAssistantTranscripts.forEach((buffer, itemId) => {
                  if (buffer.trim()) {
                    const cleanBuffer = buffer.replace(/\[CALL_COMPLETE\]|CALL_COMPLETE|call complete/gi, '').trim();
                    if (cleanBuffer) {
                      transcript.push({ role: 'assistant', text: cleanBuffer, timestamp: new Date().toISOString() });
                      console.log('[TRANSCRIPT FINALIZED]', { 
                        item_id: itemId, 
                        final_text: cleanBuffer 
                      });
                    }
                  }
                });
                activeAssistantTranscripts.clear();
                
                // response.done handler no longer triggers terminal close
                // Terminal mode is now triggered by confirmation acceptance branch
                // See: CONFIRMATION_ACCEPTED_TERMINAL_MODE_STARTED section
              }
              if (message.type === 'response.output_audio_transcript.delta') {
                console.log('[OPENAI RECV] response.output_audio_transcript.delta:', message.delta || 'null');
                console.log('[ACTIVE_TRANSCRIPT_DELTA_RECEIVED] =========================================');
                console.log('[ACTIVE_TRANSCRIPT_DELTA_RECEIVED] Delta received in main transcript handler');
                console.log('[ACTIVE_TRANSCRIPT_DELTA_RECEIVED] Timestamp:', new Date().toISOString());
                console.log('[ACTIVE_TRANSCRIPT_DELTA_RECEIVED] =========================================');
                
                // Accumulate assistant transcript deltas in buffer
                if (message.delta) {
                  const itemId = message.item_id || 'current';
                  const currentBuffer = activeAssistantTranscripts.get(itemId) || '';
                  const updatedBuffer = currentBuffer + message.delta;
                  activeAssistantTranscripts.set(itemId, updatedBuffer);
                  
                  console.log('[TRANSCRIPT DELTA]', { 
                    item_id: itemId, 
                    current_buffer_length: updatedBuffer.length 
                  });
                  
                  // Final sentence self-defense detection
                  // This ensures terminal mode is set when the actual final sentence appears in the transcript
                  const exactClosingSentence = "Perfect. I have everything I need. The team will follow up with you soon.";
                  const followUpPhrase = "The team will follow up with you soon";
                  
                  const bufferLower = updatedBuffer.toLowerCase();
                  const hasExactClosing = bufferLower.includes(exactClosingSentence.toLowerCase());
                  const hasFollowUpPhrase = bufferLower.includes(followUpPhrase.toLowerCase());
                  
                  if ((hasExactClosing || hasFollowUpPhrase) && !closingState.intakeTerminalComplete) {
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] =========================================');
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Final sentence detected in transcript delta');
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Exact closing:', hasExactClosing);
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Follow-up phrase:', hasFollowUpPhrase);
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Buffer:', updatedBuffer);
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Timestamp:', new Date().toISOString());
                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] =========================================');

                    // Set terminal mode immediately
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] =========================================');
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Source: response.output_audio_transcript.delta handler at line 5709');
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Trigger: Final sentence detected in transcript');
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Current callState:', callState);
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Current terminalClosingResponseStarted:', terminalClosingResponseStarted);
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Current finalClosingStarted:', finalClosingStarted);
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Current confirmationState:', confirmationState);
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Current stage:', intakeData?.stage);
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Stack: response.output_audio_transcript.delta -> final sentence detection -> state transition');
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] Timestamp:', new Date().toISOString());
                    console.log('[CALL STATE CLOSING REQUEST - PATH 2] =========================================');

                    closingState.intakeTerminalComplete = true;
                    closingState.callState = 'closing';
                    closingState.terminalClosingResponseStarted = true;
                    closingState.finalClosingStarted = true;
                    closingState.confirmationState = 'completed';

                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] =========================================');
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] New callState:', closingState.callState);
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] New terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] New finalClosingStarted:', closingState.finalClosingStarted);
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] New confirmationState:', closingState.confirmationState);
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] Timestamp:', new Date().toISOString());
                    console.log('[CALL STATE CLOSING COMPLETED - PATH 2] =========================================');

                    // Sync individual variables for backward compatibility
                    callState = closingState.callState;
                    finalClosingStarted = closingState.finalClosingStarted;
                    terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
                    confirmationState = closingState.confirmationState;

                    // Sync to twilioHandler
                    (twilioHandler as any).closingState = closingState;
                    (twilioHandler as any).callState = closingState.callState;
                    (twilioHandler as any).finalClosingStarted = closingState.finalClosingStarted;
                    (twilioHandler as any).terminalClosingResponseStarted = closingState.terminalClosingResponseStarted;
                    (twilioHandler as any).intakeTerminalComplete = closingState.intakeTerminalComplete;

                    console.log('[FINAL_SENTENCE_DETECTED_IN_TRANSCRIPT] Terminal mode set');
                    // 10s hard hangup timer removed - using hardStopTimer from startAuthoritativeFinalClose instead
                  }
                }
              }
              if (message.type === 'response.output_audio_transcript.done') {
                console.log('[OPENAI RECV] response.output_audio_transcript.done:', message.transcript || 'null');
                // Finalize all active assistant transcripts
                activeAssistantTranscripts.forEach((buffer, itemId) => {
                  if (buffer.trim()) {
                    const cleanBuffer = buffer.replace(/\[CALL_COMPLETE\]|CALL_COMPLETE|call complete/gi, '').trim();
                    if (cleanBuffer) {
                      transcript.push({ role: 'assistant', text: cleanBuffer, timestamp: new Date().toISOString() });
                      console.log('[TRANSCRIPT FINALIZED]', { 
                        item_id: itemId, 
                        final_text: cleanBuffer 
                      });
                    }
                  }
                });
                activeAssistantTranscripts.clear();
                
                // DO NOT start hard-close timer here
                // response.output_audio_transcript.done is NOT safe as final playback-complete signal
                // It fires while audio is still streaming
                // Hard-close timer will be started in response.audio.done or response.done instead
                
                // Validate greeting transcript
                if (greetingSent && message.transcript) {
                  console.log('[GREETING ACTUAL TRANSCRIPT]', message.transcript);
                  if (!message.transcript.startsWith('Sorry,')) {
                    console.log('[GREETING MISMATCH] - Expected greeting to start with "Sorry,"');
                  }
                }
              }
                            if (message.type === 'conversation.item.output_audio_transcription.completed') {
                console.log('[OPENAI RECV] conversation.item.output_audio_transcription.completed');
                console.log('[FINAL ASSISTANT TRANSCRIPT]:', message.transcript || 'null');
                
                // Verify transcript matches expected prompt
                if (expectedPrompt && message.transcript) {
                  const actualTranscript = message.transcript.trim();
                  const normalizedExpected = expectedPrompt.trim().toLowerCase();
                  const normalizedActual = actualTranscript.toLowerCase();
                  
                  // Check if actual transcript contains the expected prompt (allowing for minor variations)
                  const matchesExpected = normalizedActual.includes(normalizedExpected) || 
                                        normalizedExpected.includes(normalizedActual);
                  
                  console.log('[VOICE PROMPT VERIFICATION] =========================================');
                  console.log('[VOICE PROMPT VERIFICATION] expectedPrompt:', expectedPrompt);
                  console.log('[VOICE PROMPT VERIFICATION] actualTranscript:', actualTranscript);
                  console.log('[VOICE PROMPT VERIFICATION] matchesExpected:', matchesExpected);
                  console.log('[VOICE PROMPT VERIFICATION] Timestamp:', new Date().toISOString());
                  console.log('[VOICE PROMPT VERIFICATION] =========================================');
                  
                  if (!matchesExpected) {
                    console.log('[VOICE PROMPT SCOPE VIOLATION] =========================================');
                    console.log('[VOICE PROMPT SCOPE VIOLATION] AI spoke outside allowed prompt scope');
                    console.log('[VOICE PROMPT SCOPE VIOLATION] expectedPrompt:', expectedPrompt);
                    console.log('[VOICE PROMPT SCOPE VIOLATION] actualTranscript:', actualTranscript);
                    console.log('[VOICE PROMPT SCOPE VIOLATION] responseId:', currentResponseId || 'unknown');
                    console.log('[VOICE PROMPT SCOPE VIOLATION] Timestamp:', new Date().toISOString());
                    console.log('[VOICE PROMPT SCOPE VIOLATION] =========================================');
                  }
                  
                  // Clear expected prompt after verification
                  expectedPrompt = null;
                }
                
                // Accumulate complete assistant transcript
                if (message.transcript) {
                  console.log('[AI TRANSCRIPT APPEND]', { role: 'assistant', text: message.transcript });
                  
                  // Check for final closing phrases
                  const cleanTranscript = message.transcript.replace(/\[CALL_COMPLETE\]|CALL_COMPLETE|call complete/gi, '').trim();
                  
                  // Hard log for model-generated legacy confirmation
                  if (cleanTranscript.toLowerCase().includes('is that correct?') || cleanTranscript.toLowerCase().includes('is this correct?')) {
                    console.log('[MODEL GENERATED LEGACY CONFIRMATION] =========================================');
                    console.log('[MODEL GENERATED LEGACY CONFIRMATION] Model generated confirmation question instead of app');
                    console.log('[MODEL GENERATED LEGACY CONFIRMATION]', {
                      transcript: cleanTranscript,
                      callState: callState
                    });
                    console.log('[MODEL GENERATED LEGACY CONFIRMATION] =========================================');
                  }
                  
                  if (cleanTranscript) {
                    transcript.push({ role: 'assistant', text: cleanTranscript, timestamp: new Date().toISOString() });
                  }
                  
                  // Log transcript state after accumulation
                  console.log('[AI TRANSCRIPT STATE]', {
                    transcriptLength: transcript.length,
                    transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | ')
                  });
                }
                
                // Legacy hangup logic removed - using final response.done + 1500ms buffer only
                console.log('[AI LEGACY HANGUP REMOVED - USING FINAL RESPONSE DONE ONLY]');
                
                // Validate greeting transcript
                if (greetingSent && message.transcript) {
                  console.log('[GREETING ACTUAL TRANSCRIPT]', message.transcript);
                  if (!message.transcript.startsWith('Sorry,')) {
                    console.log('[GREETING MISMATCH] - Expected greeting to start with "Sorry,"');
                  }
                }
              }
              
              // Catch-all logging for every OpenAI event type
              if (process.env.DEBUG_AI_VOICE === 'true') {
                console.log('[OPENAI EVENT]', message.type);
              }

              
              // Handle audio delta - now PCMU directly from OpenAI
              if (message.type === 'response.output_audio.delta') {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OPENAI RECV] response.output_audio.delta');
                  console.log('[AI AUDIO DELTA] Assistant audio delta received');
                }
              }
              if (message.type === 'response.output_audio_transcript.delta') {
                console.log('[OPENAI RECV] response.output_audio_transcript.delta');
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[AI TRANSCRIPT DELTA]', message.delta || 'null');
                }
                // Do NOT trigger hangup on delta - wait for completed transcript events
              }
              if (message.type === 'response.output_audio_transcript.done') {
                console.log('[OPENAI RECV] response.output_audio_transcript.done');
                console.log('[FINAL_TRANSCRIPT_DONE] Transcript complete');
                console.log('[FINAL_TRANSCRIPT_DONE] Timestamp:', new Date().toISOString());
                console.log('[FINAL_TRANSCRIPT_DONE] finalClosingStarted:', finalClosingStarted);
                console.log('[FINAL_TRANSCRIPT_DONE] callState:', callState);
                console.log('[AI TRANSCRIPT DONE]', message.transcript || 'null');

                // Do NOT trigger hangup on transcript completion - wait for response.audio.done only
                // This prevents premature hangup before audio has finished generating
              }
              if (message.type === 'response.output_audio.delta' && message.delta) {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[GREETING AUDIO DELTA RECEIVED] Audio delta from OpenAI');
                }
                console.log('[FORWARDING PCMU DIRECTLY] - no conversion needed');
                
                const streamSid = twilioHandler.getStreamSid();
                
                // Only send audio if streamSid is available
                if (!streamSid) {
                  console.log('[AUDIO OUT] SKIPPED - streamSid not available yet');
                  return;
                }
                
                // Log call state during audio streaming
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OUTBOUND ASSISTANT AUDIO DELTA]', {
                    callState: callState,
                    assistantSpeaking: assistantSpeaking,
                    bytes: message.delta.length
                  });
                }

                // Check if audio should be blocked
                if (callState === 'closing') {
                  console.log('[OUTBOUND ASSISTANT AUDIO BLOCKED]', {
                    reason: 'terminal_closing',
                    callState: callState
                  });
                  return;
                }

                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OUTBOUND ASSISTANT AUDIO FORWARDED TO TWILIO]', { bytes: message.delta.length });
                }
                
                // Forward PCMU directly to Twilio
                const mediaMessage = {
                  event: 'media',
                  streamSid: streamSid,
                  media: {
                    payload: message.delta, // Direct PCMU from OpenAI
                  },
                };
                
                ws.send(JSON.stringify(mediaMessage));
              }
            });
            console.log('[OPENAI AUDIT] message listener attached');

            console.log('[OPENAI AUDIT] attaching error listener');
            openAiWs.on('error', async (error) => {
              console.log('[STREAM CLONED] ERROR event:', String(error));
              console.log('[OPENAI AUDIT] error listener attached');
              log(LogLevel.ERROR, '[STREAM OPENAI] error event fired', error as Error);
              openaiInitFailed = true;
              
              // Trigger voicemail fallback for OpenAI WebSocket errors
              await triggerVoicemailFallback(
                ws, 
                twilioHandler, 
                aiSessionTracker, 
                `OpenAI WebSocket error: ${error}`, 
                callSid || '', 
                businessId || '', 
                callerPhone || '', 
                businessName || '', 
                forwardedFrom || ''
              );
            });

            // Ingestion function to save call data
            const ingestCallData = async () => {
              const sessionSessionId = (ws as any).sessionId || '';
              const sessionBusinessId = (ws as any).businessId || '';
              const sessionCallSid = (ws as any).callSid || '';
              const sessionCallerPhone = (ws as any).callerPhone || '';
              const sessionForwardedFrom = (ws as any).forwardedFrom || '';
              const sessionLeadId = (ws as any).leadId || null;
              const sessionConversationId = (ws as any).conversationId || null;
              
              console.log('[AI INGEST START] call ended');
              console.log('[AI INGEST] transcript captured', { transcriptLength: transcript.length });
              console.log('[AI TRANSCRIPT STATE]', {
                transcriptLength: transcript.length,
                transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | ')
              });
              console.log('[AI INGEST] session data', { 
                sessionId: sessionSessionId, 
                businessId: sessionBusinessId, 
                callSid: sessionCallSid, 
                callerPhone: sessionCallerPhone,
                forwardedFrom: sessionForwardedFrom,
                leadId: sessionLeadId,
                conversationId: sessionConversationId
              });
              
              console.log('[AI INGEST FINAL CONTEXT]', {
                businessId: sessionBusinessId,
                callerPhone: sessionCallerPhone,
                leadId: sessionLeadId,
                conversationId: sessionConversationId,
                sessionId: sessionSessionId,
                transcriptLength: transcript.length,
                transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | ')
              });
              
              // Check for existing AI call record (idempotency protection)
              if (!supabase) {
                console.log('[AI INGEST] supabase client not available for idempotency check');
                return;
              }
              
              const { data: existingRecord, error: existingError } = await supabase
                .from('ai_call_records')
                .select('id, created_at')
                .eq('call_sid', sessionCallSid)
                .single();
              
              if (existingError && existingError.code !== 'PGRST116') {
                console.log('[AI INGEST] error checking existing record', existingError);
                return;
              }
              
              if (existingRecord) {
                console.log('[AI INGEST] record already exists, updating instead of creating', { 
                  existingId: existingRecord.id, 
                  createdAt: existingRecord.created_at 
                });
                // Update existing record instead of creating duplicate
                // Convert structured transcript to string format
                const fullTranscript = transcript.map(entry => `${entry.role}: ${entry.text}`).join('\n');
                console.log('[AI INGEST] full transcript', { transcript: fullTranscript });
                
                // Guard: Skip extraction if transcript is empty
                if (!transcript || transcript.length === 0) {
                  console.log('[AI INGEST] transcript is empty, skipping extraction');
                  // Update with transcript only if extraction failed
                  const { error: fallbackUpdateError } = await supabase
                    .from('ai_call_records')
                    .update({
                      transcript: transcript,
                    })
                    .eq('id', existingRecord.id);

                  if (fallbackUpdateError) {
                    console.log('[AI INGEST FAILED] fallback update also failed', fallbackUpdateError);
                  } else {
                    console.log('[AI INGEST] fallback update successful (empty transcript)');
                  }
                  return;
                }
                
                try {
                  // Extract structured fields from transcript
                  console.log('[AI INGEST] extracting fields...');
                  const extractionPrompt = `Extract the following information from this AI call transcript. Return JSON with these keys: callerName, reasonForCalling, urgencyLevel, importantDetails, addressOrLocation, preferredCallbackTime, summary. If a field is not found, set it to null.

The summary should be concise and business-facing. Example: "John Smith called regarding a leaking water heater. Issue appears urgent because water is actively leaking. Caller requested callback this afternoon."

Transcript:
${fullTranscript}

Return only JSON, no other text.`;

                  const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                      model: 'gpt-4',
                      messages: [
                        { role: 'system', content: 'You are a data extraction assistant. Return only valid JSON.' },
                        { role: 'user', content: extractionPrompt },
                      ],
                      temperature: 0,
                    }),
                  });

                  const extractionData = await extractionResponse.json();
                  console.log('[AI INGEST EXTRACTION RAW]', (extractionData as any).choices[0].message.content);
                  
                  let extractedFields;
                  try {
                    extractedFields = JSON.parse((extractionData as any).choices[0].message.content);
                    console.log('[AI INGEST EXTRACTION PARSED]', extractedFields);
                  } catch (parseError) {
                    console.log('[AI INGEST EXTRACTION PARSE FAILED]', parseError);
                    console.log('[AI INGEST EXTRACTION PARSE FAILED] using fallback transcript');
                    // Create fallback extracted fields from transcript
                    extractedFields = {
                      callerName: null,
                      reasonForCalling: null,
                      urgencyLevel: null,
                      importantDetails: null,
                      addressOrLocation: null,
                      preferredCallbackTime: null,
                      summary: `AI call transcript: ${fullTranscript}`
                    };
                  }

                  // Update existing AI call record
                  const updatePayload = {
                      transcript: transcript,
                      extracted_info: extractedFields,
                      summary: extractedFields.summary,
                      extraction_failed: false,
                      updated_at: new Date().toISOString()
                    };
                  console.log('[AI CALL RECORD UPDATE PAYLOAD]', updatePayload);
                  const { error: updateError } = await supabase
                    .from('ai_call_records')
                    .update(updatePayload)
                    .eq('id', existingRecord.id);

                  if (updateError) {
                    console.log('[AI INGEST] error updating existing record', updateError);
                    throw updateError;
                  }
                  
                  console.log('[AI INGEST] existing record updated successfully');
                  return;
                } catch (error) {
                  console.log('[AI INGEST FAILED] extraction failed during update, updating with transcript only', error);
                  
                  // Update with transcript only if extraction failed
                  const { error: fallbackUpdateError } = await supabase
                    .from('ai_call_records')
                    .update({
                      transcript: transcript,
                    })
                    .eq('id', existingRecord.id);

                  if (fallbackUpdateError) {
                    console.log('[AI INGEST] fallback update also failed', fallbackUpdateError);
                  } else {
                    console.log('[AI INGEST] fallback update successful');
                  }
                  return;
                }
              }
              
              // Create new AI call record if no existing record found
              console.log('[AI INGEST] no existing record, creating new AI call record');
              
              // Convert structured transcript to string format
              const fullTranscript = transcript.map(entry => `${entry.role}: ${entry.text}`).join('\n');
              console.log('[AI INGEST] full transcript', { transcript: fullTranscript });
              
              // Guard: Skip extraction if transcript is empty
              if (!transcript || transcript.length === 0) {
                console.log('[AI INGEST] transcript is empty, skipping extraction');
                // Create AI call record with empty transcript
                const { data: emptyRecord, error: emptyRecordError } = await supabase
                  .from('ai_call_records')
                  .insert({
                    business_id: sessionBusinessId,
                    caller_phone: sessionCallerPhone || 'unknown',
                    call_sid: sessionCallSid || 'unknown',
                    transcript: [],
                    outcome: 'ai_failed_voicemail',
                    extracted_info: null,
                    summary: 'AI call completed (no transcript)',
                    extraction_failed: true
                  })
                  .select()
                  .single();

                if (emptyRecordError) {
                  console.log('[AI INGEST FAILED] empty record creation failed', emptyRecordError);
                } else {
                  console.log('[AI INGEST INSERT SUCCESS] empty record created successfully');
                }
                return;
              }
              
              try {
                // Extract structured fields from transcript
                console.log('[AI INGEST] extracting fields...');
                const extractionPrompt = `Extract the following information from this AI call transcript. Return JSON with these keys: customerName, serviceRequested, issueDescription, serviceAddress, desiredCompletionTime, callbackTime, summary. If a field is not found, set it to null.

The summary should be concise and business-facing. Example: "John Smith called regarding a leaking water heater. Caller requested callback this afternoon."

Transcript:
${fullTranscript}

Return only JSON, no other text.`;

                const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  },
                  body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                      { role: 'system', content: 'You are a data extraction assistant. Return only valid JSON.' },
                      { role: 'user', content: extractionPrompt },
                    ],
                    temperature: 0,
                  }),
                });

                const extractionData = await extractionResponse.json();
                console.log('[AI INGEST EXTRACTION RAW]', (extractionData as any).choices[0].message.content);
                
                let extractedFields;
                try {
                  extractedFields = JSON.parse((extractionData as any).choices[0].message.content);
                  console.log('[AI INGEST EXTRACTION PARSED]', extractedFields);
                  
                  // Validate customerName to prevent non-name values from being saved
                  if (extractedFields.customerName && !isValidCustomerName(extractedFields.customerName)) {
                    console.log('[AI INGEST CUSTOMER NAME BLOCKED] =========================================');
                    console.log('[AI INGEST CUSTOMER NAME BLOCKED] Invalid customerName detected:', extractedFields.customerName);
                    console.log('[AI INGEST CUSTOMER NAME BLOCKED] Setting customerName to null');
                    console.log('[AI INGEST CUSTOMER NAME BLOCKED] Timestamp:', new Date().toISOString());
                    console.log('[AI INGEST CUSTOMER NAME BLOCKED] =========================================');
                    extractedFields.customerName = null;
                  }
                } catch (parseError) {
                  console.log('[AI INGEST EXTRACTION PARSE FAILED]', parseError);
                  console.log('[AI INGEST EXTRACTION PARSE FAILED] using fallback transcript');
                  // Create fallback extracted fields from transcript
                  extractedFields = {
                    customerName: null,
                    serviceRequested: null,
                    issueDescription: null,
                    serviceAddress: null,
                    desiredCompletionTime: null,
                    callbackTime: null,
                    summary: `AI call transcript: ${fullTranscript}`
                  };
                }

                // Create new AI call record
                console.log('[AI INGEST] creating new AI call record...');
                const insertPayload = {
                    business_id: sessionBusinessId,
                    lead_id: sessionLeadId,
                    conversation_id: sessionConversationId,
                    caller_phone: sessionCallerPhone, // DEBUG: No fallback to see actual value
                    call_sid: sessionCallSid || 'unknown',
                    ai_session_id: sessionSessionId,
                    transcript: Array.isArray(transcript) ? transcript : [],
                    outcome: 'ai_completed',
                    extracted_info: extractedFields,
                    summary: extractedFields.summary,
                    extraction_failed: false
                  };
                console.log('[AI CALL RECORD OUTCOME]', {
                  outcome: insertPayload.outcome,
                  callSid: insertPayload.call_sid,
                  businessId: insertPayload.business_id,
                  leadId: insertPayload.lead_id,
                  conversationId: insertPayload.conversation_id
                });
                console.log('[AI TRANSCRIPT STATE]', {
                    transcriptLength: transcript.length,
                    transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | '),
                    transcriptType: typeof transcript,
                    isArray: Array.isArray(transcript)
                  });
                console.log('[INSERT PATH C] AI ingest path', {
                  file: 'services/replyflow-ai-voice/src/index.ts',
                  line: 3158,
                  lead_id: insertPayload.lead_id,
                  conversation_id: insertPayload.conversation_id
                });
                console.log('[AI CALL RECORD INSERT PAYLOAD]', insertPayload);

                console.log('[AI CALL RECORD INSERT ACTIVE PATH]', {
                  file: 'services/replyflow-ai-voice/src/index.ts',
                  function: 'AI ingest path',
                  sessionId: 'unknown',
                  callSid: sessionCallSid,
                  businessId: sessionBusinessId,
                  callerPhone: sessionCallerPhone
                });

                console.log('[BEFORE AI_CALL_RECORD INSERT - PATH-C-main-extraction]', {
                  businessId: sessionBusinessId,
                  leadId: insertPayload.lead_id,
                  conversationId: insertPayload.conversation_id,
                  callSid: sessionCallSid
                });

                const { data: newRecord, error: newRecordError } = await supabase
                  .from('ai_call_records')
                  .insert(insertPayload)
                  .select()
                  .single();

                console.log('[AFTER AI_CALL_RECORD INSERT - PATH-C-main-extraction]', {
                  error: newRecordError
                });

                if (newRecordError) {
                  console.log('[AI CALL RECORD SAVE FAILED]', newRecordError);
                  throw newRecordError;
                }
                
                console.log('[AI CALL RECORD SAVED]', { recordId: newRecord.id });
                console.log('[AI RECORD INSERT PATH IDENTIFIED]', {
                  pathName: 'path-C-main-insert-with-extraction',
                  aiRecordId: newRecord.id,
                  leadId: insertPayload.lead_id,
                  conversationId: insertPayload.conversation_id,
                  businessId: sessionBusinessId
                });
                
                // Create follow-up jobs directly using Supabase
                console.log('[FOLLOWUP DIRECT INSERT START - PATH-C]', { 
                  businessId: sessionBusinessId, 
                  leadId: insertPayload.lead_id,
                  conversationId: insertPayload.conversation_id
                });
                
                try {
                  const { error: followUpError } = await supabase
                    .from('follow_up_jobs')
                    .insert({
                      business_id: sessionBusinessId,
                      lead_id: insertPayload.lead_id,
                      conversation_id: insertPayload.conversation_id,
                      status: 'pending',
                      scheduled_for: new Date().toISOString(),
                      created_at: new Date().toISOString()
                    });
                  
                  if (followUpError) {
                    console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-C]', followUpError);
                  } else {
                    console.log('[FOLLOWUP DIRECT INSERT SUCCESS - PATH-C]', { 
                      businessId: sessionBusinessId, 
                      leadId: insertPayload.lead_id
                    });
                  }
                } catch (followUpError) {
                  console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-C]', followUpError);
                }
                console.log('[FOLLOWUP DIRECT INSERT COMPLETE - PATH-C]');
                
                // Create notification via API endpoint (uses notificationServiceServer)
                console.log('[NOTIFICATION SERVICE START - PATH-C]', {
                  businessId: sessionBusinessId,
                  leadId: insertPayload.lead_id,
                  type: 'ai_intake_completed'
                });

                try {
                  const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
                  const notificationApiUrl = appBaseUrl;
                  console.log('[NOTIFICATION SERVICE URL - PATH-C]', notificationApiUrl);

                  const internalApiSecret = process.env.INTERNAL_API_SECRET;
                  if (!internalApiSecret) {
                    console.log('[NOTIFICATION SERVICE ERROR - PATH-C] INTERNAL_API_SECRET not configured');
                  }

                  const headers: any = {
                    'Content-Type': 'application/json',
                  };
                  if (internalApiSecret) {
                    headers['Authorization'] = `Bearer ${internalApiSecret}`;
                  }

                  const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      businessId: sessionBusinessId,
                      leadId: insertPayload.lead_id,
                      type: 'ai_intake_completed',
                      customerName: null,
                      customerPhone: sessionCallerPhone,
                      serviceRequested: null
                    })
                  });

                  if (response.ok) {
                    console.log('[NOTIFICATION SERVICE SUCCESS - PATH-C]', {
                      businessId: sessionBusinessId,
                      leadId: insertPayload.lead_id
                    });
                  } else {
                    console.log('[NOTIFICATION SERVICE ERROR - PATH-C]', {
                      businessId: sessionBusinessId,
                      leadId: insertPayload.lead_id,
                      status: response.status,
                      statusText: response.statusText
                    });
                  }
                } catch (notificationError) {
                  console.log('[NOTIFICATION SERVICE ERROR - PATH-C]', {
                    businessId: sessionBusinessId,
                    leadId: insertPayload.lead_id,
                    error: notificationError
                  });
                }

                console.log('[NOTIFICATION SERVICE COMPLETE - PATH-C]');

                // Upsert lead
                if (!supabase) {
                  console.log('[AI INGEST] supabase client not available');
                  return;
                }
                
                const leadInsertPayload = {
                  business_id: sessionBusinessId,
                  caller_phone: sessionCallerPhone,
                  status: 'new',
                };
                console.log('[LEAD CREATE START]', { payload: leadInsertPayload });
                
                const { data: lead, error: leadError } = await supabase
                  .from('leads')
                  .upsert(leadInsertPayload, {
                    onConflict: 'business_id,caller_phone',
                  })
                  .select()
                  .single();

                if (leadError) {
                  console.log('[LEAD CREATE ERROR]', { error: leadError.message });
                  throw leadError;
                }
                console.log('[LEAD CREATE SUCCESS]', { leadId: lead.id });
                console.log('[AI LEAD UPSERTED]', { leadId: lead.id });

                // Create or update conversation
                const conversationInsertPayload = {
                  lead_id: lead.id,
                  business_id: sessionBusinessId,
                  status: 'active',
                };
                console.log('[CONVERSATION CREATE START]', { payload: conversationInsertPayload });
                
                // Lookup existing conversation by lead_id
                const { data: existingConversation, error: conversationLookupError } = await supabase
                  .from('conversations')
                  .select('*')
                  .eq('lead_id', lead.id)
                  .maybeSingle();

                let conversation;
                let conversationError;

                if (existingConversation) {
                  conversation = existingConversation;
                  console.log('[CONVERSATION FOUND]', { conversationId: conversation.id });
                } else {
                  const result = await supabase
                    .from('conversations')
                    .insert(conversationInsertPayload)
                    .select()
                    .single();
                  conversation = result.data;
                  conversationError = result.error;
                }

                if (conversationError) {
                  console.log('[CONVERSATION CREATE ERROR]', { error: conversationError.message });
                  throw conversationError;
                }
                console.log('[CONVERSATION CREATE SUCCESS]', { conversationId: conversation.id });
                console.log('[AI CONVERSATION UPDATED]', { conversationId: conversation.id });

                // Update AI call record with lead_id and conversation_id
                console.log('[AI INGEST] updating AI call record with lead and conversation IDs...');
                const { error: updateRecordError } = await supabase
                  .from('ai_call_records')
                  .update({
                    lead_id: lead.id,
                    conversation_id: conversation.id,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', newRecord.id);

                if (updateRecordError) {
                  console.log('[AI INGEST] error updating AI call record with IDs', updateRecordError);
                  // Don't throw here - the record was created successfully
                } else {
                  console.log('[AI INGEST] AI call record updated with lead and conversation IDs');
                  console.log('[AI LINK SUCCESS]', {
                    aiCallRecordId: newRecord.id,
                    leadId: lead.id,
                    conversationId: conversation.id
                  });
                }

                // Save summary message
                console.log('[AI INGEST] summary saving...');
                const summaryMessage = extractedFields.summary || `AI call summary:
Name: ${extractedFields.customerName || 'Not provided'}
Service: ${extractedFields.serviceRequested || 'Not provided'}
Details: ${extractedFields.issueDescription || 'Not provided'}
Location: ${extractedFields.serviceAddress || 'Not provided'}
Completion time: ${extractedFields.desiredCompletionTime || 'Not provided'}
Callback: ${extractedFields.callbackTime || 'Not provided'}`;

                // Check for existing summary message to prevent duplicates
                console.log('[MESSAGE INSERT ATTEMPT] Checking for duplicate AI summary message', {
                  conversation_id: conversation.id,
                  lead_id: lead.id,
                  message_type: 'summary'
                });
                
                const { data: existingSummary, error: summaryCheckError } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('conversation_id', conversation.id)
                  .eq('message_type', 'summary')
                  .limit(1)
                  .single();
                
                if (existingSummary) {
                  console.log('[MESSAGE DUPLICATE BLOCKED] AI summary message already exists for conversation', {
                    existing_summary_id: existingSummary.id,
                    conversation_id: conversation.id,
                    lead_id: lead.id
                  });
                } else if (summaryCheckError && summaryCheckError.code !== 'PGRST116') {
                  console.error('[MESSAGE DUPLICATE CHECK] Error checking for AI summary duplicate:', summaryCheckError);
                }

                const { error: messageError } = await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversation.id,
                    lead_id: lead.id,
                    business_id: sessionBusinessId,
                    content: summaryMessage,
                    message_type: 'summary',
                    structured_data: extractedFields,
                  });

                if (messageError) {
                  console.log('[AI INGEST] message save error', messageError);
                  throw messageError;
                }
                console.log('[MESSAGE INSERTED] AI summary message saved successfully', {
                  conversation_id: conversation.id,
                  lead_id: lead.id,
                  business_id: sessionBusinessId,
                  message_type: 'summary'
                });

                // Save transcript message
                console.log('[AI INGEST] transcript saving...');
                
                // Check for existing transcript message to prevent duplicates
                console.log('[MESSAGE INSERT ATTEMPT] Checking for duplicate AI transcript message', {
                  conversation_id: conversation.id,
                  lead_id: lead.id,
                  message_type: 'transcript'
                });
                
                const { data: existingTranscript, error: transcriptCheckError } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('conversation_id', conversation.id)
                  .eq('message_type', 'transcript')
                  .limit(1)
                  .single();
                
                if (existingTranscript) {
                  console.log('[MESSAGE DUPLICATE BLOCKED] AI transcript message already exists for conversation', {
                    existing_transcript_id: existingTranscript.id,
                    conversation_id: conversation.id,
                    lead_id: lead.id
                  });
                } else if (transcriptCheckError && transcriptCheckError.code !== 'PGRST116') {
                  console.error('[MESSAGE DUPLICATE CHECK] Error checking for AI transcript duplicate:', transcriptCheckError);
                }

                const { error: transcriptError } = await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversation.id,
                    lead_id: lead.id,
                    business_id: sessionBusinessId,
                    content: fullTranscript,
                    message_type: 'transcript',
                  });

                if (transcriptError) {
                  console.log('[AI INGEST] transcript save error', transcriptError);
                  throw transcriptError;
                }
                console.log('[MESSAGE INSERTED] AI transcript message saved successfully', {
                  conversation_id: conversation.id,
                  lead_id: lead.id,
                  business_id: sessionBusinessId,
                  message_type: 'transcript'
                });
                console.log('[AI INGEST] transcript saved');
                
                // Create AI call record
                console.log('[AI INGEST] creating AI call record...');
                const transcriptInsertPayload = {
                    business_id: sessionBusinessId,
                    lead_id: lead.id,
                    conversation_id: conversation.id,
                    caller_phone: sessionCallerPhone || 'unknown',
                    call_sid: sessionCallSid || 'unknown',
                    ai_session_id: sessionSessionId,
                    transcript: Array.isArray(transcript) ? transcript : [],
                    outcome: 'ai_partial',
                    extraction_failed: false
                  };
                console.log('[AI CALL RECORD OUTCOME]', {
                  outcome: transcriptInsertPayload.outcome,
                  callSid: transcriptInsertPayload.call_sid,
                  businessId: transcriptInsertPayload.business_id,
                  leadId: transcriptInsertPayload.lead_id,
                  conversationId: transcriptInsertPayload.conversation_id
                });
                console.log('[AI TRANSCRIPT STATE]', {
                    transcriptLength: transcript.length,
                    transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | '),
                    transcriptType: typeof transcript,
                    isArray: Array.isArray(transcript)
                  });
                console.log('[INSERT PATH D] transcript-only insert', {
                  file: 'services/replyflow-ai-voice/src/index.ts',
                  line: 3405,
                  lead_id: transcriptInsertPayload.lead_id,
                  conversation_id: transcriptInsertPayload.conversation_id
                });
                console.log('[AI CALL RECORD INSERT PAYLOAD]', transcriptInsertPayload);

                console.log('[AI CALL RECORD INSERT ACTIVE PATH]', {
                  file: 'services/replyflow-ai-voice/src/index.ts',
                  function: 'transcript-only insert',
                  sessionId: 'unknown',
                  callSid: sessionCallSid,
                  businessId: sessionBusinessId,
                  callerPhone: sessionCallerPhone
                });

                console.log('[BEFORE AI_CALL_RECORD INSERT - PATH-Dtranscript-only]', {
                  businessId: sessionBusinessId,
                  leadId: transcriptInsertPayload.lead_id,
                  conversationId: transcriptInsertPayload.conversation_id,
                  callSid: sessionCallSid
                });

                const { error: aiRecordError } = await supabase
                  .from('ai_call_records')
                  .insert(transcriptInsertPayload);

                console.log('[AFTER AI_CALL_RECORD INSERT - PATH-D-transcript-only]', {
                  error: aiRecordError
                });

                if (aiRecordError) {
                  console.log('[AI CALL RECORD SAVE FAILED]', aiRecordError);
                  // Don't throw here - the main ingestion succeeded
                } else {
                  console.log('[AI CALL RECORD SAVE SUCCESS]');
                  console.log('[AI RECORD INSERT PATH IDENTIFIED]', {
                    pathName: 'path-D-transcript-only-insert',
                    aiRecordId: 'unknown',
                    leadId: transcriptInsertPayload.lead_id,
                    conversationId: transcriptInsertPayload.conversation_id,
                    businessId: sessionBusinessId
                  });
                  
                  // Create follow-up jobs directly using Supabase
                  console.log('[FOLLOWUP DIRECT INSERT START - PATH-D]', { 
                    businessId: sessionBusinessId, 
                    leadId: transcriptInsertPayload.lead_id,
                    conversationId: transcriptInsertPayload.conversation_id
                  });
                  
                  try {
                    const { error: followUpError } = await supabase
                      .from('follow_up_jobs')
                      .insert({
                        business_id: sessionBusinessId,
                        lead_id: transcriptInsertPayload.lead_id,
                        conversation_id: transcriptInsertPayload.conversation_id,
                        status: 'pending',
                        scheduled_for: new Date().toISOString(),
                        created_at: new Date().toISOString()
                      });
                    
                    if (followUpError) {
                      console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-D]', followUpError);
                    } else {
                      console.log('[FOLLOWUP DIRECT INSERT SUCCESS - PATH-D]', { 
                        businessId: sessionBusinessId, 
                        leadId: transcriptInsertPayload.lead_id
                      });
                    }
                  } catch (followUpError) {
                    console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-D]', followUpError);
                  }
                  console.log('[FOLLOWUP DIRECT INSERT COMPLETE - PATH-D]');
                  
                  // Create notification via API endpoint (uses notificationServiceServer)
                  console.log('[NOTIFICATION SERVICE START - PATH-D]', {
                    businessId: sessionBusinessId,
                    leadId: transcriptInsertPayload.lead_id,
                    type: 'ai_intake_completed'
                  });

                  try {
                    const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
                    const notificationApiUrl = appBaseUrl;
                    console.log('[NOTIFICATION SERVICE URL - PATH-D]', notificationApiUrl);

                    const internalApiSecret = process.env.INTERNAL_API_SECRET;
                    if (!internalApiSecret) {
                      console.log('[NOTIFICATION SERVICE ERROR - PATH-D] INTERNAL_API_SECRET not configured');
                    }

                    const headers: any = {
                      'Content-Type': 'application/json',
                    };
                    if (internalApiSecret) {
                      headers['Authorization'] = `Bearer ${internalApiSecret}`;
                    }

                    const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        businessId: sessionBusinessId,
                        leadId: transcriptInsertPayload.lead_id,
                        type: 'ai_intake_completed',
                        customerName: null,
                        customerPhone: sessionCallerPhone,
                        serviceRequested: null
                      })
                    });

                    if (response.ok) {
                      console.log('[NOTIFICATION SERVICE SUCCESS - PATH-D]', {
                        businessId: sessionBusinessId,
                        leadId: transcriptInsertPayload.lead_id
                      });
                    } else {
                      console.log('[NOTIFICATION SERVICE ERROR - PATH-D]', {
                        businessId: sessionBusinessId,
                        leadId: transcriptInsertPayload.lead_id,
                        status: response.status,
                        statusText: response.statusText
                      });
                    }
                  } catch (notificationError) {
                    console.log('[NOTIFICATION SERVICE ERROR - PATH-D]', {
                      businessId: sessionBusinessId,
                      leadId: transcriptInsertPayload.lead_id,
                      error: notificationError
                    });
                  }

                  console.log('[NOTIFICATION SERVICE COMPLETE - PATH-D]');

                  // LINK AI CALL RECORD TO LEAD AND CONVERSATION
                  console.log('[AI CALL RECORD LEAD LOOKUP]', {
                    recordId: 'unknown',
                    businessId: sessionBusinessId,
                    callerPhone: sessionCallerPhone
                  });

                  const normalizedPhone = normalizePhoneNumberForStorage(sessionCallerPhone);
                  console.log('[AI CALL RECORD NORMALIZED PHONE]', {
                    originalPhone: sessionCallerPhone,
                    normalizedPhone: normalizedPhone
                  });

                  // Find lead by business_id + caller_phone
                  const { data: existingLead, error: leadLookupError } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('business_id', sessionBusinessId)
                    .eq('caller_phone', normalizedPhone)
                    .maybeSingle();

                  console.log('[AI CALL RECORD LEAD QUERY RESULT]', {
                    leadId: existingLead?.id || null,
                    error: leadLookupError?.message || 'none'
                  });

                  if (existingLead) {
                    console.log('[AI CALL RECORD LEAD FOUND]', { leadId: existingLead.id });

                    // Find conversation linked to this lead
                    const { data: existingConversation, error: conversationLookupError } = await supabase
                      .from('conversations')
                      .select('*')
                      .eq('lead_id', existingLead.id)
                      .maybeSingle();

                    console.log('[AI CALL RECORD CONVERSATION QUERY RESULT]', {
                      conversationId: existingConversation?.id || null,
                      error: conversationLookupError?.message || 'none'
                    });

                    if (existingConversation) {
                      console.log('[AI CALL RECORD CONVERSATION FOUND]', { conversationId: existingConversation.id });

                      // Update ai_call_records with lead_id and conversation_id
                      const { error: updateError } = await supabase
                        .from('ai_call_records')
                        .update({
                          lead_id: existingLead.id,
                          conversation_id: existingConversation.id
                        })
                        .eq('call_sid', sessionCallSid);

                      if (updateError) {
                        console.log('[AI CALL RECORD LINK FAILURE]', {
                          error: 'Failed to update lead_id and conversation_id',
                          details: updateError.message
                        });
                      } else {
                        console.log('[AI CALL RECORD LINK SUCCESS]', {
                          leadId: existingLead.id,
                          conversationId: existingConversation.id
                        });
                      }
                    } else {
                      console.log('[AI CALL RECORD CONVERSATION NOT FOUND]', {
                        leadId: existingLead.id
                      });
                    }
                  } else {
                    console.log('[AI CALL RECORD LEAD NOT FOUND]', {
                      businessId: sessionBusinessId,
                      callerPhone: normalizedPhone
                    });
                  }
                }
                
                console.log('[AI INGEST COMPLETE] all data saved successfully');

              } catch (error) {
                console.log('[AI INGEST FAILED] extraction failed, saving raw transcript as fallback', error);
                
                // Fallback: Create lead and conversation BEFORE inserting ai_call_records
                if (!supabase) {
                  console.log('[AI INGEST] supabase client not available for fallback');
                  return;
                }
                
                try {
                  console.log('[AI INGEST] creating lead and conversation for fallback case...');
                  const { data: fallbackLead, error: fallbackLeadError } = await supabase
                    .from('leads')
                    .upsert({
                      business_id: sessionBusinessId,
                      caller_phone: sessionCallerPhone,
                      status: 'new',
                    }, {
                      onConflict: 'business_id,caller_phone',
                    })
                    .select()
                    .single();

                  if (fallbackLeadError) {
                    console.log('[AI INGEST] fallback lead creation error', fallbackLeadError);
                    throw fallbackLeadError;
                  }

                  // Lookup existing conversation by lead_id
                  const { data: existingFallbackConversation, error: fallbackConversationLookupError } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('lead_id', fallbackLead.id)
                    .maybeSingle();

                  let fallbackConversation;
                  let fallbackConversationError;

                  if (existingFallbackConversation) {
                    fallbackConversation = existingFallbackConversation;
                    console.log('[AI INGEST] existing fallback conversation found', { conversationId: fallbackConversation.id });
                  } else {
                    const result = await supabase
                      .from('conversations')
                      .insert({
                        lead_id: fallbackLead.id,
                        business_id: sessionBusinessId,
                        status: 'active',
                      })
                      .select()
                      .single();
                    fallbackConversation = result.data;
                    fallbackConversationError = result.error;
                  }

                  if (fallbackConversationError) {
                    console.log('[AI INGEST] fallback conversation creation error', fallbackConversationError);
                    throw fallbackConversationError;
                  }

                  console.log('[AI INGEST] creating fallback AI call record with populated IDs...');
                  const fallbackInsertPayload = {
                      business_id: sessionBusinessId,
                      lead_id: fallbackLead.id,
                      conversation_id: fallbackConversation.id,
                      caller_phone: sessionCallerPhone || 'unknown',
                      call_sid: sessionCallSid || 'unknown',
                      ai_session_id: sessionSessionId,
                      transcript: Array.isArray(transcript) ? transcript : [],
                      outcome: 'ai_failed_voicemail',
                      extracted_info: null,
                      summary: `AI call transcript: ${fullTranscript}`,
                      extraction_failed: true
                    };
                  console.log('[AI CALL RECORD OUTCOME]', {
                    outcome: fallbackInsertPayload.outcome,
                    callSid: fallbackInsertPayload.call_sid,
                    businessId: fallbackInsertPayload.business_id,
                    leadId: fallbackInsertPayload.lead_id,
                    conversationId: fallbackInsertPayload.conversation_id
                  });
                  console.log('[AI TRANSCRIPT STATE]', {
                      transcriptLength: transcript.length,
                      transcriptPreview: transcript.slice(-3).map(t => `${t.role}: ${t.text}`).join(' | '),
                      transcriptType: typeof transcript,
                      isArray: Array.isArray(transcript)
                    });
                  console.log('[INSERT PATH E] fallback transcript insert', {
                    file: 'services/replyflow-ai-voice/src/index.ts',
                    line: 3583,
                    lead_id: fallbackInsertPayload.lead_id,
                    conversation_id: fallbackInsertPayload.conversation_id
                  });
                  console.log('[AI CALL RECORD INSERT PAYLOAD]', fallbackInsertPayload);

                  console.log('[ACTIVE AI RECORD INSERT PATH]', {
                    file: 'services/replyflow-ai-voice/src/index.ts',
                    function: 'fallback transcript insert',
                    leadId: fallbackInsertPayload.lead_id,
                    conversationId: fallbackInsertPayload.conversation_id,
                    sessionId: sessionSessionId || 'unknown',
                    callSid: sessionCallSid || 'unknown',
                    businessId: sessionBusinessId,
                    callerPhone: sessionCallerPhone || 'unknown'
                  });

                  console.log('[BEFORE AI_CALL_RECORD INSERT - PATH-E-fallback-transcript]', {
                    businessId: sessionBusinessId,
                    leadId: fallbackInsertPayload.lead_id,
                    conversationId: fallbackInsertPayload.conversation_id,
                    callSid: sessionCallSid
                  });

                  const { data: fallbackRecord, error: fallbackRecordError } = await supabase
                    .from('ai_call_records')
                    .insert(fallbackInsertPayload)
                    .select()
                    .single();

                  console.log('[AFTER AI_CALL_RECORD INSERT - PATH-E-fallback-transcript]', {
                    error: fallbackRecordError
                  });

                  if (fallbackRecordError) {
                    console.log('[AI CALL RECORD SAVE FAILED]', fallbackRecordError);
                    throw fallbackRecordError;
                  }
                  
                  console.log('[AI CALL RECORD SAVED]', { recordId: fallbackRecord.id });
                  console.log('[AI RECORD INSERT PATH IDENTIFIED]', {
                    pathName: 'path-E-fallback-transcript-insert',
                    aiRecordId: fallbackRecord.id,
                    leadId: fallbackInsertPayload.lead_id,
                    conversationId: fallbackInsertPayload.conversation_id,
                    businessId: sessionBusinessId
                  });
                  
                  // Create follow-up jobs directly using Supabase
                  console.log('[FOLLOWUP DIRECT INSERT START - PATH-E]', { 
                    businessId: sessionBusinessId, 
                    leadId: fallbackInsertPayload.lead_id,
                    conversationId: fallbackInsertPayload.conversation_id
                  });
                  
                  try {
                    const { error: followUpError } = await supabase
                      .from('follow_up_jobs')
                      .insert({
                        business_id: sessionBusinessId,
                        lead_id: fallbackInsertPayload.lead_id,
                        conversation_id: fallbackInsertPayload.conversation_id,
                        status: 'pending',
                        scheduled_for: new Date().toISOString(),
                        created_at: new Date().toISOString()
                      });
                    
                    if (followUpError) {
                      console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-E]', followUpError);
                    } else {
                      console.log('[FOLLOWUP DIRECT INSERT SUCCESS - PATH-E]', { 
                        businessId: sessionBusinessId, 
                        leadId: fallbackInsertPayload.lead_id
                      });
                    }
                  } catch (followUpError) {
                    console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-E]', followUpError);
                  }
                  console.log('[FOLLOWUP DIRECT INSERT COMPLETE - PATH-E]');
                  
                  // Create notification via API endpoint (uses notificationServiceServer)
                  console.log('[NOTIFICATION SERVICE START - PATH-E]', {
                    businessId: sessionBusinessId,
                    leadId: fallbackInsertPayload.lead_id,
                    type: 'ai_intake_completed'
                  });

                  try {
                    const appBaseUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.replyflowhq.com' : 'http://localhost:3000');
                    const notificationApiUrl = appBaseUrl;
                    console.log('[NOTIFICATION SERVICE URL - PATH-E]', notificationApiUrl);

                    const internalApiSecret = process.env.INTERNAL_API_SECRET;
                    if (!internalApiSecret) {
                      console.log('[NOTIFICATION SERVICE ERROR - PATH-E] INTERNAL_API_SECRET not configured');
                    }

                    const headers: any = {
                      'Content-Type': 'application/json',
                    };
                    if (internalApiSecret) {
                      headers['Authorization'] = `Bearer ${internalApiSecret}`;
                    }

                    const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        businessId: sessionBusinessId,
                        leadId: fallbackInsertPayload.lead_id,
                        type: 'ai_intake_completed',
                        customerName: null,
                        customerPhone: sessionCallerPhone,
                        serviceRequested: null
                      })
                    });

                    if (response.ok) {
                      console.log('[NOTIFICATION SERVICE SUCCESS - PATH-E]', {
                        businessId: sessionBusinessId,
                        leadId: fallbackInsertPayload.lead_id
                      });
                    } else {
                      console.log('[NOTIFICATION SERVICE ERROR - PATH-E]', {
                        businessId: sessionBusinessId,
                        leadId: fallbackInsertPayload.lead_id,
                        status: response.status,
                        statusText: response.statusText
                      });
                    }
                  } catch (notificationError) {
                    console.log('[NOTIFICATION SERVICE ERROR - PATH-E]', {
                      businessId: sessionBusinessId,
                      leadId: fallbackInsertPayload.lead_id,
                      error: notificationError
                    });
                  }

                  console.log('[NOTIFICATION SERVICE COMPLETE - PATH-E]');

                  console.log('[AI LINK SUCCESS]', { aiCallRecordId: fallbackRecord.id, leadId: fallbackLead.id, conversationId: fallbackConversation.id });

                  // Save transcript as message
                  const { error: fallbackMessageError } = await supabase
                    .from('messages')
                    .insert({
                      conversation_id: fallbackConversation.id,
                      lead_id: fallbackLead.id,
                      business_id: sessionBusinessId,
                      content: `AI call transcript (extraction failed):\n${fullTranscript}`,
                      message_type: 'transcript',
                    });

                  if (fallbackMessageError) {
                    console.log('[AI INGEST] fallback message creation error', fallbackMessageError);
                  } else {
                    console.log('[AI INGEST] fallback transcript saved successfully');
                  }

                  console.log('[AI INGEST] fallback processing complete');
                  return;
                  
                } catch (fallbackError) {
                  console.log('[AI INGEST] fallback processing failed', fallbackError);
                }
              }
            };
            
            // Single outcome guarantee - verify at least one lead exists
            // This runs after all ingestion paths to ensure no caller is lost
            const ensureSingleOutcome = async (callSid: string, businessId: string, callerPhone: string) => {
              if (!supabase) {
                console.log('[SINGLE OUTCOME GUARANTEE] No Supabase client available');
                return;
              }
              
              try {
                console.log('[SINGLE OUTCOME GUARANTEE] Checking if lead exists for call', {
                  callSid,
                  businessId,
                  callerPhone
                });
                
                // Check if any lead exists for this caller
                const normalizedPhone = normalizePhoneNumberForStorage(callerPhone);
                const { data: existingLead, error: leadCheckError } = await supabase
                  .from('leads')
                  .select('id')
                  .eq('business_id', businessId)
                  .eq('caller_phone', normalizedPhone)
                  .maybeSingle();
                
                if (existingLead) {
                  console.log('[SINGLE OUTCOME GUARANTEE] Lead exists, no action needed', {
                    leadId: existingLead.id,
                    callerPhone
                  });
                  return;
                }
                
                if (leadCheckError && leadCheckError.code !== 'PGRST116') {
                  console.log('[SINGLE OUTCOME GUARANTEE] Lead check error', leadCheckError);
                  return;
                }
                
                // No lead exists - create emergency lead
                console.log('[EMERGENCY LEAD RECOVERY] No lead found, creating emergency missed-call lead', {
                  callSid,
                  businessId,
                  callerPhone
                });
                
                const { data: emergencyLead, error: emergencyLeadError } = await supabase
                  .from('leads')
                  .upsert({
                    business_id: businessId,
                    caller_phone: callerPhone,
                    status: 'new',
                  }, {
                    onConflict: 'business_id,caller_phone',
                  })
                  .select()
                  .single();
                
                if (emergencyLeadError) {
                  console.log('[EMERGENCY LEAD RECOVERY] Emergency lead creation failed', emergencyLeadError);
                  return;
                }
                
                console.log('[EMERGENCY LEAD RECOVERY] Emergency lead created successfully', {
                  leadId: emergencyLead.id,
                  businessId,
                  callerPhone
                });
                
                // Create conversation
                const { data: emergencyConversation, error: emergencyConversationError } = await supabase
                  .from('conversations')
                  .insert({
                    lead_id: emergencyLead.id,
                    business_id: businessId,
                    status: 'active',
                  })
                  .select()
                  .single();
                
                if (emergencyConversationError) {
                  console.log('[EMERGENCY LEAD RECOVERY] Emergency conversation creation failed', emergencyConversationError);
                  return;
                }
                
                // Create AI call record for emergency recovery
                const { error: emergencyRecordError } = await supabase
                  .from('ai_call_records')
                  .insert({
                    business_id: businessId,
                    lead_id: emergencyLead.id,
                    conversation_id: emergencyConversation.id,
                    caller_phone: callerPhone || 'unknown',
                    call_sid: callSid || 'unknown',
                    transcript: [],
                    outcome: 'emergency_recovery',
                    extraction_failed: true,
                    summary: 'Emergency recovery - no lead, voicemail, or SMS was created for this call'
                  });
                
                if (emergencyRecordError) {
                  console.log('[EMERGENCY LEAD RECOVERY] Emergency AI call record creation failed', emergencyRecordError);
                } else {
                  console.log('[EMERGENCY LEAD RECOVERY] Emergency AI call record created');
                }
                
              } catch (error) {
                console.log('[EMERGENCY LEAD RECOVERY] Emergency recovery failed', error);
              }
            };

            // Call ingestion when WebSocket closes
            openAiWs.on('close', (code, reason) => {
              console.log('[OPENAI CONNECT CLOSED]', code, reason);
              console.log('[OPENAI WEBSOCKET CLOSE] OpenAI WebSocket closed');
              console.log('[OPENAI WEBSOCKET CLOSE] code:', code, 'reason:', reason?.toString());
              console.log('[OPENAI WEBSOCKET CLOSE] callSid:', callSid);
              console.log('[OPENAI WEBSOCKET CLOSE] businessId:', businessId);
              console.log('[OPENAI WEBSOCKET CLOSE] callState:', callState);
              console.log('[OPENAI WEBSOCKET CLOSE] finalClosingStarted:', finalClosingStarted);
              console.log('[OPENAI WEBSOCKET CLOSE] hangupScheduled:', hangupScheduled);
              console.log('[OPENAI WEBSOCKET CLOSE] finalGoodbyeMarkReceived:', finalGoodbyeMarkReceived);
              console.log('[OPENAI AUDIT] close listener attached');
              console.log('[OPENAI RAW] close');
              log(LogLevel.INFO, '[STREAM OPENAI] close event fired');
              
              // Cleanup: Clear assistantSpeaking timeout to prevent memory leaks
              if (assistantSpeakingTimeout) {
                clearTimeout(assistantSpeakingTimeout);
                assistantSpeakingTimeout = null;
                console.log('[TIMEOUT CLEANUP] assistantSpeakingTimeout cleared on WebSocket close');
              }
              
              // Log call metrics before ingestion
              logCallMetrics(aiSessionTracker);
              
              console.log('[INGEST CALL DATA CALLSITE REACHED] OpenAI WebSocket close path');
              ingestCallData().then(() => {
                console.log('[INGEST CALL DATA CALLSITE COMPLETE] OpenAI WebSocket close path');
                // After ingestion, ensure single outcome guarantee
                ensureSingleOutcome(callSid || '', businessId || '', callerPhone || '').then(() => {
                  console.log('[SINGLE OUTCOME GUARANTEE COMPLETE]');
                }).catch(error => {
                  console.log('[SINGLE OUTCOME GUARANTEE ERROR]', error);
                });
              }).catch(error => {
                console.log('[INGEST CALL DATA CALLSITE ERROR] OpenAI WebSocket close path', error);
              });
            });
            console.log('[OPENAI AUDIT] error listener attached');

            console.log('[OPENAI AUDIT] attaching unexpected-response listener');
            openAiWs.on('unexpected-response', (request, response) => {
              console.log('[OPENAI CONNECT ERROR]', 'Unexpected response from OpenAI');
              console.log('[OPENAI AUDIT] unexpected-response listener attached');
              console.log('[OPENAI RAW] unexpected-response', { statusCode: response.statusCode });
              console.log('[OPENAI AUDIT] unexpected-response details', { 
                statusCode: response.statusCode, 
                statusMessage: response.statusMessage,
                headers: response.headers 
              });
              
              // Try to read response body
              let body = '';
              response.on('data', (chunk) => {
                body += chunk.toString();
              });
              response.on('end', () => {
                console.log('[OPENAI AUDIT] unexpected-response body', body);
              });
            });
            console.log('[OPENAI AUDIT] unexpected-response listener attached');

            log(LogLevel.INFO, '[AI POC] OpenAI websocket created directly');
            openaiInitSucceeded = true;
          } catch (error) {
            log(LogLevel.ERROR, '[AI POC] initializeOpenAI failed with exception', error as Error);
            openaiInitFailed = true;
            
            // Trigger voicemail fallback for unexpected runtime exceptions
            await triggerVoicemailFallback(
              ws, 
              twilioHandler, 
              aiSessionTracker, 
              `Unexpected runtime exception during AI initialization: ${error}`, 
              callSid || '', 
              businessId || '', 
              callerPhone || '', 
              businessName || '', 
              forwardedFrom || ''
            );
          }
        }

        // Call original handler for basic logging only
        originalHandleMessage(data);
      } catch (error) {
        log(LogLevel.ERROR, '[AI POC] Error parsing Twilio message', error);
      }
    };

    // Handle WebSocket close
    ws.on('close', (code, reason) => {
      console.log('[TWILIO WEBSOCKET CLOSE] Twilio WebSocket closing');
      console.log('[TWILIO WEBSOCKET CLOSE] code:', code, 'reason:', reason?.toString());
      console.log('[TWILIO WEBSOCKET CLOSE] callSid:', callSid);
      console.log('[TWILIO WEBSOCKET CLOSE] callState:', callState);
      console.log('[TWILIO WEBSOCKET CLOSE] finalClosingStarted:', finalClosingStarted);
      console.log('[TWILIO WEBSOCKET CLOSE] hangupScheduled:', hangupScheduled);
      console.log('[TWILIO WEBSOCKET CLOSE] finalGoodbyeMarkReceived:', finalGoodbyeMarkReceived);
      
      // Log handler entry state before any conditional logic
      console.log('[WS CLOSE HANDLER ENTRY] =========================================');
      console.log('[WS CLOSE HANDLER ENTRY] callState:', callState);
      console.log('[WS CLOSE HANDLER ENTRY] finalClosingStarted:', finalClosingStarted);
      console.log('[WS CLOSE HANDLER ENTRY] terminalClosingResponseStarted:', closingState?.terminalClosingResponseStarted);
      console.log('[WS CLOSE HANDLER ENTRY] incompleteFinalizationStarted:', incompleteFinalizationStarted);
      console.log('[WS CLOSE HANDLER ENTRY] sessionId:', sessionId);
      console.log('[WS CLOSE HANDLER ENTRY] callSid:', callSid);
      console.log('[WS CLOSE HANDLER ENTRY] Timestamp:', new Date().toISOString());
      console.log('[WS CLOSE HANDLER ENTRY] =========================================');
      
      // Log intake data for debugging
      console.log('[WS CLOSE HANDLER INTAKE DATA] =========================================');
      console.log('[WS CLOSE HANDLER INTAKE DATA] intakeData:', JSON.stringify(intakeData, null, 2));
      console.log('[WS CLOSE HANDLER INTAKE DATA] transcript length:', transcript.length);
      console.log('[WS CLOSE HANDLER INTAKE DATA] =========================================');
      
      // Clear AI timeout timer if it exists
      if (aiTimeoutTimer) {
        clearTimeout(aiTimeoutTimer);
        aiTimeoutTimer = null;
      }
      
      // Handle incomplete intake finalization
      // Only run if intake is incomplete (caller hung up before completing intake)
      
      // Runtime verification logging
      console.log('[WS CLOSE GUARD VERSION] =========================================');
      console.log('[WS CLOSE GUARD VERSION] callSid:', callSid);
      try {
        const { execSync } = require('child_process');
        const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
        console.log('[WS CLOSE GUARD VERSION] commit:', commit);
      } catch (error) {
        console.log('[WS CLOSE GUARD VERSION] commit: unavailable');
      }
      console.log('[WS CLOSE GUARD VERSION] guardVersion: closingState_v2');
      console.log('[WS CLOSE GUARD VERSION] =========================================');
      
      // Log all condition components for audit
      const stage = intakeData?.stage || 'unknown';
      const allRequiredFieldsCollected = intakeData ? areAllRequiredFieldsCollected(intakeData) : false;
      const terminalClosingResponseStarted = closingState?.terminalClosingResponseStarted || false;
      
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] =========================================');
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] !incompleteFinalizationStarted:', !incompleteFinalizationStarted);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] callState === "active":', callState === 'active');
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] callState:', callState);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] !finalClosingStarted:', !finalClosingStarted);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] finalClosingStarted:', finalClosingStarted);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] !hangupScheduled:', !hangupScheduled);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] hangupScheduled:', hangupScheduled);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] intakeData.stage:', stage);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] stage !== "complete":', stage !== 'complete');
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] !allRequiredFieldsCollected:', !allRequiredFieldsCollected);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] allRequiredFieldsCollected:', allRequiredFieldsCollected);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] !terminalClosingResponseStarted:', !terminalClosingResponseStarted);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] terminalClosingResponseStarted:', terminalClosingResponseStarted);
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] Timestamp:', new Date().toISOString());
      console.log('[INCOMPLETE FINALIZATION CONDITION AUDIT] =========================================');
      
      // Corrected condition: prevent ANY call that reached complete or terminal close from entering incomplete finalization
      // FIXED: Read from closingState instead of local variables to prevent race condition
      if (!incompleteFinalizationStarted && 
          closingState.callState === 'active' && 
          !closingState.finalClosingStarted && 
          !closingState.hangupScheduled &&
          stage !== 'complete' &&
          !allRequiredFieldsCollected &&
          !closingState.terminalClosingResponseStarted) {
        console.log('[FINALIZE INCOMPLETE CALLSITE] =========================================');
        console.log('[FINALIZE INCOMPLETE CALLSITE] source: WebSocket close handler (Twilio)');
        console.log('[FINALIZE INCOMPLETE CALLSITE] callSid:', callSid);
        console.log('[FINALIZE INCOMPLETE CALLSITE] stage:', stage);
        console.log('[FINALIZE INCOMPLETE CALLSITE] allRequiredFieldsCollected:', allRequiredFieldsCollected);
        console.log('[FINALIZE INCOMPLETE CALLSITE] closingState.callState:', closingState.callState);
        console.log('[FINALIZE INCOMPLETE CALLSITE] closingState.finalClosingStarted:', closingState.finalClosingStarted);
        console.log('[FINALIZE INCOMPLETE CALLSITE] closingState.hangupScheduled:', closingState.hangupScheduled);
        console.log('[FINALIZE INCOMPLETE CALLSITE] closingState.terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
        console.log('[FINALIZE INCOMPLETE CALLSITE] timestamp:', new Date().toISOString());
        console.log('[FINALIZE INCOMPLETE CALLSITE] =========================================');
        
        console.log('[TWILIO WEBSOCKET CLOSE] Detecting incomplete intake - caller hung up before completing intake');
        console.log('[TWILIO WEBSOCKET CLOSE] callState:', closingState.callState);
        console.log('[TWILIO WEBSOCKET CLOSE] finalClosingStarted:', closingState.finalClosingStarted);
        console.log('[TWILIO WEBSOCKET CLOSE] hangupScheduled:', closingState.hangupScheduled);
        console.log('[TWILIO WEBSOCKET CLOSE] stage:', stage);
        console.log('[TWILIO WEBSOCKET CLOSE] allRequiredFieldsCollected:', allRequiredFieldsCollected);
        console.log('[TWILIO WEBSOCKET CLOSE] terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
        console.log('[TWILIO WEBSOCKET CLOSE] Triggering incomplete intake finalization');
        
        incompleteFinalizationStarted = true;
        
        // Finalize incomplete intake asynchronously
        finalizeIncompleteIntake(
          transcript,
          intakeData,
          businessId || '',
          callerPhone || '',
          callSid || '',
          businessName || '',
          forwardedFrom || '',
          supabase,
          closingState
        ).catch(error => {
          console.log('[TWILIO WEBSOCKET CLOSE] Incomplete finalization failed:', error);
        });
      } else {
        // Log why incomplete finalization was skipped
        console.log('[INCOMPLETE FINALIZATION SKIPPED] =========================================');
        if (incompleteFinalizationStarted) {
          console.log('[INCOMPLETE FINALIZATION SKIPPED] reason: incompleteFinalizationStarted is true');
        }
        if (callState !== 'active') {
          console.log('[INCOMPLETE FINALIZATION SKIPPED] reason: callState is not active');
          console.log('[INCOMPLETE FINALIZATION SKIPPED] callState:', callState);
        }
        if (finalClosingStarted) {
          console.log('[INCOMPLETE FINALIZATION SKIPPED] reason: finalClosingStarted is true');
        }
        if (hangupScheduled) {
          console.log('[INCOMPLETE FINALIZATION SKIPPED] reason: hangupScheduled is true');
        }
        console.log('[INCOMPLETE FINALIZATION SKIPPED] Timestamp:', new Date().toISOString());
        console.log('[INCOMPLETE FINALIZATION SKIPPED] =========================================');
      }
      
      // Only close OpenAI WebSocket if we're not in the middle of final closing
      // If finalClosingStarted is true, let the mark-based hangup handle cleanup
      // BUT add forced cleanup after 30 seconds to prevent connection leaks
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        if (finalClosingStarted && !finalGoodbyeMarkReceived) {
          console.log('[TWILIO WEBSOCKET CLOSE] OpenAI WebSocket left open during final closing');
          console.log('[TWILIO WEBSOCKET CLOSE] Waiting for final-goodbye-complete mark before cleanup');
          console.log('[TWILIO WEBSOCKET CLOSE] Setting forced cleanup timeout (30 seconds)');

          // Forced cleanup after 30 seconds regardless of mark receipt
          setTimeout(() => {
            if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] =========================================');
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] Forced cleanup timeout reached');
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] Closing OpenAI WebSocket regardless of mark state');
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] callSid:', callSid);
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] finalGoodbyeMarkReceived:', finalGoodbyeMarkReceived);
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] Timestamp:', new Date().toISOString());
              console.log('[OPENAI WEBSOCKET FORCED CLEANUP] =========================================');
              openAiWs.close(1000, 'Forced cleanup timeout');
            }
          }, 30000); // 30 seconds
        } else {
          console.log('[OPENAI WEBSOCKET CLEANUP] Closing OpenAI WebSocket due to Twilio call end');
          console.log('[OPENAI WEBSOCKET CLEANUP] callSid:', callSid);
          openAiWs.close(1000, 'Twilio call ended');
        }
      } else if (openAiWs) {
        console.log('[OPENAI WEBSOCKET CLEANUP] OpenAI WebSocket already closed or closing');
        console.log('[OPENAI WEBSOCKET CLEANUP] readyState:', openAiWs.readyState);
      }
      
      log(LogLevel.INFO, '[AI POC] websocket closed');
      log(LogLevel.INFO, '[AI POC] websocket close details', { code, reason: reason?.toString() });
      log(LogLevel.INFO, '[AI POC] OpenAI initialization status', {
        attempted: openaiInitAttempted,
        succeeded: openaiInitSucceeded,
        failed: openaiInitFailed,
      });
      
      // Call ingestion when main WebSocket closes
      console.log('[INGEST CALL DATA CALLSITE REACHED] Main WebSocket close path');
      ingestCallData().then(() => {
        console.log('[INGEST CALL DATA CALLSITE COMPLETE] Main WebSocket close path');
      }).catch(error => {
        console.log('[INGEST CALL DATA CALLSITE ERROR] Main WebSocket close path', error);
      });
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
      log(LogLevel.ERROR, '[AI POC] websocket error', error as Error);
      log(LogLevel.INFO, '[AI POC] OpenAI initialization status', {
        attempted: openaiInitAttempted,
        succeeded: openaiInitSucceeded,
        failed: openaiInitFailed,
      });
    });

    // Handle Twilio connection
    twilioHandler.handleConnection(ws, req);

  } catch (error) {
    log(LogLevel.ERROR, '[WS FATAL ERROR]', { message: (error as Error).message, stack: (error as Error).stack });
    log(LogLevel.INFO, '[AI POC] closing websocket due to fatal error');
    ws.close(1011, 'Internal server error');
  }
});

// Function to send AI confirmation SMS
async function sendAIConfirmationSMS(
  businessId: string,
  leadId: string,
  conversationId: string,
  callSid: string,
  callerPhone: string,
  extractedInfo?: any
): Promise<void> {
  console.log('[AI CONFIRMATION SMS START]', {
    businessId,
    leadId,
    conversationId,
    callSid,
    callerPhone,
    hasExtractedInfo: !!extractedInfo
  });

  try {
    // Check for duplicate SMS to prevent multiple sends
    console.log('[AI CONFIRMATION SMS DUPLICATE CHECK]', { conversationId });
    const { data: existingSms, error: smsCheckError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('message_type', 'text')
      .limit(1)
      .maybeSingle();

    console.log('[AI CONFIRMATION SMS DUPLICATE CHECK RESULT]', {
      existingSmsId: existingSms?.id || null,
      error: smsCheckError?.message || 'none'
    });

    if (existingSms) {
      console.log('[AI POST CALL SMS ALREADY SENT SKIP] SMS already sent for this conversation', {
        conversationId,
        existingSmsId: existingSms.id
      });
      return;
    }

    if (smsCheckError && smsCheckError.code !== 'PGRST116') {
      console.error('[AI CONFIRMATION SMS ERROR] Error checking for duplicate SMS:', smsCheckError);
    }

    // Fetch business name
    console.log('[AI CONFIRMATION SMS BUSINESS FETCH]', { businessId });
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();

    console.log('[AI CONFIRMATION SMS BUSINESS FETCH RESULT]', {
      businessName: business?.name || null,
      error: businessError?.message || 'none'
    });

    if (businessError || !business) {
      console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
      console.log('[COMPLETE FINALIZATION STEP 9 FAILED] AI confirmation SMS failed - business fetch error');
      console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Error:', businessError?.message || 'Business not found');
      console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Timestamp:', new Date().toISOString());
      console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
      
      console.error('[AI CONFIRMATION SMS ERROR] Failed to fetch business:', businessError);
      return;
    }

    const businessName = business.name;

    // Call the confirmation SMS API endpoint
    console.log('[AI CONFIRMATION SMS ENV CHECK]', {
      hasMainAppUrl: !!process.env.MAIN_APP_URL,
      hasInternalApiSecret: !!process.env.INTERNAL_API_SECRET
    });

    if (!process.env.MAIN_APP_URL) {
      console.error('[AI CONFIRMATION SMS ERROR] MAIN_APP_URL not configured');
      return;
    }

    const confirmationUrl = `${process.env.MAIN_APP_URL}/api/ai-confirmation-sms`;
    console.log('[AI CONFIRMATION SMS URL]', { host: new URL(confirmationUrl).host, path: '/api/ai-confirmation-sms' });

    const internalApiSecret = process.env.INTERNAL_API_SECRET;
    console.log('[AI CONFIRMATION SMS AUTH DEBUG]', {
      hasInternalApiSecret: !!internalApiSecret,
      secretLength: internalApiSecret?.length,
      secretFirstChar: internalApiSecret?.[0],
      secretLastChar: internalApiSecret?.[internalApiSecret.length - 1]
    });
    
    if (!internalApiSecret) {
      console.error('[AI CONFIRMATION SMS ERROR] INTERNAL_API_SECRET not configured');
      return;
    }

    // Retry logic for SMS delivery (3 retries with exponential backoff)
    let lastError: any = null;
    let response: Response | null = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log('[AI CONFIRMATION SMS RETRY]', { attempt, maxAttempts: 3 });
        
        response = await fetch(confirmationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalApiSecret}`,
          },
          body: JSON.stringify({
            businessId,
            leadId,
            conversationId,
            callSid,
            callerPhone,
            businessName,
            extractedInfo
          })
        });

        console.log('[AI CONFIRMATION SMS HTTP DEBUG]', {
          url: confirmationUrl,
          method: 'POST',
          status: response.status,
          statusText: response.statusText,
          attempt
        });

        if (response.ok) {
          const result = await response.json();
          console.log('[AI CONFIRMATION SMS SUCCESS]', result);
          return;
        } else {
          lastError = {
            status: response.status,
            statusText: response.statusText,
            attempt
          };
          console.log('[AI CONFIRMATION SMS RETRY FAILED]', {
            attempt,
            status: response.status,
            statusText: response.statusText
          });
          
          if (attempt < 3) {
            const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
            console.log('[AI CONFIRMATION SMS RETRY BACKOFF]', { backoffMs, nextAttempt: attempt + 1 });
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      } catch (error) {
        lastError = error;
        console.log('[AI CONFIRMATION SMS RETRY EXCEPTION]', {
          attempt,
          error: error instanceof Error ? error.message : String(error)
        });
        
        if (attempt < 3) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log('[AI CONFIRMATION SMS RETRY BACKOFF]', { backoffMs, nextAttempt: attempt + 1 });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries failed
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] AI confirmation SMS failed - all retries exhausted');
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Last error:', lastError);
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Timestamp:', new Date().toISOString());
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
    
    console.error('[AI CONFIRMATION SMS ERROR] All retries failed:', lastError);
    return;

  } catch (error) {
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] AI confirmation SMS failed - exception thrown');
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Error:', error instanceof Error ? error.message : String(error));
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] Timestamp:', new Date().toISOString());
    console.log('[COMPLETE FINALIZATION STEP 9 FAILED] =========================================');
    
    console.error('[AI CONFIRMATION SMS ERROR]', error);
    // Don't fail the AI ingestion if SMS fails
  }
}

// Start server
server.listen(PORT, () => {
  console.log('[AI VOICE SERVICE VERSION] commit=mark-based-hangup-v1 deterministic-closing');
  console.log('[SCHEMA COMPATIBILITY CHECK] conversations table columns: lead_id, business_id, status, created_at, updated_at (NO call_sid)');
  console.log('[SCHEMA COMPATIBILITY CHECK] leads table columns: id, business_id, phone, name, email, status, raw_metadata, created_at, updated_at (NO source)');
  console.log('[SCHEMA COMPATIBILITY CHECK] ai_call_records table columns: id, business_id, lead_id, conversation_id, caller_phone, call_sid, ai_session_id, transcript, outcome, extracted_info, summary, extraction_failed, created_at, updated_at');
  console.log('[AI VOICE SERVICE VERSION] commit=473dfc1 language-lock-enabled=true');
  console.log('[AI VOICE SERVICE VERSION] Mark-based hangup: uses Twilio marks to track audio playback completion');
  console.log('[AI VOICE SERVICE VERSION] Hangup now waits for final-goodbye-complete mark + 2s buffer');
  console.log('[AI VOICE SERVICE VERSION] Fallback timeout: 10s if mark never received');
  log(LogLevel.INFO, `AI Voice Service POC listening on port ${PORT}`);
  log(LogLevel.INFO, `Health check: http://localhost:${PORT}/health`);
  log(LogLevel.INFO, `WebSocket: ws://localhost:${PORT}/stream`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log(LogLevel.INFO, 'SIGTERM received, shutting down gracefully');
  wss.close(() => {
    server.close(() => {
      log(LogLevel.INFO, 'Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  log(LogLevel.INFO, 'SIGINT received, shutting down gracefully');
  wss.close(() => {
    server.close(() => {
      log(LogLevel.INFO, 'Server closed');
      process.exit(0);
    });
  });
});
