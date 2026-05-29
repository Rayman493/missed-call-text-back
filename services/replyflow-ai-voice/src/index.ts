/**
 * AI Voice Service - Phase 1A POC
 * 
 * Purpose: Prove technical loop:
 * - Twilio → Fly.io WebSocket
 * - Fly.io → OpenAI Realtime
 * - AI speaks greeting
 * - Caller hears greeting
 * - Safe fallback
 */

import { createServer } from 'http';
import { Server as WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { log, LogLevel } from './logger';
import { OpenAIRealtimeClient } from './openai-client';
import { TwilioStreamHandler } from './twilio-stream';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_VOICE = process.env.AI_VOICE || 'alloy'; // Configurable voice: alloy, verse, cedar, marin
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Initialize Supabase client
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Intake state machine types
type IntakeStage = 'ask_reason' | 'ask_name' | 'ask_callback' | 'ask_urgency' | 'complete';

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
  callerName?: string;
  callerReason?: string;
  callbackNumber?: string;
  urgency?: 'urgent' | 'normal';
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
  urgency?: 'urgent' | 'normal';
  summary: string;
  timestamp: string;
  callSid: string;
  businessId: string;
  businessName: string;
}

// Intake state machine functions
function createIntakeData(businessName: string, callSid: string, businessId: string, sessionId: string): IntakeData {
  return {
    stage: 'ask_reason',
    businessName,
    callSid,
    businessId,
    sessionId,
    startTime: Date.now()
  };
}

