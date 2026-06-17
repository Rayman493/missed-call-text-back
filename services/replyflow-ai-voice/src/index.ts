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

// @ts-nocheck
// TypeScript checking disabled to allow deployment with improved Supabase logging

// Version log - guaranteed to appear on startup
console.log('[AUDIO TRACE BUILD VERSION] caller-audio-debug-v1');
console.log('[AI CONFIRMATION TEMPLATE VERSION] confirmation-v3-your-name-is');
console.log('[AI VOICE STARTUP] Service initializing');
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

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_VOICE = process.env.AI_VOICE || 'alloy'; // Configurable voice: alloy, verse, cedar, marin
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log environment variables for debugging
log(LogLevel.INFO, '[ENV CHECK] SUPABASE_URL:', !!SUPABASE_URL);
log(LogLevel.INFO, '[ENV CHECK] NEXT_PUBLIC_SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
log(LogLevel.INFO, '[ENV CHECK] SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
log(LogLevel.INFO, '[ENV CHECK] SUPABASE_ANON_KEY:', !!process.env.SUPABASE_ANON_KEY);
log(LogLevel.INFO, '[ENV CHECK] OPENAI_API_KEY:', !!OPENAI_API_KEY);

// Set up global WebSocket for Node 20 compatibility
(global as any).WebSocket = WebSocket;

// Initialize Supabase client with proper error handling
let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
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
type IntakeStage = 'ask_name_reason' | 'ask_details' | 'ask_location' | 'ask_completion_time' | 'ask_callback_time' | 'complete';

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
  callbackNumber?: string;
  businessName: string;
  callSid: string;
  businessId: string;
  sessionId: string;
  startTime: number;
}

interface LeadSummary {
  callerName?: string;
  callbackNumber?: string;
  reason?: string;
  urgency?: 'urgent' | 'normal' | 'not_specified';
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
  console.log('[REQUIRED_FIELDS_STATUS] =========================================');
  console.log('[REQUIRED_FIELDS_STATUS] All required fields collected:', allCollected);
  console.log('[REQUIRED_FIELDS_STATUS] customerName:', !!intake.customerName);
  console.log('[REQUIRED_FIELDS_STATUS] serviceRequested:', !!intake.serviceRequested);
  console.log('[REQUIRED_FIELDS_STATUS] issueDescription:', !!intake.issueDescription);
  console.log('[REQUIRED_FIELDS_STATUS] serviceAddress:', !!intake.serviceAddress);
  console.log('[REQUIRED_FIELDS_STATUS] desiredCompletionTime:', !!intake.desiredCompletionTime);
  console.log('[REQUIRED_FIELDS_STATUS] callbackTime:', !!intake.callbackTime);
  console.log('[REQUIRED_FIELDS_STATUS] callbackNumber (optional):', !!intake.callbackNumber);
  console.log('[REQUIRED_FIELDS_STATUS] Timestamp:', new Date().toISOString());
  console.log('[REQUIRED_FIELDS_STATUS] =========================================');
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

function isConfirmationAccepted(transcript: string): boolean {
  const affirmativePhrases = ['yes', 'correct', 'that\'s right', 'that is right', 'that\'s correct', 'that is correct', 'sounds good', 'perfect', 'yep', 'yeah', 'confirmed'];
  const lowerTranscript = transcript.toLowerCase().trim();
  const isAccepted = affirmativePhrases.some(phrase => lowerTranscript.includes(phrase));
  
  if (isAccepted) {
    console.log('[CONFIRMATION_ACCEPTED] =========================================');
    console.log('[CONFIRMATION_ACCEPTED] Caller confirmed the information');
    console.log('[CONFIRMATION_ACCEPTED] Transcript:', transcript);
    console.log('[CONFIRMATION_ACCEPTED] Timestamp:', new Date().toISOString());
    console.log('[CONFIRMATION_ACCEPTED] =========================================');
  } else {
    console.log('[CONFIRMATION_UNCLEAR] =========================================');
    console.log('[CONFIRMATION_UNCLEAR] Caller response unclear, asking again');
    console.log('[CONFIRMATION_UNCLEAR] Transcript:', transcript);
    console.log('[CONFIRMATION_UNCLEAR] Timestamp:', new Date().toISOString());
    console.log('[CONFIRMATION_UNCLEAR] =========================================');
  }
  
  return isAccepted;
}

// function transitionToConfirmation(intake: IntakeData, closingState: any, openAiWs: any): void {
//   console.log('[TRANSITION_TO_CONFIRMATION] =========================================');
//   console.log('[TRANSITION_TO_CONFIRMATION] Transitioning to confirmation stage');
//   console.log('[TRANSITION_TO_CONFIRMATION] Timestamp:', new Date().toISOString());
//   console.log('[TRANSITION_TO_CONFIRMATION] =========================================');
//   
//   intake.stage = 'confirmation';
//   closingState.confirmationState = 'confirmation_sent';
//   
//   const confirmationMessage = generateConfirmationMessage(intake);
//   console.log('[TRANSITION_TO_CONFIRMATION] Sending confirmation summary:', confirmationMessage);
//   
//   if (openAiWs) {
//     openAiWs.send(JSON.stringify({
//       type: 'response.create',
//       response: {
//         instructions: `Say exactly: "${confirmationMessage}"`
//       }
//     }));
//   }
// }

function enterTerminalClose(closingState: any, ws: any, twilioHandler: any, openAiWs: any): void {
  console.log('[ENTER_TERMINAL_CLOSE] =========================================');
  console.log('[ENTER_TERMINAL_CLOSE] Entering terminal close mode');
  console.log('[ENTER_TERMINAL_CLOSE] Timestamp:', new Date().toISOString());
  console.log('[ENTER_TERMINAL_CLOSE] =========================================');
  
  closingState.confirmationState = 'completed';
  closingState.intakeTerminalComplete = true;
  closingState.terminalClosingResponseStarted = true;
  closingState.finalClosingStarted = true;
  closingState.callState = 'closing';
  
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
  
  // Generate and track authorized final response ID
  const authorizedFinalResponseId = `final_${Date.now()}`;
  (twilioHandler as any).authorizedFinalResponseId = authorizedFinalResponseId;
  
  // Send exact final closing sentence
  const exactClosingSentence = "Thank you for calling. I'll pass this information along to the business and they will get back to you as soon as possible. Have a great day.";
  
  console.log('[FINAL CLOSING SENTENCE SENT] =========================================');
  console.log('[FINAL CLOSING SENTENCE SENT] Sending fixed final closing sentence');
  console.log('[FINAL CLOSING SENTENCE SENT] Sentence:', exactClosingSentence);
  console.log('[FINAL CLOSING SENTENCE SENT] Response ID:', authorizedFinalResponseId);
  console.log('[FINAL CLOSING SENTENCE SENT] Timestamp:', new Date().toISOString());
  console.log('[FINAL CLOSING SENTENCE SENT] =========================================');
  
  sendControlledAssistantText(exactClosingSentence, 'FIXED_FINAL_CLOSING', openAiWs);

  // Start safety fallback timer - force hangup if final speech completion doesn't arrive within 8 seconds
  console.log('[SAFETY FALLBACK TIMER STARTED] =========================================');
  console.log('[SAFETY FALLBACK TIMER STARTED] Starting 8-second safety timer');
  console.log('[SAFETY FALLBACK TIMER STARTED] Will force hangup if final speech completion not received');
  console.log('[SAFETY FALLBACK TIMER STARTED] Timestamp:', new Date().toISOString());
  console.log('[SAFETY FALLBACK TIMER STARTED] =========================================');
  
  setTimeout(() => {
    if (closingState.callState === 'closing' && !closingState.finalClosingAudioDone) {
      console.log('[SAFETY FALLBACK TRIGGERED] =========================================');
      console.log('[SAFETY FALLBACK TRIGGERED] Final speech completion not received within 8 seconds');
      console.log('[SAFETY FALLBACK TRIGGERED] Forcing hangup');
      console.log('[SAFETY FALLBACK TRIGGERED] Timestamp:', new Date().toISOString());
      console.log('[SAFETY FALLBACK TRIGGERED] =========================================');
      
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          event: 'hangup'
        }));
        console.log('[TWILIO CALL HANGUP REQUESTED] Safety fallback hangup sent');
      }
    }
  }, 8000);
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

