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

    // Transcript capture
    let transcript: string[] = [];
    let callerPhone: string = '';
    let sessionId: string = '';
    let businessId: string = '';
    let callSid: string = '';

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
          let businessName = 'ReplyFlow';
          let businessType = '';
          let customGreeting = '';
          
          if (businessId && supabase) {
            try {
              console.log('[AI] fetching business data', { businessId });
              const { data: business, error } = await supabase
                .from('businesses')
                .select('name, type, custom_greeting')
                .eq('id', businessId)
                .single();
              
              if (error) {
                console.log('[AI] business fetch error', error);
              } else if (business) {
                businessName = business.name || businessName;
                businessType = business.type || '';
                customGreeting = business.custom_greeting || '';
                console.log('[AI] business loaded', { businessName, businessType, hasCustomGreeting: !!customGreeting });
              }
            } catch (err) {
              console.log('[AI] business fetch failed', err);
            }
          } else {
            console.log('[AI] no businessId or supabase client, using default greeting');
          }

          // Initialize intake state machine with business name
          intakeData = createIntakeData(businessName, callSid, businessId, sessionId);
          console.log('[AI INTAKE] initialized with business:', businessName);

          // Build dynamic instructions
          let instructions = '';
          if (customGreeting) {
            instructions = customGreeting;
          } else {
            instructions = `You are ReplyFlow's phone assistant. You must speak only English. Always respond in clear American English. Never speak Spanish, French, or any other language. If audio is unclear, silence, background noise, or the caller speaks another language, still respond in English only.

You are a missed-call receptionist for ${businessName}. Your job is to gather basic information after a missed call.

Rules:
- Keep responses under 1 sentence
- Ask only ONE question at a time
- Never start with "Sure we can help"
- Never over-explain
- Always speak English
- If unclear, say: "Sorry, could you repeat that?"

First message must ALWAYS be:
"Sorry we missed your call for ${businessName}. Could you briefly let me know the reason for your call?"

Then ask in order:
1. "Thanks. Can I get your name?"
2. "What's the best number to reach you back at?"
3. "Is this urgent or can someone follow up later today?"
4. "Perfect, thanks. I'll pass this along to the team and someone will follow up shortly."

Never provide technical help or advice. Just gather information and end the call.`;
          }
          
          console.log('[AI] greeting instructions created', { instructionsLength: instructions.length });
          
          // Store instructions for use in OpenAI response
          (ws as any).aiInstructions = instructions;

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

          try {
            console.log('[STREAM CLONED] starting websocket creation');
            console.log('[STREAM CLONED] WebSocket package:', 'ws');
            console.log('[STREAM CLONED] API key exists:', !!OPENAI_API_KEY);
            
            const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
            console.log('[STREAM CLONED] creating websocket to:', wsUrl);
            
            openAiWs = new WebSocket(wsUrl, {
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
              },
            });
            
            console.log('[STREAM CLONED] websocket created, readyState:', openAiWs.readyState);
            
            // Set websocket on Twilio handler so media handler can access it
            (twilioHandler as any).openAiWs = openAiWs;
            console.log('[STREAM CLONED] websocket set on Twilio handler');
            
            // Startup gate to prevent media flood during initialization
            let streamReady = false;
            const audioBuffer: Buffer[] = [];
            
            // Add open timeout
            let opened = false;
            let greetingSent = false;
            let responseCreatedReceived = false;
            let sessionCreated = false;
            let sessionUpdatedReceived = false;
            let sessionReady = false;
            setTimeout(() => {
              if (!opened) {
                console.log('[OPENAI RAW] open timeout (5 seconds)');
              }
            }, 5000);
            
            // Add timeout for session.updated
            setTimeout(() => {
              if (opened && !sessionReady) {
                console.log('[SESSION.UPDATE TIMEOUT] - session.updated not received within 3 seconds');
                // Close gracefully
                if (openAiWs) {
                  openAiWs.close();
                }
              }
            }, 3000);
            
            // Add timeout to detect if OpenAI ignores response.create
            setTimeout(() => {
              if (greetingSent && !responseCreatedReceived) {
                console.log('[MISSING] OpenAI ignored response.create');
              }
            }, 15000);
            
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
                  instructions: "You are ReplyFlow's missed-call receptionist. Always speak English. Keep responses short and professional.",
                  audio: {
                    input: {
                      format: {
                        type: "audio/pcmu"
                      },
                      turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 700,
                        create_response: false
                      }
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
                transcript.push(`User: ${userTranscript}`);
                
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
                  
                  // Send next intake question manually
                  const nextMessage = {
                    type: 'response.create',
                    response: {
                      instructions: intakeResponse.response + ' Always respond in English only.',
                    },
                  };
                  
                  console.log('[AI INTAKE RESPONSE CREATE]', intakeResponse.response);
                  console.log('[AI INTAKE] advancing to stage:', intakeResponse.nextStage);
                  
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify(nextMessage));
                  }
                  
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
              }
              if (message.type === 'response.done') {
                console.log('[OPENAI RECV] response.done');
              }
              if (message.type === 'response.content') {
                console.log('[TRANSCRIPT] response.content', { content: message.content });
                if (message.content) {
                  transcript.push(`AI: ${message.content}`);
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
                
                // Now send deterministic intake greeting after session.updated
                if (intakeData) {
                  const intakeResponse = getIntakeResponse(intakeData);
                  const testMessage = {
                    type: 'response.create',
                    response: {
                      instructions: intakeResponse.response + ' Always respond in English only.',
                    },
                  };
                  console.log('[AI GREETING ENGLISH SENT] - missed-call receptionist opening');
                  console.log('[RESPONSE.CREATE PAYLOAD]', JSON.stringify(testMessage, null, 2));
                  greetingSent = true;
                  console.log('[GREETING SENT]');
                  console.log('[AI INTAKE] first message:', intakeResponse.response);
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify(testMessage));
                  }
                  console.log('[RESPONSE CREATED]');
                  
                  // Update intake stage
                  intakeData.stage = intakeResponse.nextStage;
                } else {
                  // Fallback greeting
                  const testMessage = {
                    type: 'response.create',
                    response: {
                      instructions: 'Thanks for calling ReplyFlow. May I have your name? Always respond in English only.',
                    },
                  };
                  console.log('[AI RESPONSE LANGUAGE LOCK] english');
                  console.log('[RESPONSE.CREATE PAYLOAD]', JSON.stringify(testMessage, null, 2));
                  greetingSent = true;
                  console.log('[GREETING SENT]');
                  if (openAiWs) {
                    openAiWs.send(JSON.stringify(testMessage));
                  }
                  console.log('[RESPONSE CREATED]');
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
              
              console.log('[AI INGEST] call ended');
              console.log('[AI INGEST] transcript captured', { transcriptLength: transcript.length });
              console.log('[AI INGEST] session data', { sessionId: sessionSessionId, businessId: sessionBusinessId, callSid: sessionCallSid, callerPhone: sessionCallerPhone });
              
              const fullTranscript = transcript.join('\n');
              console.log('[AI INGEST] full transcript', { transcript: fullTranscript });
              
              try {
                // Extract structured fields from transcript
                console.log('[AI INGEST] extracting fields...');
                const extractionPrompt = `Extract the following information from this AI call transcript. Return JSON with these keys: name, reason_for_call, service_address, urgency, callback_phone, callback_time, notes. If a field is not found, set it to null.

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
                console.log('[AI INGEST] extracted fields', extractedFields);

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
                    name: extractedFields.name || null,
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
                console.log('[AI INGEST] lead upserted', { leadId: lead.id });

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
                console.log('[AI INGEST] conversation updated', { conversationId: conversation.id });

                // Save summary message
                console.log('[AI INGEST] summary saving...');
                const summaryMessage = `AI call summary:
Name: ${extractedFields.name || 'Not provided'}
Reason: ${extractedFields.reason_for_call || 'Not provided'}
Address: ${extractedFields.service_address || 'Not provided'}
Urgency: ${extractedFields.urgency || 'Not provided'}
Callback: ${extractedFields.callback_phone || 'Not provided'} at ${extractedFields.callback_time || 'Not provided'}
Notes: ${extractedFields.notes || 'None'}`;

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
                console.log('[AI INGEST] summary saved');

                // Save transcript message
                console.log('[AI INGEST] transcript saving...');
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
                console.log('[AI INGEST] transcript saved');

              } catch (error) {
                console.log('[AI INGEST] extraction failed, saving raw transcript as fallback', error);
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
