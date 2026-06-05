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
type IntakeStage = 'ask_name' | 'ask_service' | 'ask_issue' | 'ask_address' | 'ask_callback_time' | 'ask_urgency' | 'ask_callback_number' | 'confirmation' | 'complete';

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
  callbackTime?: string;
  urgency?: 'urgent' | 'normal' | 'not_specified';
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

// Intake state machine functions
function getMissingRequiredFields(intake: IntakeData): string[] {
  const missing: string[] = [];
  if (!intake.customerName) missing.push('customer name');
  if (!intake.serviceRequested) missing.push('service requested');
  if (!intake.issueDescription) missing.push('issue description');
  if (!intake.serviceAddress) missing.push('service address');
  if (!intake.callbackTime) missing.push('callback time');
  if (!intake.urgency) missing.push('urgency');
  if (!intake.callbackNumber) missing.push('callback number');
  return missing;
}

function createIntakeData(businessName: string, callSid: string, businessId: string, sessionId: string): IntakeData {
  return {
    stage: 'ask_name',
    businessName,
    callSid,
    businessId,
    sessionId,
    startTime: Date.now()
  };
}

function generateConfirmationMessage(intake: IntakeData): string {
  console.log('[CONFIRMATION DATA] Creating confirmation message with collected data:', {
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    callbackTime: intake.callbackTime,
    urgency: intake.urgency,
    callbackNumber: intake.callbackNumber
  });

  const name = intake.customerName || 'there';
  const service = intake.serviceRequested || 'your inquiry';
  const issue = intake.issueDescription || 'not specified';
  const location = intake.serviceAddress || 'not specified';
  const callbackTime = intake.callbackTime || 'anytime';
  const urgency = intake.urgency === 'urgent' ? 'urgent' : (intake.urgency === 'normal' ? 'not urgent' : 'not specified');
  const callbackNumber = intake.callbackNumber || 'not specified';

  console.log('[AI REQUIRED FIELDS STATUS]', {
    hasCustomerName: !!intake.customerName,
    hasServiceRequested: !!intake.serviceRequested,
    hasIssueDescription: !!intake.issueDescription,
    hasServiceAddress: !!intake.serviceAddress,
    hasCallbackTime: !!intake.callbackTime,
    hasUrgency: !!intake.urgency,
    hasCallbackNumber: !!intake.callbackNumber,
    allRequired: !!(intake.customerName && intake.serviceRequested && intake.issueDescription && intake.serviceAddress && intake.callbackTime && intake.urgency && intake.callbackNumber)
  });

  const confirmation = `Let me confirm I have everything correct.

Your name is ${name}.

You're calling about ${service}.

Additional details: ${issue}.

The work location is ${location}.

The best time to call you back is ${callbackTime}.

This is ${urgency}.

The best number to reach you is ${callbackNumber}.

Is that correct?`;

  console.log('[AI FINAL CONFIRMATION READY]', { confirmation });
  console.log('[CONFIRMATION GENERATED] Generated confirmation message:', confirmation);
  console.log('[CONFIRMATION GENERATED] confirmationState: pending');
  return confirmation;
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

  switch (intake.stage) {
    case 'ask_name':
      // Check if name was captured
      if (intake.customerName && intake.customerName.length > 1) {
        return {
          response: 'What can we help you with today?',
          nextStage: 'ask_service'
        };
      }
      // Ask for name again if not captured
      return {
        response: 'May I have your name?',
        nextStage: 'ask_name'
      };

    case 'ask_service':
      // Check if service was captured
      if (intake.serviceRequested) {
        return {
          response: 'Could you tell me a little more about the issue?',
          nextStage: 'ask_issue'
        };
      }
      // Ask for service again if not captured
      return {
        response: 'What can we help you with today?',
        nextStage: 'ask_service'
      };

    case 'ask_issue':
      // Check if issue description was captured and is valid
      if (intake.issueDescription && isValidIssueDescription(intake.issueDescription, intake.serviceRequested)) {
        return {
          response: 'Is this urgent or time-sensitive?',
          nextStage: 'ask_urgency'
        };
      }
      // Ask for issue detail again if not captured or invalid
      return {
        response: 'Could you tell me a little more about the issue?',
        nextStage: 'ask_issue'
      };

    case 'ask_address':
      // Check if address was captured
      if (intake.serviceAddress) {
        return {
          response: 'What is the best time for someone to follow up with you?',
          nextStage: 'ask_callback_time'
        };
      }
      // Ask for address again if not captured
      return {
        response: 'What is the service address or location?',
        nextStage: 'ask_address'
      };

    case 'ask_callback_time':
      // Check if callback time was captured
      if (intake.callbackTime) {
        return {
          response: 'Is this urgent, or can it wait until later?',
          nextStage: 'ask_urgency'
        };
      }
      // Ask for callback time again if not captured
      return {
        response: 'What is the best time for someone to follow up with you?',
        nextStage: 'ask_callback_time'
      };

    case 'ask_urgency':
      // Check if urgency was captured
      if (intake.urgency && intake.urgency !== 'not_specified') {
        return {
          response: 'What is the service address or location?',
          nextStage: 'ask_address'
        };
      }
      // Ask for urgency again if not captured
      return {
        response: 'Is this urgent, or can it wait until later?',
        nextStage: 'ask_urgency'
      };

    case 'ask_callback_number':
      // Check if callback number was captured
      if (intake.callbackNumber) {
        return {
          response: generateConfirmationMessage(intake),
          nextStage: 'confirmation'
        };
      }
      // Ask for callback number again if not captured
      return {
        response: 'Is this the best number to reach you at, or is there another number?',
        nextStage: 'ask_callback_number'
      };

    case 'confirmation':
      // Check if all required fields are collected
      if (missingFields.length > 0) {
        console.log('[INTAKE INCOMPLETE] Missing fields before confirmation:', missingFields);
        // Ask for the first missing field
        return getResponseForMissingField(missingFields[0], intake);
      }
      // Generate confirmation message with collected information
      const confirmationMessage = generateConfirmationMessage(intake);
      console.log('[CONFIRMATION RESPONSE SENT] Sending confirmation message to caller');
      console.log('[CONFIRMATION RESPONSE SENT] confirmationState: pending_user_response');
      return {
        response: confirmationMessage,
        nextStage: 'complete'
      };

    case 'complete':
      return {
        response: 'Perfect. I\'ll pass this along and someone will follow up with you shortly. Thank you for calling. Have a great day.',
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

  // Extract name if not already captured
  if (!intake.customerName) {
    const name = extractName(transcript);
    if (name && name.length > 1) {
      intake.customerName = name;
      console.log('[AI NAME CAPTURED]', intake.customerName);
    }
  }

  // Extract service requested (simple keyword matching)
  if (!intake.serviceRequested) {
    const serviceKeywords = ['plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control', 'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors', 'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage', 'junk removal', 'grass cutting', 'mowing', 'lawn care'];
    const foundService = serviceKeywords.find(keyword => lowerTranscript.includes(keyword));
    if (foundService) {
      intake.serviceRequested = foundService.charAt(0).toUpperCase() + foundService.slice(1);
      console.log('[AI SERVICE CAPTURED]', intake.serviceRequested);
    }
  }

  // Extract urgency if not already captured
  if (!intake.urgency) {
    const urgency = extractUrgency(transcript);
    if (urgency !== 'not_specified') {
      intake.urgency = urgency;
      console.log('[AI URGENCY CAPTURED]', intake.urgency);
    }
  }

  // Extract callback number if not already captured
  if (!intake.callbackNumber) {
    const phoneNumber = extractPhoneNumber(transcript);
    if (phoneNumber) {
      intake.callbackNumber = phoneNumber;
      console.log('[AI CALLBACK NUMBER CAPTURED]', intake.callbackNumber);
    }
  }

  // Only set issue description if transcript has substantial detail beyond service category
  if (!intake.issueDescription && transcript.trim().length > 20) {
    // Check if this is just a simple service request (don't set issueDescription)
    const simpleServicePatterns = [
      /^i need (plumbing|hvac|electrical|landscaping|roofing|cleaning|pest control|painting|carpentry|masonry|excavation|concrete|windows|doors|insulation|solar|security|fencing|deck|pool|moving|storage|junk removal|grass cutting|mowing|lawn care)/i,
      /^help with (plumbing|hvac|electrical|landscaping|roofing|cleaning|pest control|painting|carpentry|masonry|excavation|concrete|windows|doors|insulation|solar|security|fencing|deck|pool|moving|storage|junk removal|grass cutting|mowing|lawn care)/i,
      /^(plumbing|hvac|electrical|landscaping|roofing|cleaning|pest control|painting|carpentry|masonry|excavation|concrete|windows|doors|insulation|solar|security|fencing|deck|pool|moving|storage|junk removal|grass cutting|mowing|lawn care)/i
    ];

    const isSimpleServiceRequest = simpleServicePatterns.some(pattern => pattern.test(transcript.trim()));

    if (!isSimpleServiceRequest) {
      intake.issueDescription = transcript.trim();
      console.log('[AI ISSUE DESCRIPTION CAPTURED]', intake.issueDescription);
    } else {
      console.log('[AI ISSUE DESCRIPTION SKIPPED] Simple service request detected, not setting issueDescription');
    }
  }
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
      return {
        response: 'May I have your name?',
        nextStage: 'ask_service'
      };
    case 'service requested':
      return {
        response: 'What can we help you with today?',
        nextStage: 'ask_issue'
      };
    case 'issue description':
      return {
        response: 'Could you tell me a little more about the issue?',
        nextStage: 'ask_urgency'
      };
    case 'urgency':
      return {
        response: 'Is this urgent, or can it wait until later?',
        nextStage: 'ask_address'
      };
    case 'service address':
      return {
        response: 'What is the service address or location?',
        nextStage: 'ask_callback_time'
      };
    case 'callback time':
      return {
        response: 'What is the best time for someone to follow up with you?',
        nextStage: 'ask_callback_number'
      };
    case 'callback number':
      return {
        response: 'Is this the best number to reach you at, or is there another number?',
        nextStage: 'confirmation'
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

function isConfirmationAccepted(transcript: string): boolean {
  const confirmationWords = [
    'yes', 'yeah', 'yep', 'correct', 'that\'s right', 'that is right', 
    'right', 'sounds good', 'good', 'perfect', 'exactly', 'affirmative',
    'that\'s correct', 'that is correct', 'confirmed', 'confirm',
    'thanks', 'thank you', 'thank', 'okay', 'ok', 'alright', 'sure'
  ];
  
  const lowerTranscript = transcript.toLowerCase().trim();
  const isAccepted = confirmationWords.some(word => lowerTranscript.includes(word));
  
  console.log('[CONFIRMATION INTERPRETED]', {
    transcript: transcript,
    lowerTranscript: lowerTranscript,
    isAccepted: isAccepted,
    reason: isAccepted ? 'positive_confirmation' : 'not_positive'
  });
  
  if (isAccepted) {
    console.log('[CONFIRMATION POSITIVE]', {
      transcript: transcript,
      matchedWords: confirmationWords.filter(word => lowerTranscript.includes(word))
    });
  }
  
  return isAccepted;
}

function isConfirmationRejected(transcript: string): boolean {
  const rejectionWords = [
    'no', 'incorrect', 'not right', 'that\'s wrong', 'that is wrong',
    'change that', 'actually', 'that\'s not right', 'that is not right',
    'wrong', 'mistake', 'incorrect', 'not correct'
  ];
  
  const lowerTranscript = transcript.toLowerCase().trim();
  const isRejected = rejectionWords.some(word => lowerTranscript.includes(word));
  
  console.log('[CONFIRMATION INTERPRETED]', {
    transcript: transcript,
    lowerTranscript: lowerTranscript,
    isRejected: isRejected,
    reason: isRejected ? 'negative_confirmation' : 'not_negative'
  });
  
  if (isRejected) {
    console.log('[CONFIRMATION NEGATIVE]', {
      transcript: transcript,
      matchedWords: rejectionWords.filter(word => lowerTranscript.includes(word))
    });
  }
  
  return isRejected;
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
        sender: 'system',
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
          sender: 'business',
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
        sender: 'system',
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
  const summary = `${intake.customerName || 'Caller'} called about ${intake.serviceRequested || 'general inquiry'}. Issue: ${intake.issueDescription || 'not specified'}. Location: ${intake.serviceAddress || 'not specified'}. ${intake.urgency === 'urgent' ? 'URGENT: ' : ''}Callback requested at ${intake.callbackTime || 'anytime'}.`;

  return {
    callerName: intake.customerName,
    callbackNumber: undefined,
    reason: intake.serviceRequested,
    urgency: intake.urgency || 'normal',
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

// Close call after confirmation function
async function closeCallAfterConfirmation(ws: any, twilioHandler: any, openAiWs: any) {
  console.log('[AI CONFIRMATION ACCEPTED - CLOSING] Starting deterministic closing sequence');
  
  // Set closing state immediately
  const callState = (ws as any).callState;
  (ws as any).callState = 'closing';
  (twilioHandler as any).callState = 'closing';
  (ws as any).terminalClosingResponseStarted = true;
  (twilioHandler as any).terminalClosingResponseStarted = true;
  (ws as any).intakeComplete = true;
  (twilioHandler as any).intakeComplete = true;
  
  console.log('[AI CLOSING STATE SET] callState: closing, terminalClosingResponseStarted: true, intakeComplete: true');
  
  // Send final goodbye message immediately
  const finalClosingMessage = {
    type: 'response.create',
    response: {
      instructions: `Say exactly: "Perfect. I'll pass this information along and someone will follow up with you soon. Thanks for calling."`
    }
  };

  if (openAiWs) {
    openAiWs.send(JSON.stringify(finalClosingMessage));
    console.log('[AI FINAL GOODBYE CREATE SENT] Final closing message sent to OpenAI');
  }

  // Immediately schedule hangup timer
  const hangupScheduled = (ws as any).hangupScheduled;
  if (!hangupScheduled) {
    console.log('[AI HANGUP TIMER SCHEDULED] Scheduling hangup after 1500ms');
    (ws as any).hangupScheduled = true;
    (twilioHandler as any).hangupScheduled = true;
    
    setTimeout(async () => {
      await endCallCleanly(ws, twilioHandler);
    }, 1500); // 1500ms buffer
  }
}

// Clean call ending function
async function endCallCleanly(ws: any, twilioHandler: any) {
  console.log('[AUTO HANGUP START] Starting call termination process');
  console.log('[AI FINAL AUDIO DONE] Final goodbye audio completed, initiating hangup');
  
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
      console.log('[TWILIO HANGUP ATTEMPT] Using Twilio REST API to terminate call', {
        callSid,
        businessId,
        sessionId,
        twilioAccountSid,
        method: 'REST API calls.update',
        targetStatus: 'completed',
        timestamp: new Date().toISOString()
      });
      
      // Execute the hangup
      const updateResult = await twilioClient.calls(callSid).update({ status: 'completed' });
      
      console.log('[TWILIO HANGUP SUCCESS] Call terminated successfully via Twilio REST API', {
        callSid,
        businessId,
        sessionId,
        method: 'REST API',
        resultStatus: updateResult.status,
        resultDateCreated: updateResult.dateCreated,
        resultDateUpdated: updateResult.dateUpdated,
        resultPrice: updateResult.price,
        resultPriceUnit: updateResult.priceUnit,
        timestamp: new Date().toISOString()
      });
      
      // Verify the call status changed
      if (updateResult.status === 'completed') {
        console.log('[TWILIO HANGUP SUCCESS] Call status confirmed as completed');
      } else {
        console.log('[TWILIO HANGUP ERROR] Call status not confirmed as completed', {
          actualStatus: updateResult.status,
          callSid,
          businessId
        });
      }
      
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
    type CallState = 'active' | 'closing' | 'closing_audio_playing' | 'closed';
    let callState: CallState = 'active';
    let finalClosingStarted = false;
    let finalClosingAudioDone = false;
    let hangupScheduled = false;
    let postCallSmsSent = false;
    let assistantSpeaking = false;
    let terminalClosingResponseStarted = false;

    let intakeComplete = false;
    let confirmationAccepted = false;

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

    // Pass state variables to twilioHandler for audio append guards
    (twilioHandler as any).callState = callState;
    (twilioHandler as any).assistantSpeaking = assistantSpeaking;

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
      console.log('[INGEST CALL DATA ENTER] Function called');
      
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
          
          // Create follow-up jobs directly using Supabase (empty transcript path)
          console.log('[FOLLOWUP DIRECT INSERT START - PATH-B]', { 
            businessId: sessionBusinessId, 
            leadId: null,
            conversationId: null
          });
          
          try {
            const { error: followUpError } = await supabase
              .from('follow_up_jobs')
              .insert({
                business_id: sessionBusinessId,
                lead_id: null,
                conversation_id: null,
                status: 'pending',
                scheduled_for: new Date().toISOString(),
                created_at: new Date().toISOString()
              });
            
            if (followUpError) {
              console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-B]', followUpError);
            } else {
              console.log('[FOLLOWUP DIRECT INSERT SUCCESS - PATH-B]', { 
                businessId: sessionBusinessId
              });
            }
          } catch (followUpError) {
            console.log('[FOLLOWUP DIRECT INSERT ERROR - PATH-B]', followUpError);
          }
          console.log('[FOLLOWUP DIRECT INSERT COMPLETE - PATH-B]');
          
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
              status: 'ai_completed',
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

        // Create follow-up jobs directly using Supabase
        console.log('[ACTIVE PATH FOLLOWUP START]', { 
          businessId: sessionBusinessId, 
          leadId: lead.id,
          conversationId: conversation.id
        });
        
        try {
          const idempotencyKey = `${lead.id}-ai-intake-1`;
          
          // Fetch business to get name and automation settings
          const { data: business, error: businessError } = await supabase
            .from('businesses')
            .select('name, automation_settings')
            .eq('id', sessionBusinessId)
            .single();
          
          let messageBody: string;
          
          if (!businessError && business) {
            const businessName = business.name || 'your business';
            const automationSettings = business.automation_settings || {};
            const followUpSettings = automationSettings.followUps;
            
            // Check if there's a configured follow-up template
            if (followUpSettings && followUpSettings.followUps && followUpSettings.followUps.length > 0) {
              const firstFollowUp = followUpSettings.followUps[0];
              if (firstFollowUp.enabled && firstFollowUp.message) {
                messageBody = firstFollowUp.message.replace('{{businessName}}', businessName);
              } else {
                messageBody = `Hi, this is ${businessName}. Just checking in — would you still like help?`;
              }
            } else {
              messageBody = `Hi, this is ${businessName}. Just checking in — would you still like help?`;
            }
          } else {
            // Fallback if business fetch fails
            messageBody = `Hi, this is from your business. Just checking in — would you still like help?`;
          }
          
          const followUpPayload = {
            lead_id: lead.id,
            business_id: sessionBusinessId,
            conversation_id: conversation.id,
            message_body: messageBody,
            status: 'pending',
            scheduled_for: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
            idempotency_key: idempotencyKey,
            step: 1,
            created_at: new Date().toISOString()
          };
          
          console.log('[ACTIVE PATH FOLLOWUP PAYLOAD]', { 
            keys: Object.keys(followUpPayload),
            businessId: sessionBusinessId, 
            leadId: lead.id,
            messageBody: messageBody
          });
          
          const { error: followUpError } = await supabase
            .from('follow_up_jobs')
            .insert(followUpPayload);
          
          if (followUpError) {
            console.log('[ACTIVE PATH FOLLOWUP ERROR]', { 
              error: followUpError,
              code: followUpError.code,
              message: followUpError.message,
              details: followUpError.details
            });
          } else {
            console.log('[ACTIVE PATH FOLLOWUP SUCCESS]', { 
              businessId: sessionBusinessId, 
              leadId: lead.id
            });
          }
        } catch (followUpError) {
          console.log('[ACTIVE PATH FOLLOWUP ERROR]', followUpError);
        }
        
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
        await sendAIConfirmationSMS(
          sessionBusinessId,
          lead.id,
          conversation.id,
          sessionCallSid || 'unknown',
          sessionCallerPhone || 'unknown',
          extractedFields
        );

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
            extracted_info: null,
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

            // Send confirmation SMS after successful AI intake (fallback path)
            if (fallbackLead?.id && fallbackConversationId) {
              await sendAIConfirmationSMS(
                sessionBusinessId,
                fallbackLead.id,
                fallbackConversationId,
                sessionCallSid || 'unknown',
                sessionCallerPhone || 'unknown',
                null // No extracted info in fallback path
              );
            }

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
          // Safety fallback: ignore audio during closing
          if (callState === 'closing') {
            console.log('[AI IGNORING AUDIO DURING CLOSING] callState is closing, dropping audio packet');
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
            
            // Confirmation timeout fallback
            let confirmationAskedAt: number | null = null;
            let confirmationTimeoutTimer: NodeJS.Timeout | null = null;
            let waitingForConfirmation: boolean = false;
            
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
1. Reason for calling (most important - understand the core need)
2. Caller name (for personalization)
3. Additional details about the issue or project
4. Whether it is urgent or time-sensitive
5. Address or service location (where the work is needed)
6. Best time to call back
7. Best callback number

CALL COMPLETION POLICY:
YOU MUST collect ALL required fields before finalizing. Do not end the call early:
- Reason for calling (required)
- Caller name (required)
- Additional details about the issue or project (required)
- Address or service location (required - if caller declines, mark as "Not provided")
- Best time to call back (required - if caller says anytime/no preference, mark as "Anytime")
- Whether it is urgent or time-sensitive (required - if caller doesn't know, mark as "Not specified")
- Best callback number (required - even if caller ID exists, ask: "Is this the best number to reach you at, or is there another number?")

YOU MUST collect all 7 required fields before finalizing. Do not end the call early.

CALL ENDING SEQUENCE:
Once you have collected ALL 7 required fields, you MUST get confirmation before ending the call:

1. Say exactly: "Let me confirm I have everything correct. Your name is [caller_name]. You're calling about [reason]. Additional details: [additional_details]. The work location is [location]. The best time to call you back is [callback_time]. This is [urgency]. The best number to reach you is [callback_number]. Is that correct?"
2. WAIT for caller confirmation (yes, correct, sounds good, etc.)
3. If confirmed, say exactly: "Perfect. I'll pass this along and someone will follow up with you shortly. Thank you for calling. Have a great day."
4. Do NOT ask any more questions after the final goodbye.

IMPORTANT: You MUST get confirmation before the final goodbye. Do not skip the confirmation step.

CLEAN CALL ENDING:
Once intake is complete and you've said the final closing message:
- If the caller says thanks, goodbye, okay, sounds good, or similar: do not continue the conversation. Do not restart confirmation. End the call cleanly.
- If the caller stays silent: end the call after a short silence window.
- Do not ask another intake question once intake is complete.

AWKWARD LOOP PREVENTION:
Do NOT ask:
- "Anything else?"
- "How else can I help?"
- "Is there anything else I can help you with?"
- "Do you have any other questions?"
- Repeating the same question
- Unnecessary details

CALLER CLOSING SIGNALS:
If caller says goodbye, thanks, that's all, okay, sounds good, or similar:
- Acknowledge briefly: "Thank you for calling, have a great day."
- Close immediately without asking more questions

EXAMPLE: "Thank you for calling, have a great day."

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
- Even if caller ID exists, still ask: "Is this the best number to reach you at, or is there another number?"
- Address is always required for service businesses; if declined, store "Not provided"
- Urgency is always required; ask "Is this urgent or time-sensitive?"
- Best callback time is always required; "anytime" is valid
- Additional details about the issue or project is always required

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
                        create_response: true
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
                    waitingForConfirmation, 
                    transcript: userTranscript 
                  });
                  
                  // Emergency fallback: if waiting for confirmation and any user audio comes in, close the call
                  if (waitingForConfirmation) {
                    console.log('[AI CONFIRMATION FALLBACK TRIGGERED] User audio detected while waiting for confirmation, closing call');
                    waitingForConfirmation = false; // Prevent multiple triggers
                    closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                    return; // Skip all other processing
                  }
                  
                  // Check for confirmation phrases and intercept immediately
                  if (waitingForConfirmation && userTranscript) {
                    const confirmationPhrases = ['yes', 'correct', 'yep', "that's right", 'that is right', 'sounds good', 'right', 'confirm'];
                    const isConfirmation = confirmationPhrases.some(phrase => 
                      userTranscript.toLowerCase().includes(phrase)
                    );
                    
                    if (isConfirmation) {
                      console.log('[AI CONFIRMATION DETECTED IN TRANSCRIPT] Intercepting confirmation at conversation.item.created');
                      waitingForConfirmation = false; // Prevent multiple triggers
                      closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      return; // Skip all other processing
                    }
                  }
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
                    waitingForConfirmation, 
                    transcript: userTranscript 
                  });
                  
                  // Emergency fallback: if waiting for confirmation and any user audio comes in, close the call
                  if (waitingForConfirmation) {
                    console.log('[AI CONFIRMATION FALLBACK TRIGGERED] User audio detected while waiting for confirmation, closing call');
                    waitingForConfirmation = false; // Prevent multiple triggers
                    closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                    return; // Skip all other processing
                  }
                  
                  // Check for confirmation phrases and intercept immediately
                  if (waitingForConfirmation && userTranscript) {
                    const confirmationPhrases = ['yes', 'correct', 'yep', "that's right", 'that is right', 'sounds good', 'right', 'confirm'];
                    const isConfirmation = confirmationPhrases.some(phrase => 
                      userTranscript.toLowerCase().includes(phrase)
                    );
                    
                    if (isConfirmation) {
                      console.log('[AI CONFIRMATION DETECTED IN TRANSCRIPT] Intercepting confirmation at conversation.item.done');
                      waitingForConfirmation = false; // Prevent multiple triggers
                      closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      return; // Skip all other processing
                    }
                  }
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
                    waitingForConfirmation, 
                    transcript: userTranscript 
                  });
                  
                  // Emergency fallback: if waiting for confirmation and any user audio comes in, close the call
                  if (waitingForConfirmation) {
                    console.log('[AI CONFIRMATION FALLBACK TRIGGERED] User audio detected while waiting for confirmation, closing call');
                    waitingForConfirmation = false; // Prevent multiple triggers
                    closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                    return; // Skip all other processing
                  }
                  
                  // Check for confirmation phrases and intercept immediately
                  if (waitingForConfirmation && userTranscript) {
                    const confirmationPhrases = ['yes', 'correct', 'yep', "that's right", 'that is right', 'sounds good', 'right', 'confirm'];
                    const isConfirmation = confirmationPhrases.some(phrase => 
                      userTranscript.toLowerCase().includes(phrase)
                    );
                    
                    if (isConfirmation) {
                      console.log('[AI CONFIRMATION DETECTED IN TRANSCRIPT] Intercepting confirmation at conversation.item.completed');
                      waitingForConfirmation = false; // Prevent multiple triggers
                      closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      return; // Skip all other processing
                    }
                  }
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
                    waitingForConfirmation, 
                    transcript: userTranscript 
                  });
                  
                  // Emergency fallback: if waiting for confirmation and any user audio comes in, close the call
                  if (waitingForConfirmation) {
                    console.log('[AI CONFIRMATION FALLBACK TRIGGERED] User audio detected while waiting for confirmation, closing call');
                    waitingForConfirmation = false; // Prevent multiple triggers
                    closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                    return; // Skip all other processing
                  }
                  
                  // Check for confirmation phrases and intercept immediately
                  if (waitingForConfirmation) {
                    const confirmationPhrases = ['yes', 'correct', 'yep', "that's right", 'that is right', 'sounds good', 'right', 'confirm'];
                    const isConfirmation = confirmationPhrases.some(phrase => 
                      userTranscript.toLowerCase().includes(phrase)
                    );
                    
                    if (isConfirmation) {
                      console.log('[AI CONFIRMATION DETECTED IN TRANSCRIPT] Intercepting confirmation at transcript handler');
                      waitingForConfirmation = false; // Prevent multiple triggers
                      closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      return; // Skip all other processing
                    }
                  }
                  
                  // Check for goodbye phrases after final message
                  if (callState === 'closing' || callState === 'closing_audio_playing') {
                    console.log('[AI CLOSING IGNORE USER AUDIO] Ignoring caller audio during closing state');
                    console.log('[AI CLOSING IGNORE USER AUDIO] callState:', callState);
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
                  console.log('[AI USER TRANSCRIPT ROUTER]', { 
                    currentStage: intakeData.stage, 
                    intakeComplete: intakeComplete, 
                    waitingForConfirmation: intakeData.stage === 'confirmation', 
                    transcript: userTranscript 
                  });
                  console.log('[INTAKE COMPLETION CHECK] Processing intake stage:', intakeData.stage);
                  console.log('[INTAKE COMPLETION CHECK] User transcript:', userTranscript);
                  console.log('[INTAKE COMPLETION CHECK] Session ready:', sessionReady);
                  
                  // Special handling for confirmation stage
                  if (intakeData!.stage === 'confirmation' && userTranscript) {
                    console.log('[CONFIRMATION REQUIRED] Processing user response for confirmation:', userTranscript);

                    // Pre-confirmation gate: validate issue description
                    console.log('[AI PRE CONFIRMATION VALIDATION] Checking issue description validity');
                    const isIssueValid = isValidIssueDescription(intakeData!.issueDescription || '', intakeData!.serviceRequested);

                    if (!isIssueValid) {
                      console.log('[AI BLOCKING CONFIRMATION - ISSUE DETAIL REQUIRED]', {
                        serviceRequested: intakeData!.serviceRequested,
                        issueDescription: intakeData!.issueDescription
                      });
                      console.log('[AI ISSUE DESCRIPTION INVALID] Blocking confirmation until valid issue description is provided');

                      // Ask for issue description
                      const followUpPayload = {
                        type: 'response.create',
                        response: {
                          instructions: 'Say exactly: "Could you tell me a little more about the issue or project?"'
                        }
                      };

                      if (openAiWs) {
                        openAiWs.send(JSON.stringify(followUpPayload));
                        console.log('[AI NEXT QUESTION SELECTED] Could you tell me a little more about the issue or project?');
                      }
                      return; // Skip normal intake processing
                    }

                    console.log('[AI ISSUE DESCRIPTION ACCEPTED] Issue description is valid');

                    if (isConfirmationAccepted(userTranscript)) {
                      console.log('[CONFIRMATION ACCEPTED] User confirmed the information');
                      console.log('[CONFIRMATION ACCEPTED] confirmationState: accepted');

                      // Immediately close the call after confirmation (deterministic)
                      closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      return; // Skip all other processing

                      // Check if all required fields are collected
                      const missingFields = getMissingRequiredFields(intakeData!);
                      if (missingFields.length > 0) {
                        console.log('[MISSING REQUIRED FIELDS]', { missingFields });
                        console.log('[INTAKE INCOMPLETE] Cannot finalize - missing required fields');

                        // Ask for the next missing field
                        const nextMissing = missingFields[0];
                        const followUpResponse = getResponseForMissingField(nextMissing, intakeData!);

                        const followUpPayload = {
                          type: 'response.create',
                          response: {
                            instructions: `Say exactly: "${followUpResponse.response}"`
                          }
                        };

                        if (openAiWs) {
                          openAiWs.send(JSON.stringify(followUpPayload));
                          console.log('[FOLLOW-UP SENT]', { field: nextMissing, message: followUpResponse.response });
                        }
                        return; // Skip normal intake processing
                      }

                      console.log('[CONFIRMATION ACCEPTED] User confirmed the information');
                      console.log('[CONFIRMATION ACCEPTED] confirmationState: accepted');
                      console.log('[AI CONFIRMATION ACCEPTED - CLOSING] Starting deterministic closing sequence');

                      // Set closing state immediately
                      callState = 'closing';
                      (twilioHandler as any).callState = callState;
                      terminalClosingResponseStarted = true;
                      (twilioHandler as any).terminalClosingResponseStarted = terminalClosingResponseStarted;
                      confirmationAccepted = true;
                      intakeComplete = true;
                      
                      console.log('[AI CLOSING STATE SET] callState: closing, terminalClosingResponseStarted: true, intakeComplete: true');
                      
                      // Mark as complete to prevent further processing
                      intakeData!.stage = 'complete';

                      // Send final goodbye message immediately
                      const finalClosingMessage = {
                        type: 'response.create',
                        response: {
                          instructions: `Say exactly: "Perfect. I'll pass this information along and someone will follow up with you soon. Thanks for calling."`
                        }
                      };

                      if (openAiWs) {
                        openAiWs.send(JSON.stringify(finalClosingMessage));
                        console.log('[AI FINAL GOODBYE CREATE SENT] Final closing message sent to OpenAI');
                      }

                      // Immediately schedule hangup timer
                      if (!hangupScheduled) {
                        console.log('[AI HANGUP TIMER SCHEDULED] Scheduling hangup after 1500ms');
                        hangupScheduled = true;
                        (twilioHandler as any).hangupScheduled = hangupScheduled;
                        
                        setTimeout(async () => {
                          await endCallCleanly(ws, twilioHandler);
                        }, 1500); // 1500ms buffer
                      }

                      return; // Skip the normal intake processing
                    } else if (isConfirmationRejected(userTranscript)) {
                      console.log('[CONFIRMATION REJECTED] User rejected the information');
                      console.log('[CONFIRMATION REJECTED] confirmationState: rejected');
                      // Handle rejection - ask for clarification
                      const clarificationMessage = {
                        type: 'response.create',
                        response: {
                          instructions: 'Say exactly: "I apologize. Let me try again. Could you please confirm if the information I provided is correct?"'
                        }
                      };
                      
                      if (openAiWs) {
                        openAiWs.send(JSON.stringify(clarificationMessage));
                        console.log('[CONFIRMATION REJECTED] Clarification message sent');
                      }
                      return; // Skip the normal intake processing
                    } else {
                      console.log('[CONFIRMATION UNCLEAR] User response unclear, asking for clarification');
                      console.log('[CONFIRMATION UNCLEAR] confirmationState: unclear');
                      // Handle unclear response - ask for clarification
                      const clarificationMessage = {
                        type: 'response.create',
                        response: {
                          instructions: 'Say exactly: "I apologize. Could you please confirm if the information I provided is correct? Please say yes or no."'
                        }
                      };
                      
                      if (openAiWs) {
                        openAiWs.send(JSON.stringify(clarificationMessage));
                        console.log('[CONFIRMATION UNCLEAR] Clarification message sent');
                      }
                      return; // Skip the normal intake processing
                    }
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
                    callbackTime: intakeData!.callbackTime,
                    urgency: intakeData!.urgency
                  });
                  console.log('[AI INTAKE MISSING FIELDS]', missingFields);
                  console.log('[AI NEXT QUESTION SELECTED]', intakeResponse.response);
                  console.log('[AI NEXT STAGE]', intakeResponse.nextStage);

                  // Check if issue description is required
                  if (!intakeData!.issueDescription && missingFields.includes('issue description')) {
                    console.log('[AI ISSUE DESCRIPTION REQUIRED] Issue description still missing');
                  }

                  // Let VAD handle responses naturally after session.updated greeting
                  console.log('[AI INTAKE] VAD will handle response naturally');
                  console.log('[AI INTAKE] advancing to stage:', intakeResponse.nextStage);

                  // Update stage
                  intakeData!.stage = intakeResponse.nextStage;
                  
                  // When confirmation message is sent, start the timer
                  if (intakeResponse.nextStage === 'confirmation' || intakeResponse.nextStage === 'complete') {
                    // Set stage to 'confirmation' so the timer can check it
                    intakeData!.stage = 'confirmation';
                    waitingForConfirmation = true;
                    console.log('[AI FINAL CONFIRMATION SENT] Final confirmation summary sent to caller');
                    console.log('[AI CONFIRMATION TIMER STARTED] Scheduling 20 second fallback timer');
                    confirmationAskedAt = Date.now();
                    if (confirmationTimeoutTimer) {
                      clearTimeout(confirmationTimeoutTimer);
                    }
                    confirmationTimeoutTimer = setTimeout(() => {
                      if (waitingForConfirmation && callState !== 'closing') {
                        console.log('[AI CONFIRMATION TIMEOUT FALLBACK CLOSING] 20 second timeout reached, closing call');
                        waitingForConfirmation = false; // Prevent multiple triggers
                        closeCallAfterConfirmation(ws, twilioHandler, openAiWs);
                      }
                    }, 20000); // 20 second timeout
                  }
                  
                  // Runtime guard: DO NOT allow final goodbye without confirmation
                  if (intakeData!.stage === 'complete' && !hangupScheduled) {
                    console.log('[INTAKE COMPLETION CHECK] Intake marked as complete, checking if confirmation was received');
                    console.log('[INTAKE COMPLETION CHECK] confirmationAccepted:', 'NOT_TRACKED');
                    console.log('[INTAKE COMPLETION CHECK] This should not happen - confirmation must be processed first');
                    
                    // This should not happen - confirmation must be processed first
                    // If we reach here, it means the AI bypassed confirmation
                    console.log('[CONFIRMATION REQUIRED] Runtime guard activated - confirmation required before final goodbye');
                    console.log('[CONFIRMATION REQUIRED] Forcing confirmation state instead of completion');
                    
                    // Force back to confirmation state
                    intakeData!.stage = 'confirmation';
                    return; // Skip any further processing
                    
                  } else if (intakeData!.stage === 'complete' && hangupScheduled) {
                    console.log('[AUTO HANGUP SKIPPED] Hangup already scheduled for this call');
                  }
                }
              }

              // Listen for partial transcript events (optional)
              if (message.type === 'conversation.item.input_audio_transcription.partial') {
                const userTranscript = message.transcript || '';
                console.log('[AI USER TRANSCRIPT PARTIAL]', userTranscript);
              }
              if (message.type === 'response.created') {
                responseCreatedReceived = true;
                console.log('[OPENAI RECV] response.created');
              }
              if (message.type === 'response.output_item.added') {
                console.log('[OPENAI RECV] response.output_item.added');
              }
              if (message.type === 'response.output_audio.delta') {
                console.log('[OPENAI RECV] response.output_audio.delta');

                // Set assistant speaking to true when audio starts
                if (!assistantSpeaking) {
                  assistantSpeaking = true;
                  console.log('[AI ASSISTANT SPEAKING TRUE]');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                }

                // Clear dead air timeout since we received audio
                if (!audioReceived) {
                  audioReceived = true;
                  clearTimeout(deadAirTimeout);
                  updateAISessionState(aiSessionTracker, 'AUDIO_RECEIVED', 'First audio delta received');
                  console.log('[AI STATE] AUDIO_RECEIVED - dead air protection cleared');
                }
              }
              if (message.type === 'response.done') {
                console.log('[OPENAI RECV] response.done');

                // Set assistant speaking to false when audio is done
                if (assistantSpeaking) {
                  assistantSpeaking = false;
                  console.log('[AI ASSISTANT SPEAKING FALSE]');
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                }

                console.log('[FINAL GOODBYE RESPONSE DONE] Final goodbye response completed');

                // Terminal closing detection - end call after final audio done
                if (terminalClosingResponseStarted && !hangupScheduled) {
                  console.log('[AI TERMINAL CLOSING AUDIO DONE] Terminal closing audio completed');
                  console.log('[AI TERMINAL CLOSING AUDIO DONE] Scheduling hangup after 1500ms buffer');

                  // Schedule hangup after 1500ms buffer
                  setTimeout(async () => {
                    if (!hangupScheduled) {
                      console.log('[AI TERMINAL HANGUP SCHEDULED] Buffer complete, executing hangup');
                      hangupScheduled = true;

                      try {
                        await endCallCleanly(ws, twilioHandler);
                        console.log('[AI TERMINAL CALL ENDED] Call terminated successfully');
                        callState = 'closed';
                        (twilioHandler as any).callState = callState;
                      } catch (error) {
                        console.log('[AI TERMINAL HANGUP FAILED] Error during hangup:', error);
                      }
                    }
                  }, 1500); // 1.5 second buffer
                }
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
                  console.log('[GREETING START] Sending greeting after session.updated');
                  const greetingText = `Sorry, ${businessName || 'we'} missed your call. Can you please let me know your name and why you are calling today?`;
                  const exactInstruction = `Say exactly this sentence and nothing else: "${greetingText}"`;
                  const greetingMessage = {
                    type: 'response.create',
                    response: {
                      instructions: exactInstruction,
                    },
                  };
                  console.log('[FINAL GREETING TEXT]', greetingText);
                  console.log('[FINAL BUSINESS NAME]', businessName || 'we');
                  console.log('[GREETING EXACT MODE]', exactInstruction);
                  console.log('[GREETING RESPONSE.CREATE RAW]', JSON.stringify(greetingMessage, null, 2));
                  console.log('[GREETING RESPONSE.CREATE SENT]');
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify(greetingMessage));
                  }
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
              }
              if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log('[OPENAI RECV] input_audio_buffer.speech_stopped');
              }
              if (message.type === 'input_audio_buffer.committed') {
                console.log('[OPENAI RECV] input_audio_buffer.committed');
                console.log('[USER TRANSCRIPT] committed:', message.transcript || 'null');
              }
              if (message.type === 'response.created') {
                console.log('[OPENAI RECV] response.created');
              }
              if (message.type === 'response.done') {
                console.log('[OPENAI RECV] response.done');
                
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
                
                // Check if ready to close and send final closing
                if (intakeComplete && !finalClosingStarted && callState === 'active') {
                  console.log('[AI TERMINAL CLOSING START] Starting terminal closing flow');
                  console.log('[AI TERMINAL CLOSING START] callState: active -> closing');

                  callState = 'closing';
                  (twilioHandler as any).callState = callState;
                  terminalClosingResponseStarted = true;
                  (twilioHandler as any).terminalClosingResponseStarted = terminalClosingResponseStarted;
                  assistantSpeaking = true;
                  (twilioHandler as any).assistantSpeaking = assistantSpeaking;
                  finalClosingStarted = true;

                  // Send final closing message
                  const finalClosingMessage = {
                    type: 'response.create',
                    response: {
                      instructions: `Say exactly: "Perfect. I'll pass this information along and someone will follow up with you soon. Thanks for calling."`
                    }
                  };

                  if (openAiWs) {
                    openAiWs.send(JSON.stringify(finalClosingMessage));
                    console.log('[AI FINAL GOODBYE SENT] Final closing message sent to OpenAI');
                    console.log('[AI TERMINAL CLOSING RESPONSE CREATE SENT] Final closing message sent to OpenAI');
                    console.log('[AI TERMINAL CLOSING RESPONSE CREATE SENT] callState: closing');
                    console.log('[AI TERMINAL CLOSING RESPONSE CREATE SENT] terminalClosingResponseStarted: true');
                    
                    // Immediately schedule hangup after sending final goodbye (deterministic)
                    // No need to wait for next response.done
                    if (!hangupScheduled) {
                      console.log('[AI TERMINAL CLOSING AUDIO DONE] Final goodbye sent, scheduling hangup after 1500ms buffer');
                      console.log('[AI FINAL AUDIO DONE] Final goodbye audio completed, initiating hangup');
                      hangupScheduled = true;
                      (twilioHandler as any).hangupScheduled = hangupScheduled;
                      
                      setTimeout(async () => {
                        await endCallCleanly(ws, twilioHandler);
                      }, 1500); // 1500ms buffer
                    }
                  }
                }
              }
              if (message.type === 'response.output_audio_transcript.delta') {
                console.log('[OPENAI RECV] response.output_audio_transcript.delta:', message.delta || 'null');
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
                  
                  // Check for natural closing phrases
                  const closingPhrases = [
                    "I'll pass this along",
                    "someone will follow up",
                    "thanks for calling",
                    "have a great day",
                    "Thank you for calling",
                    "have a great day"
                  ];
                  
                  const cleanDelta = message.delta.replace(/\[CALL_COMPLETE\]|CALL_COMPLETE|call complete/gi, '').trim();
                  
                  // Check for natural closing in the cleaned text
                  if (closingPhrases.some(phrase => cleanDelta.toLowerCase().includes(phrase.toLowerCase()))) {
                    console.log('[AI NATURAL CLOSING DETECTED]', { 
                      delta: cleanDelta,
                      timestamp: new Date().toISOString()
                    });
                    (ws as any).callComplete = true;
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
                  
                  // Check for natural closing phrases
                  const closingPhrases = [
                    "I'll pass this along",
                    "someone will follow up",
                    "thanks for calling",
                    "have a great day",
                    "Thank you for calling",
                    "have a great day"
                  ];
                  
                  const cleanTranscript = message.transcript.replace(/\[CALL_COMPLETE\]|CALL_COMPLETE|call complete/gi, '').trim();
                  
                  // Check for natural closing in the cleaned text
                  if (closingPhrases.some(phrase => cleanTranscript.toLowerCase().includes(phrase.toLowerCase()))) {
                    console.log('[AI NATURAL CLOSING DETECTED]', { 
                      transcript: cleanTranscript,
                      timestamp: new Date().toISOString()
                    });
                    (ws as any).callComplete = true;
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
                
                // Check for AI intake completion patterns (legacy - kept for compatibility)
                const assistantTranscript = message.transcript || '';
                const completionPatterns = [
                  'got it',
                  'i have that',
                  "i'll pass this along",
                  "you're all set",
                  "hang up whenever you're ready",
                  "you can hang up",
                  "thank you",
                  "goodbye",
                  "have a great day"
                ];
                
                const hasCompletionPattern = completionPatterns.some(pattern => 
                  assistantTranscript.toLowerCase().includes(pattern)
                );
                
                if (hasCompletionPattern) {
                  console.log('[AI INTAKE COMPLETE] AI appears to be ending the call');
                  console.log('[AI CLOSING MESSAGE SENT]', {
                    transcript: assistantTranscript.substring(0, 200),
                    sessionId: sessionId,
                    businessId: businessId,
                    timestamp: new Date().toISOString()
                  });
                }
                
                // Validate greeting transcript
                if (greetingSent && message.transcript) {
                  console.log('[GREETING ACTUAL TRANSCRIPT]', message.transcript);
                  if (!message.transcript.startsWith('Sorry,')) {
                    console.log('[GREETING MISMATCH] - Expected greeting to start with "Sorry,"');
                  }
                }
              }
              
              // Catch-all logging for every OpenAI event type
              console.log('[OPENAI EVENT]', message.type);

              
              // Handle audio delta - now PCMU directly from OpenAI
              if (message.type === 'response.output_audio.delta') {
                console.log('[OPENAI RECV] response.output_audio.delta');
              }
              if (message.type === 'response.output_audio.delta' && message.delta) {
                console.log('[GREETING AUDIO DELTA RECEIVED] Audio delta from OpenAI');
                console.log('[FORWARDING PCMU DIRECTLY] - no conversion needed');
                
                const streamSid = twilioHandler.getStreamSid();
                
                // Only send audio if streamSid is available
                if (!streamSid) {
                  console.log('[AUDIO OUT] SKIPPED - streamSid not available yet');
                  return;
                }
                
                console.log('[AUDIO SENT TO TWILIO] Sending audio to Twilio WebSocket');
                
                // Forward PCMU directly to Twilio
                const mediaMessage = {
                  event: 'media',
                  streamSid: streamSid,
                  media: {
                    payload: message.delta, // Direct PCMU from OpenAI
                  },
                };
                
                console.log('[TWILIO MEDIA SENT] - direct PCMU', {
                  streamSid: mediaMessage.streamSid,
                  payloadLength: mediaMessage.media?.payload?.length || 0
                });
                
                ws.send(JSON.stringify(mediaMessage));
                console.log('[AUDIO OUT SENT TO TWILIO]');
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

                  const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
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
                  .eq('sender', 'system')
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
                    sender: 'system',
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
                  .eq('sender', 'system')
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
                    sender: 'system',
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

                    const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
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

                    const response = await fetch(`${notificationApiUrl}/api/notifications/create`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
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
                      sender: 'system',
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

            console.log('[OPENAI AUDIT] attaching close listener');
            openAiWs.on('close', (code, reason) => {
              console.log('[OPENAI CONNECT CLOSED]', code, reason);
              console.log('[STREAM CLONED] CLOSE event, code:', code, 'reason:', reason);
              console.log('[OPENAI AUDIT] close listener attached');
              log(LogLevel.INFO, '[STREAM OPENAI] close event fired', { code, reason: reason?.toString() });
            });
            console.log('[OPENAI AUDIT] close listener attached');

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
      
      // Clear AI timeout timer if it exists
      if (aiTimeoutTimer) {
        clearTimeout(aiTimeoutTimer);
        aiTimeoutTimer = null;
      }
      
      // Close OpenAI WebSocket if it's still open
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        console.log('[OPENAI WEBSOCKET CLEANUP] Closing OpenAI WebSocket due to Twilio call end');
        console.log('[OPENAI WEBSOCKET CLEANUP] callSid:', callSid);
        openAiWs.close(1000, 'Twilio call ended');
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
  try {
    console.log('[AI CONFIRMATION SMS START]', {
      businessId,
      leadId,
      conversationId,
      callSid,
      callerPhone
    });

    // Check for duplicate SMS to prevent multiple sends
    const { data: existingSms, error: smsCheckError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('message_type', 'sms')
      .eq('sender', 'business')
      .eq('direction', 'outbound')
      .limit(1)
      .maybeSingle();

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
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      console.error('[AI CONFIRMATION SMS ERROR] Failed to fetch business:', businessError);
      return;
    }

    const businessName = business.name;

    // Call the confirmation SMS API endpoint
    if (!process.env.MAIN_APP_URL) {
      console.error('[AI CONFIRMATION SMS ERROR] MAIN_APP_URL not configured');
      return;
    }

    const confirmationUrl = `${process.env.MAIN_APP_URL}/api/ai-confirmation-sms`;
    console.log('[AI CONFIRMATION SMS URL]', { host: new URL(confirmationUrl).host, path: '/api/ai-confirmation-sms' });

    const response = await fetch(confirmationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
  console.log('[AI VOICE SERVICE VERSION] commit=3c67556 hangup-router-v3=true');
  console.log('[SCHEMA COMPATIBILITY CHECK] conversations table columns: lead_id, business_id, status, created_at, updated_at (NO call_sid)');
  console.log('[SCHEMA COMPATIBILITY CHECK] leads table columns: id, business_id, phone, name, email, status, raw_metadata, created_at, updated_at (NO source)');
  console.log('[SCHEMA COMPATIBILITY CHECK] ai_call_records table columns: id, business_id, lead_id, conversation_id, caller_phone, call_sid, ai_session_id, transcript, outcome, extracted_info, summary, extraction_failed, created_at, updated_at');
  console.log('[AI VOICE SERVICE VERSION] commit=473dfc1 language-lock-enabled=true');
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