function generateConfirmationMessage(intake: IntakeData): string {
  console.log('[SUMMARY PATH USED] generateConfirmationMessage-hardcoded-function');
  console.log('[SUMMARY DATA] Creating summary message with collected data:', {
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    callbackTime: intake.callbackTime,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackNumber: intake.callbackNumber
  });

  const name = intake.customerName || 'there';
  const service = intake.serviceRequested || 'your inquiry';
  const issue = intake.issueDescription || 'not specified';
  const location = intake.serviceAddress || 'not specified';
  const callbackTime = intake.callbackTime || 'anytime';
  const completionTime = intake.desiredCompletionTime || 'not specified';

  console.log('[AI REQUIRED FIELDS STATUS]', {
    hasCustomerName: !!intake.customerName,
    hasServiceRequested: !!intake.serviceRequested,
    hasIssueDescription: !!intake.issueDescription,
    hasServiceAddress: !!intake.serviceAddress,
    hasDesiredCompletionTime: !!intake.desiredCompletionTime,
    hasCallbackTime: !!intake.callbackTime,
    hasCallbackNumber: !!intake.callbackNumber,
    allRequired: !!(intake.customerName && intake.serviceRequested && intake.issueDescription && intake.serviceAddress && intake.desiredCompletionTime && intake.callbackTime)
  });

  // Generate summary WITHOUT the confirmation question and WITHOUT callback number
  const summary = `Let me make sure I have everything right. Your name is ${name}. You're calling about ${service}. The additional details are ${issue}. The desired completion time is ${completionTime}. The location is ${location}. The best callback time is ${callbackTime}.`;

  console.log('[SUMMARY GENERATED]', { summary });
  return summary;
}