function getIntakeResponse(intake: IntakeData, transcript?: string): { response: string; nextStage: IntakeStage } {
  console.log('[AI INTAKE STAGE] current stage:', intake.stage);
  
  switch (intake.stage) {
    case 'ask_reason':
      return {
        response: `Sorry we missed your call for ${intake.businessName}. Could you briefly let me know the reason for your call?`,
        nextStage: 'ask_name'
      };
      
    case 'ask_name':
      if (transcript) {
        intake.callerName = extractName(transcript);
        console.log('[AI NAME CAPTURED]', intake.callerName);
      }
      return {
        response: 'Thanks. Can I get your name?',
        nextStage: 'ask_callback'
      };
      
    case 'ask_callback':
      if (transcript) {
        intake.callbackNumber = extractPhoneNumber(transcript);
        console.log('[AI CALLBACK CAPTURED]', intake.callbackNumber);
      }
      return {
        response: "What's the best number to reach you back at?",
        nextStage: 'ask_urgency'
      };
      
    case 'ask_urgency':
      if (transcript) {
        intake.urgency = extractUrgency(transcript);
        console.log('[AI URGENCY CAPTURED]', intake.urgency);
      }
      return {
        response: 'Is this urgent or can someone follow up later today?',
        nextStage: 'complete'
      };
      
    case 'complete':
      return {
        response: 'Perfect, thanks. I\'ll pass this along to the team and someone will follow up shortly.',
        nextStage: 'complete'
      };
      
    default:
      return {
        response: 'Sorry, could you repeat that?',
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

function extractUrgency(transcript: string): 'urgent' | 'normal' {
  const urgent = transcript.toLowerCase().match(/\burgent\b|\bemergency\b|\basap\b|\bimmediately\b|\bright away\b/);
  return urgent ? 'urgent' : 'normal';
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
  const summary = `${intake.callerName || 'Caller'} called about ${intake.callerReason || 'general inquiry'}. ${intake.urgency === 'urgent' ? 'URGENT: ' : ''}Callback requested at ${intake.callbackNumber || 'number on file'}.`;
  
  return {
    callerName: intake.callerName,
    callbackNumber: intake.callbackNumber,
    reason: intake.callerReason,
    urgency: intake.urgency || 'normal',
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
    const { error } = await supabase
      .from('conversations')
      .insert({
        business_id: leadSummary.businessId,
        phone_number: leadSummary.callbackNumber || 'unknown',
        contact_name: leadSummary.callerName || 'Unknown',
        last_message: leadSummary.summary,
        status: 'new',
        created_at: leadSummary.timestamp,
        updated_at: leadSummary.timestamp,
        call_sid: leadSummary.callSid,
        ai_intake_summary: leadSummary.summary,
        urgency: leadSummary.urgency
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
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'ai-voice-poc' }));
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

// Create WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws, req) => {
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

    // Create Twilio stream handler with placeholder parameters
    // Real parameters will come from Twilio's "start" event
    const twilioHandler = new TwilioStreamHandler({
      sessionId: urlSessionId || '',
      businessId: urlBusinessId || '',
      callSid: urlCallSid || '',
    });

    log(LogLevel.INFO, '[AI POC] waiting for Twilio start event');

    let firstFrameLogged = false;
    let debugMessageCount = 0;
    const DEBUG_MESSAGE_LIMIT = 20;
    let mediaPacketCount = 0;
    let firstMediaPacketLogged = false;
    let openaiInitAttempted = false;
    let openaiInitSucceeded = false;
    let openaiInitFailed = false;
    let startEventProcessed = false;
    let openAiWs: WebSocket | null = null;

    // Transcript capture with structured data
    let transcript: Array<{role: 'user' | 'assistant'; text: string; timestamp: string}> = [];
    let callerPhone: string = '';
    let sessionId: string = '';
    let businessId: string = '';
    let callSid: string = '';
    let forwardedFrom: string = '';
    let callOutcome: 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback' = 'completed';

    // Intake state machine
    let intakeData: IntakeData | null = null;
    let businessName: string = 'ReplyFlow';

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
          mediaPacketCount++;
          if (!firstMediaPacketLogged) {
            log(LogLevel.INFO, '[PARSED WS] FIRST MEDIA PACKET', JSON.stringify(message, null, 2));
            firstMediaPacketLogged = true;
          } else if (mediaPacketCount % 100 === 0) {
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
          log(LogLevel.INFO, '[AI POC] entered start handler');

          if (startEventProcessed) {
            log(LogLevel.INFO, '[AI POC] start event already processed, skipping');
            originalHandleMessage(data);
            return;
          }

          startEventProcessed = true;

          // Extract call forwarding information from Twilio start event
          const callInfo = message.start || {};
          const forwardedFrom = callInfo.customParameters?.ForwardedFrom || req.headers['x-forwarded-from'] || '';
          const called = callInfo.customParameters?.Called || callInfo.callSid || '';
          const to = callInfo.customParameters?.To || '';
          
          // Store forwardedFrom for ingestion
          (ws as any).forwardedFrom = forwardedFrom;
          
          // Determine routing reason
          let routingReason = 'unknown';
          if (forwardedFrom) {
            routingReason = 'forwarded_missed_call';
            console.log('[Voice] routing_reason: forwarded_missed_call (business missed call, forwarded to ReplyFlow)');
          } else if (to) {
            routingReason = 'direct_to_replyflow_number';
            console.log('[Voice] routing_reason: direct_to_replyflow_number (direct call to ReplyFlow number)');
          } else {
            routingReason = 'unknown_source';
            console.log('[Voice] routing_reason: unknown_source');
          }
          
          // Log call information
          console.log('[Voice] ForwardedFrom', { forwardedFrom: forwardedFrom || 'none' });
          console.log('[Voice] Called', { called });
          console.log('[Voice] To', { to: to || 'none' });
          console.log('[Voice] routing_reason', { routingReason });

          const customParams = message.start?.customParameters || {};
          log(LogLevel.INFO, '[AI POC] received custom parameters', customParams);

          const sessionId = customParams.sessionId || urlSessionId;
          const callSid = customParams.callSid || urlCallSid;
          const businessId = customParams.businessId || urlBusinessId;
          const callerPhone = customParams.callerPhone || callInfo.caller || '';

          // Set session variables for ingestion
          (ws as any).sessionId = sessionId;
          (ws as any).businessId = businessId;
          (ws as any).callSid = callSid;
          (ws as any).callerPhone = callerPhone;

          log(LogLevel.INFO, '[AI POC] parsed parameters', { sessionId, callSid, businessId, callerPhone });

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
                .select('name, type, custom_greeting')
                .eq('id', businessId)
                .single();
              
              console.log('[BUSINESS LOOKUP RESULT]', { business, error });
              
              if (error) {
                console.log('[BUSINESS LOOKUP ERROR]', error);
              } else if (business) {
                businessName = business.name;
                businessType = business.type || '';
                customGreeting = business.custom_greeting || '';
                console.log('[BUSINESS NAME RESOLVED]', businessName);
                console.log('[AI] business loaded', { businessName, businessType, hasCustomGreeting: !!customGreeting });
              } else {
                console.log('[BUSINESS LOOKUP FAILED] - no business found');
              }
            } catch (err) {
              console.log('[BUSINESS LOOKUP ERROR]', err);
            }
          } else {
            console.log('[BUSINESS LOOKUP FAILED] - no businessId or supabase client', { businessId, hasSupabase: !!supabase });
          }

          // Initialize intake state machine with business name
          intakeData = createIntakeData(businessName || 'we', callSid, businessId, sessionId);
          console.log('[AI INTAKE] initialized with business:', businessName);

          // Instructions are now handled via session.update - disable old system
          console.log('[AI] using session.update instructions - old system disabled');
          
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
                  console.log(`[OPENAI CONNECT SUCCESS] Attempt ${retryAttempt}`);
                  updateAISessionState(aiSessionTracker, 'AI_CONNECTED', `Connected on attempt ${retryAttempt}`);
                  resolve(ws);
                });
                
                ws.on('error', (error) => {
                  clearTimeout(connectTimeout);
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
                  recordAIFailure(aiSessionTracker, 'OPENAI_CONNECT_FAILED', `Failed after ${retryAttempt} attempts`);
                  updateAISessionState(aiSessionTracker, 'FAILED', 'Connection failed after retries');
                  // Trigger voicemail fallback
                  ws.close(1008, 'OpenAI connection failed');
                  return;
                }
              } else {
                console.log('[OPENAI CONNECT FAILED] No retries remaining');
                recordAIFailure(aiSessionTracker, 'OPENAI_CONNECT_FAILED', 'Connection failed');
                updateAISessionState(aiSessionTracker, 'FAILED', 'Connection failed');
                ws.close(1008, 'OpenAI connection failed');
                return;
              }
            }
            
            console.log('[STREAM CLONED] websocket created, readyState:', openAiWs.readyState);
            
            // Set websocket on Twilio handler so media handler can access it
            (twilioHandler as any).openAiWs = openAiWs;
            (ws as any).openAiWs = openAiWs;
            console.log('[STREAM CLONED] websocket set on Twilio handler');
            
            // Startup gate to prevent media flood during initialization
            let streamReady = false;
            const audioBuffer: Buffer[] = [];
            
            // Phase 2: Dead Air Protection (3-second timeout)
            let audioReceived = false;
            const deadAirTimeout = setTimeout(() => {
              if (!audioReceived) {
                console.log('[DEAD AIR DETECTED] No audio received within 3 seconds');
                console.log('[VOICEMAIL FALLBACK ACTIVATED] Triggering voicemail due to dead air');
                recordAIFailure(aiSessionTracker, 'NO_AUDIO_RECEIVED', 'No audio received within 3 seconds');
                updateAISessionState(aiSessionTracker, 'FAILED', 'Dead air detected');
                
                // Close AI connection and trigger voicemail fallback
                if (openAiWs) {
                  openAiWs.close();
                }
                ws.close(1008, 'Dead air detected - triggering voicemail');
              }
            }, 3000);
            
            // Phase 3: Session Ready Timeout (5-second timeout)
            let sessionReady = false;
            const sessionReadyTimeout = setTimeout(() => {
              if (!sessionReady) {
                console.log('[SESSION READY TIMEOUT] Session not ready within 5 seconds');
                console.log('[VOICEMAIL FALLBACK ACTIVATED] Triggering voicemail due to session timeout');
                recordAIFailure(aiSessionTracker, 'SESSION_READY_TIMEOUT', 'Session not ready within 5 seconds');
                updateAISessionState(aiSessionTracker, 'FAILED', 'Session ready timeout');
                
                // Close AI connection and trigger voicemail fallback
                if (openAiWs) {
                  openAiWs.close();
                }
                ws.close(1008, 'Session ready timeout - triggering voicemail');
              }
            }, 5000);
            
            // Additional tracking variables
            let opened = false;
            let greetingSent = false;
            let responseCreatedReceived = false;
            let sessionCreated = false;
            let sessionUpdatedReceived = false;
            
            // Attach listeners - using minimal endpoint pattern
            openAiWs.on('open', () => {
              console.log('[STREAM CLONED] OPEN event fired');
              opened = true;
              console.log('[OPENAI AUDIT] open listener attached');
              console.log('[OPENAI RAW] open');
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
2. Urgency level (is this time-sensitive?)
3. Caller name (for personalization)
4. Important details about the issue/job/request (context for follow-up)
5. Best callback number (only if caller ID is missing or unclear)
6. Address/location (only if relevant to the business type or issue)
7. Preferred callback timing (optional, lowest priority)

CALL COMPLETION POLICY:
STOP asking questions once you have enough actionable information:
- Reason for calling (required)
- Caller name if provided (helpful)
- Urgency if relevant (important for time-sensitive issues)
- Important details (context for follow-up)
- Callback number if caller ID is missing/unclear (only when needed)
- Address/location only if relevant to the business type or issue

CORE INFO IS ENOUGH when the business can realistically follow up confidently. Do not keep asking optional questions.

CALL ENDING SEQUENCE:
Once you have enough useful information, naturally end the call:

1. Briefly summarize: "Got it — I have that you're calling about {reason}. I'll pass this along to {businessName}."
2. Clear release: "You're all set, and you can hang up whenever you're ready."

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
- Acknowledge briefly
- Close the call politely
- Do not ask another question

BEHAVIOR REQUIREMENTS:
- Naturally guide conversation based on priority order
- Ask one question at a time
- Do not sound like a checklist or survey
- Focus on gathering actionable business information
- Keep responses concise and conversational
- Avoid robotic phrasing
- End the call naturally once core info is collected

CONTEXTUAL EXAMPLES:
- Emergency plumbing issue → prioritize urgency and location quickly, then end
- Estimate request → prioritize project details, then end
- Existing customer support issue → prioritize issue details and urgency, then end
- General inquiry → keep intake shorter and lighter, then end

IMPORTANT GUIDELINES:
- If the caller already provided information, do not ask for it again
- If caller ID is available, avoid unnecessarily asking for callback number
- Address/location should only be collected when useful for the business type or issue
- Preferred callback timing is optional and lowest priority
- When in doubt, err on the side of ending the call rather than asking more questions

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

              const rawSessionUpdate = JSON.stringify(sessionUpdatePayload);
              console.log("[SESSION BUSINESS NAME]", businessName || 'we');
              console.log("[SESSION.UPDATE RAW SENT]", rawSessionUpdate);
              if (openAiWs) {
                openAiWs.send(rawSessionUpdate);
              }
              
              // Greeting will be sent after session.updated is received
              console.log('[SESSION] waiting for session.updated before sending greeting');
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

              // Log input audio events
              if (message.type === 'input_audio_buffer.speech_started') {
                console.log('[VAD] speech started');
              }
              if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log('[VAD] speech stopped');
              }

              // Listen for FINAL transcript events
              if (message.type === 'conversation.item.input_audio_transcription.completed') {
                const userTranscript = message.transcript || '';
                console.log('[AI USER TRANSCRIPT FINAL]', userTranscript);
                console.log('[AI TRANSCRIPT CAPTURED]', { role: 'user', text: userTranscript, timestamp: new Date().toISOString() });
                transcript.push({ role: 'user', text: userTranscript, timestamp: new Date().toISOString() });
                
                // Process intake stage advancement after FINAL transcript
                if (intakeData && intakeData.stage !== 'complete' && openAiWs && sessionReady) {
                  console.log('[AI INTAKE STAGE] current stage:', intakeData.stage);
                  
                  // Get next intake response
                  const intakeResponse = getIntakeResponse(intakeData!, userTranscript);
                  
                  // Update intake data based on stage
                  if (intakeData!.stage === 'ask_name' && userTranscript) {
                    intakeData!.callerName = extractName(userTranscript);
                    console.log('[AI NAME CAPTURED]', intakeData!.callerName);
                  } else if (intakeData!.stage === 'ask_callback' && userTranscript) {
                    intakeData!.callbackNumber = extractPhoneNumber(userTranscript);
                    console.log('[AI CALLBACK CAPTURED]', intakeData!.callbackNumber);
                  } else if (intakeData!.stage === 'ask_urgency' && userTranscript) {
                    intakeData!.urgency = extractUrgency(userTranscript);
                    console.log('[AI URGENCY CAPTURED]', intakeData!.urgency);
                  } else if (intakeData!.stage === 'ask_reason' && userTranscript) {
                    intakeData!.callerReason = userTranscript;
                    console.log('[AI REASON CAPTURED]', intakeData!.callerReason);
                  }
                  
                  // Let VAD handle responses naturally after session.updated greeting
                  console.log('[AI INTAKE] VAD will handle response naturally');
                  console.log('[AI INTAKE] advancing to stage:', intakeResponse.nextStage);
                  
                  // Update stage
                  intakeData!.stage = intakeResponse.nextStage;
                  
                  // If intake is complete, save the lead summary
                  if (intakeData!.stage === 'complete') {
                    const leadSummary = generateLeadSummary(intakeData!);
                    saveLeadSummary(leadSummary);
                    console.log('[AI INTAKE] intake complete, summary saved');
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
                  console.log('[SESSION UPDATED - SENDING GREETING]');
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
              }
              if (message.type === 'response.output_audio_transcript.delta') {
                console.log('[OPENAI RECV] response.output_audio_transcript.delta:', message.delta || 'null');
              }
              if (message.type === 'response.output_audio_transcript.done') {
                console.log('[OPENAI RECV] response.output_audio_transcript.done:', message.transcript || 'null');
                // Validate greeting transcript
                if (greetingSent && message.transcript) {
                  console.log('[GREETING ACTUAL TRANSCRIPT]', message.transcript);
                  if (!message.transcript.startsWith('Sorry,')) {
                    console.log('[GREETING MISMATCH] - Expected greeting to start with "Sorry,"');
                  }
                }
              }
              if (message.type === 'conversation.item.input_audio_transcription.completed') {
                console.log('[OPENAI RECV] conversation.item.input_audio_transcription.completed');
                console.log('[FINAL USER TRANSCRIPT]:', message.transcript || 'null');
              }
              if (message.type === 'conversation.item.output_audio_transcription.completed') {
                console.log('[OPENAI RECV] conversation.item.output_audio_transcription.completed');
                console.log('[FINAL ASSISTANT TRANSCRIPT]:', message.transcript || 'null');
                
                // Check for AI intake completion patterns
                const transcript = message.transcript || '';
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
                  transcript.toLowerCase().includes(pattern)
                );
                
                if (hasCompletionPattern) {
                  console.log('[AI INTAKE COMPLETE] AI appears to be ending the call');
                  console.log('[AI CLOSING MESSAGE SENT]', {
                    transcript: transcript.substring(0, 200),
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
                console.log('[AUDIO DELTA RECEIVED]');
                console.log('[FORWARDING PCMU DIRECTLY] - no conversion needed');
                
                const streamSid = twilioHandler.getStreamSid();
                
                // Only send audio if streamSid is available
                if (!streamSid) {
                  console.log('[AUDIO OUT] SKIPPED - streamSid not available yet');
                  return;
                }
                
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
            openAiWs.on('error', (error) => {
              console.log('[STREAM CLONED] ERROR event:', String(error));
              console.log('[OPENAI AUDIT] error listener attached');
              log(LogLevel.ERROR, '[STREAM OPENAI] error event fired', error as Error);
              openaiInitFailed = true;
            });

            // Ingestion function to save call data
            const ingestCallData = async () => {
              const sessionSessionId = (ws as any).sessionId || '';
              const sessionBusinessId = (ws as any).businessId || '';
              const sessionCallSid = (ws as any).callSid || '';
              const sessionCallerPhone = (ws as any).callerPhone || '';
              const sessionForwardedFrom = (ws as any).forwardedFrom || '';
              
              console.log('[AI INGEST START] call ended');
              console.log('[AI INGEST] transcript captured', { transcriptLength: transcript.length });
              console.log('[AI INGEST] session data', { 
                sessionId: sessionSessionId, 
                businessId: sessionBusinessId, 
                callSid: sessionCallSid, 
                callerPhone: sessionCallerPhone,
                forwardedFrom: sessionForwardedFrom
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
                      extracted_info: extractedFields,
                      summary: extractedFields.summary || null,
                      extraction_failed: false,
                      updated_at: new Date().toISOString()
                    })
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
                      extraction_failed: true,
                      updated_at: new Date().toISOString()
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

                // Upsert lead
                if (!supabase) {
                  console.log('[AI INGEST] supabase client not available');
                  return;
                }
                console.log('[AI INGEST] lead upserting...');
                const { data: lead, error: leadError } = await supabase
                  .from('leads')
                  .upsert({
                    business_id: sessionBusinessId,
                    phone: sessionCallerPhone,
                    name: extractedFields.callerName || null,
                    source: 'ai_voice',
                    status: 'new',
                  }, {
                    onConflict: 'business_id,phone',
                  })
                  .select()
                  .single();

                if (leadError) {
                  console.log('[AI INGEST] lead upsert error', leadError);
                  throw leadError;
                }
                console.log('[AI LEAD UPSERTED]', { leadId: lead.id });

                // Create or update conversation
                console.log('[AI INGEST] conversation updating...');
                const { data: conversation, error: conversationError } = await supabase
                  .from('conversations')
                  .upsert({
                    lead_id: lead.id,
                    business_id: sessionBusinessId,
                    call_sid: sessionCallSid,
                    status: 'active',
                  }, {
                    onConflict: 'lead_id,call_sid',
                  })
                  .select()
                  .single();

                if (conversationError) {
                  console.log('[AI INGEST] conversation update error', conversationError);
                  throw conversationError;
                }
                console.log('[AI CONVERSATION UPDATED]', { conversationId: conversation.id });

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
                const { error: aiRecordError } = await supabase
                  .from('ai_call_records')
                  .insert({
                    business_id: sessionBusinessId,
                    lead_id: lead.id,
                    conversation_id: conversation.id,
                    caller_phone: sessionCallerPhone,
                    forwarded_from: sessionForwardedFrom,
                    call_sid: sessionCallSid,
                    ai_session_id: sessionSessionId,
                    outcome: callOutcome,
                    transcript: transcript,
                    extracted_info: extractedFields,
                    summary: extractedFields.summary || null,
                    extraction_failed: false,
                  });

                if (aiRecordError) {
                  console.log('[AI INGEST] AI call record creation error', aiRecordError);
                  // Don't throw here - the main ingestion succeeded
                } else {
                  console.log('[AI INGEST] AI call record created successfully');
                }
                
                console.log('[AI INGEST COMPLETE] all data saved successfully');

              } catch (error) {
                console.log('[AI INGEST FAILED] extraction failed, saving raw transcript as fallback', error);
                // Fallback: save raw transcript as a note
                if (!supabase) {
                  console.log('[AI INGEST] supabase client not available for fallback');
                  return;
                }
                try {
                  const { data: lead } = await supabase
                    .from('leads')
                    .upsert({
                      business_id: sessionBusinessId,
                      phone: sessionCallerPhone,
                      source: 'ai_voice',
                      status: 'new',
                    }, {
                      onConflict: 'business_id,phone',
                    })
                    .select()
                    .single();

                  const { data: conversation } = await supabase
                    .from('conversations')
                    .upsert({
                      lead_id: lead.id,
                      business_id: sessionBusinessId,
                      call_sid: sessionCallSid,
                      status: 'active',
                    }, {
                      onConflict: 'lead_id,call_sid',
                    })
                    .select()
                    .single();

                  await supabase
                    .from('messages')
                    .insert({
                      conversation_id: conversation.id,
                      lead_id: lead.id,
                      business_id: sessionBusinessId,
                      sender: 'system',
                      content: `AI call transcript (extraction failed):\n${fullTranscript}`,
                      message_type: 'transcript',
                    });

                  // Create AI call record for fallback case
                  const { error: fallbackAiRecordError } = await supabase
                    .from('ai_call_records')
                    .insert({
                      business_id: sessionBusinessId,
                      lead_id: lead.id,
                      conversation_id: conversation.id,
                      caller_phone: sessionCallerPhone,
                      forwarded_from: sessionForwardedFrom,
                      call_sid: sessionCallSid,
                      ai_session_id: sessionSessionId,
                      outcome: callOutcome,
                      transcript: transcript,
                      extracted_info: null,
                      summary: null,
                      extraction_failed: true,
                    });

                  if (fallbackAiRecordError) {
                    console.log('[AI INGEST] fallback AI call record creation error', fallbackAiRecordError);
                  } else {
                    console.log('[AI INGEST] fallback AI call record created successfully');
                  }

                  console.log('[AI INGEST] fallback transcript saved');
                } catch (fallbackError) {
                  console.log('[AI INGEST] fallback also failed', fallbackError);
                }
              }
            };

            // Call ingestion when WebSocket closes
            openAiWs.on('close', () => {
              console.log('[OPENAI AUDIT] close listener attached');
              console.log('[OPENAI RAW] close');
              log(LogLevel.INFO, '[STREAM OPENAI] close event fired');
              
              // Log call metrics before ingestion
              logCallMetrics(aiSessionTracker);
              
              ingestCallData();
            });
            console.log('[OPENAI AUDIT] error listener attached');

            console.log('[OPENAI AUDIT] attaching close listener');
            openAiWs.on('close', (code, reason) => {
              console.log('[STREAM CLONED] CLOSE event, code:', code, 'reason:', reason);
              console.log('[OPENAI AUDIT] close listener attached');
              log(LogLevel.INFO, '[STREAM OPENAI] close event fired', { code, reason: reason?.toString() });
            });
            console.log('[OPENAI AUDIT] close listener attached');

            console.log('[OPENAI AUDIT] attaching unexpected-response listener');
            openAiWs.on('unexpected-response', (request, response) => {
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
            ws.close(1011, 'OpenAI initialization exception');
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
      log(LogLevel.INFO, '[AI POC] websocket closed');
      log(LogLevel.INFO, '[AI POC] websocket close details', { code, reason: reason?.toString() });
      log(LogLevel.INFO, '[AI POC] OpenAI initialization status', {
        attempted: openaiInitAttempted,
        succeeded: openaiInitSucceeded,
        failed: openaiInitFailed,
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

// Start server
server.listen(PORT, () => {
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