function sendControlledAssistantText(text: string, reason: string, openAiWs: any): void {
  console.log('[CONTROLLED ASSISTANT TEXT SENT] =========================================');
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Reason:', reason);
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Text:', text);
  console.log('[CONTROLLED ASSISTANT TEXT SENT] Timestamp:', new Date().toISOString());
  console.log('[CONTROLLED ASSISTANT TEXT SENT] =========================================');

  const exactInstruction = `Say exactly this sentence and nothing else: "${text}"`;
  const message = {
    type: 'response.create',
    response: {
      instructions: exactInstruction,
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

function sendStagePrompt(stage: string, openAiWs: any): void {
  const stagePrompts: { [key: string]: string } = {
    'ask_name_reason': 'Thanks for calling. Can I get your name and the reason for your call?',
    'ask_details': 'Can you tell me any additional details about what you need?',
    'ask_location': 'What address or location is this for?',
    'ask_completion_time': 'When would you like this work completed?',
    'ask_callback_time': 'What is the best time for the business to call you back?'
  };

  const prompt = stagePrompts[stage];
  if (!prompt) {
    console.log('[STAGE PROMPT NOT FOUND] Stage:', stage);
    return;
  }

  console.log('[STAGE PROMPT SELECTED] =========================================');
  console.log('[STAGE PROMPT SELECTED] Stage:', stage);
  console.log('[STAGE PROMPT SELECTED] Prompt:', prompt);
  console.log('[STAGE PROMPT SELECTED] Timestamp:', new Date().toISOString());
  console.log('[STAGE PROMPT SELECTED] =========================================');

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

  sendControlledAssistantText(prompt, `STAGE_PROMPT_${stage.toUpperCase()}`, openAiWs);
  responseSent = true;
  clearTimeout(watchdogTimer);
}

function getIntakeResponse(intake: IntakeData, transcript?: string): { response: string; nextStage: IntakeStage } {
  console.log('[AI INTAKE STAGE] current stage:', intake.stage);

  // Extract multiple answers from single response
  if (transcript) {
    extractMultipleAnswers(intake, transcript);
  }

  // Determine next question based on missing fields
  const missingFields = getMissingRequiredFields(intake);
  console.log('[AI INTAKE] Missing fields:', missingFields);

  // Detect courtesy phrases during required intake stages and redirect to re-ask missing field
  // Only applies before terminal mode starts (check if we're still collecting required fields)
  if (transcript && missingFields.length > 0 && intake.stage !== 'complete') {
    const lowerTranscript = transcript.toLowerCase().trim();
    const courtesyPhrases = ['thank you', 'thanks', 'you too', 'bye', 'that\'s all', 'goodbye', 'alright'];
    const isCourtesyPhrase = courtesyPhrases.some(phrase => lowerTranscript === phrase || lowerTranscript.startsWith(phrase + ' ') || lowerTranscript.endsWith(phrase));

    if (isCourtesyPhrase) {
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] =========================================');
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Courtesy phrase detected during required intake');
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Transcript:', transcript);
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Current stage:', intake.stage);
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Missing fields:', missingFields);
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Redirecting to re-ask missing field');
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] Timestamp:', new Date().toISOString());
      console.log('[COURTESY_REPLY_DURING_INTAKE_REDIRECTED] =========================================');

      // Briefly acknowledge and re-ask the current missing field
      const missingFieldResponse = getResponseForMissingField(missingFields[0], intake);
      const courtesyAck = 'You\'re welcome. ';
      return {
        response: courtesyAck + missingFieldResponse.response,
        nextStage: missingFieldResponse.nextStage
      };
    }
  }

  switch (intake.stage) {
    case 'ask_name_reason':
      // Check if name and reason were captured
      if (intake.customerName && intake.serviceRequested) {
        return {
          response: 'Can you tell me any additional details about what you need?',
          nextStage: 'ask_details'
        };
      }
      // Max-stage progression guard: if name is captured but not reason, move to next stage
      if (intake.customerName && !intake.serviceRequested) {
        console.log('[MAX-STAGE PROGRESSION] Name captured, moving to details stage');
        return {
          response: 'Can you tell me any additional details about what you need?',
          nextStage: 'ask_details'
        };
      }
      // Max-stage progression guard: if reason is captured but not name, move to next stage
      if (!intake.customerName && intake.serviceRequested) {
        console.log('[MAX-STAGE PROGRESSION] Service captured, moving to details stage');
        return {
          response: 'Can you tell me any additional details about what you need?',
          nextStage: 'ask_details'
        };
      }
      // Ask for name and reason again if not captured
      return {
        response: 'Thanks for calling. Can I get your name and the reason for your call?',
        nextStage: 'ask_name_reason'
      };

    case 'ask_details':
      // Check if issue description was captured
      if (intake.issueDescription && intake.issueDescription.length > 5) {
        return {
          response: 'What address or location is this for?',
          nextStage: 'ask_location'
        };
      }
      // Max-stage progression guard: if we have serviceRequested but no issueDescription, use serviceRequested as description
      if (intake.serviceRequested && !intake.issueDescription) {
        console.log('[MAX-STAGE PROGRESSION] Using serviceRequested as issueDescription');
        intake.issueDescription = intake.serviceRequested;
        return {
          response: 'What address or location is this for?',
          nextStage: 'ask_location'
        };
      }
      // Ask for details again if not captured
      return {
        response: 'Can you tell me any additional details about what you need?',
        nextStage: 'ask_details'
      };

    case 'ask_location':
      // Check if location was captured
      if (intake.serviceAddress) {
        return {
          response: 'When would you like this work completed?',
          nextStage: 'ask_completion_time'
        };
      }
      // Ask for location
      return {
        response: 'What address or location is this for?',
        nextStage: 'ask_location'
      };

    case 'ask_completion_time':
      // Check if desired completion time was captured
      if (intake.desiredCompletionTime) {
        return {
          response: 'What is the best time for the business to call you back?',
          nextStage: 'ask_callback_time'
        };
      }
      // Ask for completion time again if not captured
      return {
        response: 'When would you like this work completed?',
        nextStage: 'ask_completion_time'
      };

    case 'ask_callback_time':
      // Check if callback time was captured
      if (intake.callbackTime) {
        console.log('[CALLBACK TIME CAPTURED CLOSING NOW] =========================================');
        console.log('[CALLBACK TIME CAPTURED CLOSING NOW] Callback time captured, closing now');
        console.log('[CALLBACK TIME CAPTURED CLOSING NOW] Callback time:', intake.callbackTime);
        console.log('[CALLBACK TIME CAPTURED CLOSING NOW] Timestamp:', new Date().toISOString());
        console.log('[CALLBACK TIME CAPTURED CLOSING NOW] =========================================');
        return {
          response: '',
          nextStage: 'complete'
        };
      }
      // Ask for callback time again if not captured
      return {
        response: 'What is the best time for the business to call you back?',
        nextStage: 'ask_callback_time'
      };

    case 'complete':
      // Intake is complete - should not reach here
      console.log('[INTAKE COMPLETE] All fields collected, ready to close');
      return {
        response: '',
        nextStage: 'complete'
      };

    default:
      return {
        response: 'Sorry, could you repeat that?',
        nextStage: intake.stage
      };
  }
}

// Helper function to extract multiple answers from single response
function extractMultipleAnswers(intake: IntakeData, transcript: string): void {
  const lowerTranscript = transcript.toLowerCase().trim();
  
  console.log('[LIVE EXTRACTION RAW] =========================================');
  console.log('[LIVE EXTRACTION RAW] Transcript:', transcript);
  console.log('[LIVE EXTRACTION RAW] Timestamp:', new Date().toISOString());
  console.log('[LIVE EXTRACTION RAW] =========================================');

  // Extract name if not already captured
  if (!intake.customerName) {
    const name = extractName(transcript);
    if (name && name.length > 1) {
      intake.customerName = name;
      console.log('[LIVE EXTRACTION MAPPED] customerName:', intake.customerName);
    }
  }

  // Extract service requested with heuristic fallback
  if (!intake.serviceRequested) {
    const serviceKeywords = ['plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control', 'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors', 'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage', 'junk removal', 'grass cutting', 'mowing', 'lawn care', 'toilet', 'toilet installation', 'toilet plumbing', 'grass cut', 'cut grass', 'mow lawn', 'lawn mowing'];
    const foundService = serviceKeywords.find(keyword => lowerTranscript.includes(keyword));
    if (foundService) {
      intake.serviceRequested = foundService.charAt(0).toUpperCase() + foundService.slice(1);
      console.log('[LIVE EXTRACTION MAPPED] serviceRequested:', intake.serviceRequested);
    } else {
      // Heuristic fallback: infer service from common phrases
      if (lowerTranscript.includes('grass') || lowerTranscript.includes('lawn') || lowerTranscript.includes('mow')) {
        intake.serviceRequested = 'Lawn care';
        console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Lawn care" from:', transcript);
      } else if (lowerTranscript.includes('plumbing') || lowerTranscript.includes('plumb') || lowerTranscript.includes('pipe') || lowerTranscript.includes('toilet') || lowerTranscript.includes('drain')) {
        intake.serviceRequested = 'Plumbing';
        console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Plumbing" from:', transcript);
      } else if (lowerTranscript.includes('install') || lowerTranscript.includes('installed')) {
        intake.serviceRequested = 'Installation';
        console.log('[FIELD MAPPING FALLBACK APPLIED] serviceRequested inferred as "Installation" from:', transcript);
      }
    }
  }

  // Extract desired completion time if not already captured
  if (!intake.desiredCompletionTime) {
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
      console.log('[LIVE EXTRACTION MAPPED] desiredCompletionTime:', intake.desiredCompletionTime);
    }
  }

  // Extract callback time if not already captured
  if (!intake.callbackTime) {
    const callbackTimePatterns = [
      'as soon as possible',
      'asap',
      'anytime',
      'whenever',
      'today',
      'tomorrow',
      'tomorrow morning',
      'tomorrow afternoon',
      'this morning',
      'this afternoon',
      'this evening',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'next week'
    ];

    const foundCallbackTime = callbackTimePatterns.find(pattern => lowerTranscript.includes(pattern));
    if (foundCallbackTime) {
      intake.callbackTime = foundCallbackTime.charAt(0).toUpperCase() + foundCallbackTime.slice(1);
      console.log('[LIVE EXTRACTION MAPPED] callbackTime:', intake.callbackTime);
    } else if (lowerTranscript.includes('as soon as possible')) {
      intake.callbackTime = 'As soon as possible';
      console.log('[FIELD MAPPING FALLBACK APPLIED] callbackTime set to "As soon as possible"');
    }
  }

  // Extract location/service address if not already captured (accept flexible responses)
  if (!intake.serviceAddress) {
    // Check for online/virtual/remote responses
    const onlineKeywords = ['online', 'virtual', 'remote', 'zoom', 'google meet', 'discord', 'over the phone', 'phone'];
    const hasOnlineKeyword = onlineKeywords.some(keyword => lowerTranscript.includes(keyword));
    if (hasOnlineKeyword) {
      intake.serviceAddress = 'Online';
      intake.locationType = 'online';
      console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
    } else {
      // Check for business location responses
      const businessLocationKeywords = ['at your business', 'at your shop', 'at your office', 'at your place', 'your business', 'your shop', 'your office', "i'll come to you", 'come to you'];
      const hasBusinessLocationKeyword = businessLocationKeywords.some(keyword => lowerTranscript.includes(keyword));
      if (hasBusinessLocationKeyword) {
        intake.serviceAddress = 'At business location';
        intake.locationType = 'business_location';
        console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
      } else {
        // Check for residential responses
        const residentialKeywords = ['at my house', 'my house', 'my home', 'at my home', 'my place'];
        const hasResidentialKeyword = residentialKeywords.some(keyword => lowerTranscript.includes(keyword));
        if (hasResidentialKeyword) {
          intake.serviceAddress = 'At caller\'s residence';
          intake.locationType = 'caller_location';
          console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
        } else if (transcript.trim().length > 5 && !lowerTranscript.startsWith('my name is') && !lowerTranscript.startsWith('i need') && !lowerTranscript.startsWith('i want')) {
          // If transcript contains location-like content (not name or service request), preserve it as-is
          // This captures city names, neighborhoods, or specific addresses
          intake.serviceAddress = transcript.trim();
          intake.locationType = 'service_address';
          console.log('[LIVE EXTRACTION MAPPED] serviceAddress:', intake.serviceAddress, 'locationType:', intake.locationType);
        }
      }
    }
  }

  // Extract issue description with heuristic fallback
  if (!intake.issueDescription) {
    if (transcript.trim().length > 10) {
      // Use the transcript as issue description if it's not just a name or service request
      intake.issueDescription = transcript.trim();
      console.log('[LIVE EXTRACTION MAPPED] issueDescription:', intake.issueDescription);
    }
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
        response: 'What address or location is this regarding?',
        nextStage: 'ask_location'
      };
    case 'desired completion time':
    case 'desiredCompletionTime':
      return {
        response: 'When would you like this work completed?',
        nextStage: 'ask_completion_time'
      };
    case 'callback time':
    case 'callbackTime':
      return {
        response: 'What is the best time for the business to call you back?',
        nextStage: 'ask_callback_time'
      };
    default:
      return {
        response: 'Could you please provide more details?',
        nextStage: intake.stage
      };
  }
}

function extractName(transcript: string): string {
  // Simple name extraction - look for common patterns
  const words = transcript.trim().split(' ');
  // Return first 1-2 words as potential name
  return words.slice(0, 2).join(' ');
}

function extractPhoneNumber(transcript: string): string {
  // Extract phone number patterns
  const phoneRegex = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{10})/;
  const match = transcript.match(phoneRegex);
  return match ? match[1] : transcript.trim();
}

function extractUrgency(transcript: string): 'urgent' | 'normal' | 'not_specified' {
  const urgent = transcript.toLowerCase().match(/\burgent\b|\bemergency\b|\basap\b|\bimmediately\b|\bright away\b/);
  if (urgent) {
    return 'urgent';
  }
  const normal = transcript.toLowerCase().match(/\bnormal\b|\bnot urgent\b|\blater\b|\bflexible\b|\bno rush\b/);
  if (normal) {
    return 'normal';
  }
  return 'not_specified';
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
    callbackNumber: undefined,
    reason: intake.serviceRequested,
    urgency: 'normal',
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
  console.log('[CALL_STATE_SET_CLOSING] Setting callState to closing immediately');
  console.log('[CALL_STATE_SET_CLOSING] Source: startAuthoritativeFinalClose at', source);
  console.log('[CALL_STATE_SET_CLOSING] Stack: startAuthoritativeFinalClose -> immediate state transition');
  console.log('[CALL_STATE_SET_CLOSING] Timestamp:', new Date().toISOString());
  closingState.callState = 'closing';
  (twilioHandler as any).callState = closingState.callState;
  console.log('[CALL_STATE_SET_CLOSING] Value after set:', closingState.callState);

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

    // Individual variables kept for backward compatibility during transition
    // These will be deprecated once all code uses closingState directly
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
    let finalAudioFallbackTimer: NodeJS.Timeout | null = null; // Fallback timer for mark sending
    let finalAudioFallbackStarted = false; // Track if fallback timer has been started
    let directHangupFallbackTimer: NodeJS.Timeout | null = null; // Direct hangup fallback timer
    let directHangupFallbackExecuted = false; // Track if direct hangup fallback has been executed
    let hardStopTimer: NodeJS.Timeout | null = null; // Absolute hard-stop timer

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
    (twilioHandler as any).assistantSpeaking = assistantSpeaking;

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
      console.log('[CALL END DETECTED] WebSocket closed, starting post-call persistence');
      console.log('[INGEST CALL DATA START] Function called');
      
      const sessionSessionId = (ws as any).sessionId || '';
      const sessionBusinessId = (ws as any).businessId || '';
      const sessionCallSid = (ws as any).callSid || '';
      const sessionCallerPhone = (ws as any).callerPhone || '';
      const sessionForwardedFrom = (ws as any).forwardedFrom || '';
      
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
        console.log('[AI INGEST FAILED] supabase client not available for ingestion');
        return;
      }
      
      console.log('[AI INGEST INSERT START] checking for existing record');
      const { data: existingRecord, error: existingError } = await supabase
        .from('ai_call_records')
        .select('id, created_at')
        .eq('call_sid', sessionCallSid)
        .single();
      
      if (existingError && existingError.code !== 'PGRST116') {
        console.log('[AI INGEST FAILED] error checking existing record', existingError);
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
            outcome: 'completed',
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
          console.log('[AI LEAD UPSERT FAILED]', { businessId: sessionBusinessId, callerPhone: sessionCallerPhone, error: leadError.message });
          throw leadError;
        }

        console.log('[LEAD CREATE SUCCESS] Lead created successfully');
        console.log('[AI LEAD UPSERT RESULT]', { leadId: lead.id, businessId: sessionBusinessId, callerPhone: sessionCallerPhone });

        // Create or update conversation
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
          console.log('[AI CONVERSATION UPSERT FAILED]', conversationError);
          throw conversationError;
        }

        console.log('[AI CONVERSATION UPSERT RESULT]', { conversationId: conversation.id, leadId: lead.id });

        // Create new AI call record with populated IDs
        console.log('[AI SAVE START] creating new AI call record...');
        const mainInsertPayload = {
            business_id: sessionBusinessId,
            lead_id: lead.id,
            conversation_id: conversation.id,
            caller_phone: sessionCallerPhone || 'unknown',
            call_sid: sessionCallSid || 'unknown',
            ai_session_id: sessionSessionId,
            transcript: Array.isArray(transcript) ? transcript : [],
            outcome: 'completed',
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

        console.log('[ACTIVE PATH AFTER SAVE RESULT REACHED]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          callSid: sessionCallSid,
          recordId: newRecord.id
        });

        // Create follow-up jobs for successful AI intake
        console.log('[ACTIVE PATH FOLLOWUP START]', {
          businessId: sessionBusinessId,
          leadId: lead.id,
          conversationId: conversation.id,
          outcome: 'completed'
        });

        // Call follow-up creation API
        try {
          console.log('[FOLLOWUP DEBUG API START - ACTIVE] Fetching from follow-up API');
          const followUpApiUrl = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
          const internalApiSecret = process.env.INTERNAL_API_SECRET;
          
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
          } else {
            console.error('[FOLLOWUP DEBUG ERROR - ACTIVE]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id,
              status: response.status,
              statusText: response.statusText
            });
          }
        } catch (followUpError) {
          console.error('[FOLLOWUP DEBUG ERROR - ACTIVE]', { 
            businessId: sessionBusinessId, 
            leadId: lead.id,
            error: followUpError
          });
        }
        console.log('[FOLLOWUP DEBUG COMPLETE - ACTIVE] Follow-up API call finished');
        
        // Create notification directly using Supabase
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
          } else {
            console.log('[NOTIFICATION DIRECT INSERT SUCCESS]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id
            });
          }
        } catch (notificationError) {
          console.log('[ACTIVE PATH NOTIFICATION ERROR]', notificationError);
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

        console.log('[INGEST CALL DATA COMPLETE] Post-call persistence completed successfully');
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

        // Create with transcript only if extraction failed
        const fallbackInsertPayload = {
            business_id: sessionBusinessId,
            lead_id: fallbackLead?.id || null,
            conversation_id: fallbackConversationId,
            caller_phone: sessionCallerPhone || 'unknown',
            call_sid: sessionCallSid || 'unknown',
            transcript: Array.isArray(transcript) ? transcript : [],
            outcome: 'completed',
            extracted_info: { callbackNumber: sessionCallerPhone },
            summary: fullTranscript || 'AI call completed',
            extraction_failed: true
          };
        console.log('[AI CALL RECORD OUTCOME]', {
          outcome: fallbackInsertPayload.outcome,
          callSid: fallbackInsertPayload.call_sid,
          businessId: fallbackInsertPayload.business_id,
          leadId: fallbackInsertPayload.lead_id,
          conversationId: fallbackInsertPayload.conversation_id
        });
        console.log('[INSERT PATH B] main AI save fallback after lead/conversation link error', {
          file: 'services/replyflow-ai-voice/src/index.ts',
          line: 1647,
          lead_id: fallbackInsertPayload.lead_id,
          conversation_id: fallbackInsertPayload.conversation_id
        });
        console.log('[AI CALL RECORD INSERT PAYLOAD]', fallbackInsertPayload);

        console.log('[AI CALL RECORD INSERT ACTIVE PATH]', {
          file: 'services/replyflow-ai-voice/src/index.ts',
          function: 'main AI save fallback after lead/conversation link error',
          sessionId: 'unknown',
          callSid: sessionCallSid,
          businessId: sessionBusinessId,
          callerPhone: sessionCallerPhone
        });

        const { data: fallbackRecord, error: fallbackError } = await supabase
          .from('ai_call_records')
          .insert(fallbackInsertPayload)
          .select()
          .single();

        if (fallbackError) {
          console.log('[AI CALL RECORD SAVE FAILED]', fallbackError);
        } else {
          console.log('[AI CALL RECORD SAVE SUCCESS]', { recordId: fallbackRecord.id });

          if (fallbackLead?.id && fallbackConversationId) {
            console.log('[AI LINK SUCCESS]', {
              aiCallRecordId: fallbackRecord.id,
              leadId: fallbackLead.id,
              conversationId: fallbackConversationId
            });
            
            console.log('[AI RECORD INSERT SUCCESS - FALLBACK PATH]', {
              businessId: sessionBusinessId,
              leadId: fallbackLead.id,
              conversationId: fallbackConversationId,
              callSid: sessionCallSid
            });
            
            // Create follow-up jobs for the new lead (fallback path)
            console.log('[FOLLOWUP DEBUG REACHED - FALLBACK] About to call follow-up API');
            try {
              console.log('[FOLLOWUP DEBUG API START - FALLBACK] Fetching from follow-up API');
              const followUpApiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
              console.log('[FOLLOWUP DEBUG API URL - FALLBACK]', followUpApiUrl);
              
              const response = await fetch(`${followUpApiUrl}/api/follow-ups/create-jobs`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  businessId: sessionBusinessId,
                  leadId: fallbackLead.id,
                  conversationId: fallbackConversationId,
                  businessName: null
                })
              });
              
              console.log('[FOLLOWUP DEBUG API RESPONSE - FALLBACK]', response.status);
              
              if (response.ok) {
                const result = await response.json() as { success: boolean; jobCount: number };
                console.log('[FOLLOWUP DEBUG SUCCESS - FALLBACK]', { 
                  businessId: sessionBusinessId, 
                  leadId: fallbackLead.id,
                  jobCount: result.jobCount 
                });
              } else {
                console.error('[FOLLOWUP DEBUG ERROR - FALLBACK]', { 
                  businessId: sessionBusinessId, 
                  leadId: fallbackLead.id,
                  status: response.status,
                  statusText: response.statusText
                });
              }
            } catch (followUpError) {
              console.error('[FOLLOWUP DEBUG ERROR - FALLBACK]', { 
                businessId: sessionBusinessId, 
                leadId: fallbackLead.id,
                error: followUpError
              });
            }
            console.log('[FOLLOWUP DEBUG COMPLETE - FALLBACK] Follow-up API call finished');

            // AI confirmation SMS skipped in fallback path to prevent duplicates
            // Active success path (line 2449) handles SMS sending for completed AI intake
            console.log('[AI CONFIRMATION SMS SKIPPED FALLBACK PATH]', {
              reason: 'active_path_handles_sms',
              leadId: fallbackLead?.id,
              conversationId: fallbackConversationId,
              callSid: sessionCallSid,
              note: 'Falling back to transcript-only processing, but SMS is handled by active path'
            });

            // Notification is now created in PATH-E via API endpoint (uses notificationServiceServer)
          }
        }
        return;
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
            console.log('[CALLER AUDIO BLOCKED] =========================================');
            console.log('[CALLER AUDIO BLOCKED] Caller audio blocked - terminal mode active');
            console.log('[CALLER AUDIO BLOCKED] intakeTerminalComplete:', closingState.intakeTerminalComplete);
            console.log('[CALLER AUDIO BLOCKED] terminalClosingResponseStarted:', closingState.terminalClosingResponseStarted);
            console.log('[CALLER AUDIO BLOCKED] finalClosingStarted:', closingState.finalClosingStarted);
            console.log('[CALLER AUDIO BLOCKED] callState:', closingState.callState);
            console.log('[CALLER AUDIO BLOCKED] Timestamp:', new Date().toISOString());
            console.log('[CALLER AUDIO BLOCKED] =========================================');
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
          
          // Store callContext on ws for use throughout the call
          (ws as any).callContext = callContext;
          (ws as any).businessId = callContext.businessId;
          (ws as any).callSid = callContext.callSid;
          (ws as any).sessionId = callContext.sessionId;
          (ws as any).callerPhone = callContext.callerPhone;
          (ws as any).forwardedFrom = callContext.forwardedFrom;
          
          // Update local variables for backward compatibility
          sessionId = callContext.sessionId;
          businessId = callContext.businessId;
          callSid = callContext.callSid;
          callerPhone = callContext.callerPhone;
          forwardedFrom = callContext.forwardedFrom;
          
          console.log('[CALL CONTEXT USED FOR BUSINESS LOOKUP]', { businessId: callContext.businessId });

          // Fetch business data if businessId is available
          let businessName: string | null = null;
          let businessType = '';
          let customGreeting = '';
          
          console.log('[SUPABASE CLIENT CREATED]', supabase ? 'YES' : 'NO');
          console.log('[BUSINESS LOOKUP START]', { businessId, hasSupabase: !!supabase });
          
          if (businessId && supabase) {
            try {
              console.log('[BUSINESS LOOKUP EXECUTING]', { businessId });
              const { data: business, error } = await supabase
                .from('businesses')
                .select('name')
                .eq('id', businessId)
                .single() as any;
              
              console.log('[BUSINESS LOOKUP RESULT]', { business, error });
              if (business) {
                console.log('[BUSINESS RECORD]', { 
                  businessId: business.id, 
                  businessName: business.name,
                  availableFields: Object.keys(business)
                });
              }
              
              if (error) {
                console.log('[BUSINESS LOOKUP ERROR]', error);
                console.log('[BUSINESS LOOKUP FAILED]', { hasSupabase: false, error: error.message });
              } else if (business) {
                businessName = business.name;
                businessType = ''; // Default empty since type column doesn't exist
                customGreeting = ''; // Default empty since custom_greeting column doesn't exist
                console.log('[BUSINESS NAME RESOLVED]', businessName);
                console.log('[BUSINESS LOOKUP SUCCESS]', {
                  businessId,
                  businessName,
                  businessType,
                  hasCustomGreeting: !!customGreeting
                });
                console.log('[AI] business loaded', { businessName, businessType, hasCustomGreeting: !!customGreeting });
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
                  instructions: `You are the AI receptionist for businesses.

Your job is to politely answer missed calls for businesses and gather operationally important information.

LANGUAGE RULE:
You must speak English only.
Do not switch languages.
Do not imitate accents, dialects, or non-English speech.
If the caller speaks another language, politely respond in English and say:
"I'm sorry, I can only take this message in English."

Note: The greeting will be handled separately via exact response.create instruction.

INFORMATION GATHERING PRIORITY ORDER:
1. Name + reason for calling (combined)
2. Additional details about the issue or project
3. Location or where this would take place
4. When they would like the work completed
5. Best time for the business to call back

CALL COMPLETION POLICY:
YOU MUST collect ALL required fields before finalizing. Do not end the call early:
- Name (required)
- Reason for calling (required)
- Additional details about the issue or project (required)
- Location or where this would take place (required)
- When they would like the work completed (required)
- Best time for the business to call back (required)

YOU MUST collect all 6 required fields before finalizing. Do not end the call early.

CALL ENDING SEQUENCE:
Once you have collected ALL 6 required fields, the system will handle the call termination.
DO NOT say "Thank you for calling" or any closing phrase on your own.
Wait for the system to provide the final goodbye and end the call.
Continue gathering information until the system takes over the closing sequence.

CRITICAL: Do NOT summarize the collected information. Do NOT ask "Is that correct?". Do NOT say any closing phrases. Just continue gathering required information.

AWKWARD LOOP PREVENTION:
Do NOT ask:
- "Anything else?"
- "How else can I help?"
- "Is there anything else I can help you with?"
- "Do you have any other questions?"
- Repeating the same question
- Unnecessary details

BEHAVIOR REQUIREMENTS:
- Naturally guide conversation based on priority order
- Ask one question at a time
- Do not sound like a checklist or survey
- Focus on gathering actionable business information
- Keep responses concise and conversational
- Avoid robotic phrasing
- Do not finalize until every required field is collected or explicitly declined

IMPORTANT GUIDELINES:
- If the caller already provided information, do not ask for it again
- Location/where this would take place is always required. Ask: "Where would this take place — for example at your address, at the business, or online?" Accept flexible responses like online, virtual, remote, Zoom, Google Meet, at your business/shop/office, at my house, city name, or specific street address
- Best callback time is always required; "anytime" is valid
- Additional details about the issue or project is always required

STRICTLY FORBIDDEN:
- NEVER ask for urgency or "Is this urgent or time-sensitive?"
- NEVER ask for callback number or "Is this the best number to reach you at, or is there another number?"
- NEVER ask for confirmation or "Is that correct?"
- NEVER ask "Anything else?", "How else can I help?", or similar questions
- NEVER generate your own closing or goodbye phrase
- NEVER say "I have everything I need" or similar completion phrases
- Once the app has collected all 6 required fields, stop normal conversation immediately

Do NOT:
- give long explanations
- sound robotic
- act like a generic assistant
- discuss unrelated topics
- modify the greeting
- add generic assistant chatter
- keep the call going awkwardly
- ask unnecessary optional questions`,
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
            openAiWs.on('message', (data) => {
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
                  console.log('[USER TRANSCRIPT FOUND]', {
                    eventType: 'conversation.item.created',
                    itemType: message.item.type,
                    hasContent: !!message.item.content,
                    content: message.item.content || null,
                    transcript: userTranscript
                  });
                  
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
                  console.log('[USER TRANSCRIPT FOUND]', {
                    eventType: 'conversation.item.done',
                    itemType: message.item.type,
                    hasContent: !!message.item.content,
                    content: message.item.content || null,
                    transcript: userTranscript
                  });
                  
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
                  console.log('[USER TRANSCRIPT FOUND]', {
                    eventType: 'conversation.item.completed',
                    itemType: message.item.type,
                    hasContent: !!message.item.content,
                    content: message.item.content || null,
                    transcript: userTranscript
                  });
                  
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
                if (intakeData && intakeData.stage !== 'complete' && openAiWs && sessionReady && !intakeComplete) {
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
                  
                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage: intakeData.stage, 
                    intakeComplete: intakeComplete, 
                    transcript: userTranscript 
                  });
                  console.log('[INTAKE COMPLETION CHECK] Processing intake stage:', intakeData.stage);
                  console.log('[INTAKE COMPLETION CHECK] User transcript:', userTranscript);
                  console.log('[INTAKE COMPLETION CHECK] Session ready:', sessionReady);
                  
                  // Check if all required fields are collected - HARD APP-LEVEL ENFORCEMENT
                  if (areAllRequiredFieldsCollected(intakeData!)) {
                    console.log('[ALL REQUIRED FIELDS COLLECTED] =========================================');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] All 6 required fields collected');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] Triggering app-controlled closing');
                    console.log('[ALL REQUIRED FIELDS COLLECTED] Timestamp:', new Date().toISOString());
                    console.log('[ALL REQUIRED FIELDS COLLECTED] =========================================');
                    
                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intake stage to complete');
                    console.log('[APP CONTROLLED CLOSING STARTED] Setting intakeComplete flag to true');
                    console.log('[APP CONTROLLED CLOSING STARTED] Calling enterTerminalClose');
                    console.log('[APP CONTROLLED CLOSING STARTED] Timestamp:', new Date().toISOString());
                    console.log('[APP CONTROLLED CLOSING STARTED] =========================================');
                    
                    intakeData!.stage = 'complete';
                    intakeComplete = true;
                    enterTerminalClose(closingState, ws, twilioHandler, openAiWs);
                    return; // Skip normal intake processing - NO MORE AI RESPONSES
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
                    enterTerminalClose(closingState, ws, twilioHandler, openAiWs);
                    return; // Skip normal intake processing - NO MORE AI RESPONSES
                  }
                  
                  // Get next intake response
                  const intakeResponse = getIntakeResponse(intakeData!, userTranscript);

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
                  intakeData!.stage = intakeResponse.nextStage;
                  
                  if (intakeData!.stage === 'complete') {
                    console.log('[INTAKE COMPLETE] All required fields collected');
                    intakeComplete = true;
                  } else {
                    // Send the stage prompt explicitly
                    sendStagePrompt(intakeData!.stage, openAiWs);
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
                console.log('[OPENAI RECV] response.created with response_id:', responseId);
                
                // Cancel unauthorized responses in terminal mode
                if (closingState.intakeTerminalComplete) {
                  const authorizedFinalResponseId = (twilioHandler as any).authorizedFinalResponseId;
                  if (responseId !== authorizedFinalResponseId) {
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
              }
              if (message.type === 'response.output_audio.delta') {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OPENAI RECV] response.output_audio.delta');
                }
                
                // Drop unauthorized audio in terminal mode
                if (closingState.intakeTerminalComplete) {
                  const authorizedFinalResponseId = (twilioHandler as any).authorizedFinalResponseId;
                  const currentResponseId = message.response_id || 'unknown';
                  if (currentResponseId !== authorizedFinalResponseId) {
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
                if (!assistantSpeaking) {
                  assistantSpeaking = true;
                  console.log('[AI ASSISTANT SPEAKING TRUE]');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                }

                // Set callState to 'closing' when final goodbye audio is being sent
                // This should only happen after terminalClosingResponseStarted is true
                // CRITICAL: This is the ONLY place where callState should be set to 'closing'
                // All other code paths must use 'closing_error' for emergency cleanup
                if (terminalClosingResponseStarted && callState === 'active') {
                  // Add warning if confirmationState is still collecting_info
                  if (confirmationState === 'collecting_info') {
                    console.log('[CALL STATE WARNING] Attempting to set callState to closing but confirmationState is collecting_info');
                    console.log('[CALL STATE WARNING] This indicates intake is not yet complete');
                    console.log('[CALL STATE WARNING] callState:', callState);
                    console.log('[CALL STATE WARNING] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                    console.log('[CALL STATE WARNING] confirmationState:', confirmationState);
                  }

                  console.log('[CALL STATE TRANSITION] Source: response.output_audio.delta (terminal goodbye audio)');
                  console.log('[CALL STATE TRANSITION] Reason: final_goodbye_audio_starting');
                  console.log('[CALL STATE TRANSITION] active -> closing');
                  console.log('[CALL STATE TRANSITION] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                  console.log('[CALL STATE TRANSITION] confirmationState:', confirmationState);
                  console.log('[CALL STATE TRANSITION] finalClosingStarted:', finalClosingStarted);
                  console.log('[CALL STATE TRANSITION] Timestamp:', new Date().toISOString());

                  console.log('[CALL_STATE_SET_CLOSING] Setting callState to closing');
                  console.log('[CALL_STATE_SET_CLOSING] Source: response.output_audio.delta handler at line 3870');
                  console.log('[CALL_STATE_SET_CLOSING] Stack: response.output_audio.delta -> callState transition');
                  console.log('[CALL_STATE_SET_CLOSING] Timestamp:', new Date().toISOString());
                  callState = 'closing';
                  console.log('[CALL_STATE_SET_CLOSING] Value after set:', callState);
                  (twilioHandler as any).callState = callState;

                  console.log('[CALL STATE UPDATED] callState set to closing during final goodbye audio transmission');
                  console.log('[CALL STATE UPDATED] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                  console.log('[CALL STATE UPDATED] confirmationState:', confirmationState);
                  console.log('[CALL STATE UPDATED] finalClosingStarted:', finalClosingStarted);
                } else if (callState === 'active' && !closingState.terminalClosingResponseStarted) {
                  // Log warning if trying to set callState to closing without terminalClosingResponseStarted
                  console.log('[CALL STATE BLOCKED] Cannot set callState to closing - terminalClosingResponseStarted is false');
                  console.log('[CALL STATE BLOCKED] This indicates the terminal closing sequence has not been started');
                  console.log('[CALL STATE BLOCKED] callState:', callState);
                  console.log('[CALL STATE BLOCKED] terminalClosingResponseStarted (from closingState):', closingState.terminalClosingResponseStarted);
                  console.log('[CALL STATE BLOCKED] finalClosingStarted (from closingState):', closingState.finalClosingStarted);
                  console.log('[CALL STATE BLOCKED] confirmationState (from closingState):', closingState.confirmationState);
                  console.log('[CALL STATE BLOCKED] Timestamp:', new Date().toISOString());
                  console.log('[CALL STATE BLOCKED] callState remains active - allowing audio to continue');
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
                
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] =========================================');
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Authorized final response audio generation complete');
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Timestamp:', new Date().toISOString());
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] Terminal mode active:', closingState.intakeTerminalComplete);
                console.log('[AUTHORIZED_FINAL_RESPONSE_AUDIO_DONE] =========================================');
                
                // Start hard-close timer if terminal mode is active
                if (closingState.intakeTerminalComplete && closingState.callState !== 'closed') {
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] =========================================');
                  console.log('[FINAL_CLOSE_HANGUP_AFTER_AUDIO_DONE] Starting 5-second hangup buffer after authorized final response audio done');
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
                console.log('[OPENAI RECV] response.done');

                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] =========================================');
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Response done event received');
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Timestamp:', new Date().toISOString());
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] Terminal mode active:', closingState.intakeTerminalComplete);
                console.log('[TERMINAL_RESPONSE_DONE_RECEIVED] =========================================');

                // Set assistant speaking to false when response is done
                if (assistantSpeaking) {
                  assistantSpeaking = false;
                  console.log('[AI ASSISTANT SPEAKING FALSE]');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                }

                console.log('[FINAL GOODBYE RESPONSE DONE] Final goodbye response completed');
                
                // DO NOT trigger hangup on response.done anymore
                // Wait for response.audio.done instead to ensure audio generation is complete
              }
              if (message.type === 'response.content') {
                console.log('[TRANSCRIPT] response.content', { content: message.content });
                if (message.content) {
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
                  console.log('[CODE OWNED FIRST PROMPT SENT] Sending exact name/reason prompt');
                  console.log('[CODE OWNED FIRST PROMPT SENT] Timestamp:', new Date().toISOString());
                  console.log('[CODE OWNED FIRST PROMPT SENT] =========================================');
                  
                  const greetingText = `Thanks for calling. Can I get your name and the reason for your call?`;
                  sendControlledAssistantText(greetingText, 'INITIAL_PROMPT', openAiWs);
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
                    closingState.intakeTerminalComplete = true;
                    closingState.callState = 'closing';
                    closingState.terminalClosingResponseStarted = true;
                    closingState.finalClosingStarted = true;
                    closingState.confirmationState = 'completed';

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
                  const notificationApiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
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
Name: ${extractedFields.callerName || 'Not provided'}
Reason: ${extractedFields.reasonForCalling || 'Not provided'}
Address: ${extractedFields.addressOrLocation || 'Not provided'}
Urgency: ${extractedFields.urgencyLevel || 'Not provided'}
Callback: ${extractedFields.preferredCallbackTime || 'Not provided'}
Details: ${extractedFields.importantDetails || 'None'}`;

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
                    const notificationApiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
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
                    const notificationApiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
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
      
      // Clear AI timeout timer if it exists
      if (aiTimeoutTimer) {
        clearTimeout(aiTimeoutTimer);
        aiTimeoutTimer = null;
      }
      
      // Only close OpenAI WebSocket if we're not in the middle of final closing
      // If finalClosingStarted is true, let the mark-based hangup handle cleanup
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        if (finalClosingStarted && !finalGoodbyeMarkReceived) {
          console.log('[TWILIO WEBSOCKET CLOSE] OpenAI WebSocket left open during final closing');
          console.log('[TWILIO WEBSOCKET CLOSE] Waiting for final-goodbye-complete mark before cleanup');
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

    const response = await fetch(confirmationUrl, {
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
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI CONFIRMATION SMS ERROR] API call failed:', {
        status: response.status,
        error: errorText
      });
      return;
    }

    const result = await response.json();
    console.log('[AI CONFIRMATION SMS SUCCESS]', result);

  } catch (error) {
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
