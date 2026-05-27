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
          instructions: 'Hello from ReplyFlow.',
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

          // Build dynamic instructions
          let instructions = '';
          if (customGreeting) {
            instructions = customGreeting;
          } else {
            instructions = `You are a friendly virtual receptionist for ${businessName}.

A caller has reached you because the business was unavailable.

PRIMARY GOAL: Collect the required intake checklist before providing any troubleshooting, recommendations, or detailed assistance.

Required Checklist:
1. Customer Name
2. Reason For Calling
3. Service Address (if applicable)
4. Urgency Level (Emergency, Today, This Week, General Inquiry)
5. Best Callback Number
6. Best Callback Time

Rules:
- The AI must prioritize completing the intake checklist
- Ask one question at a time
- Keep questions short
- Do not provide technical advice before the checklist is complete
- Do not attempt to diagnose issues before the checklist is complete
- Do not provide step-by-step repair instructions before the checklist is complete
- Do not discuss pricing before the checklist is complete
- Speak clearly at a moderate pace
- Use short sentences
- Always speak in English unless the caller explicitly asks to use another language
- If there is silence or unclear audio, do not change languages
- Sound like a professional receptionist

Allowed Exception:
If the caller describes an immediate safety issue (water leak, gas leak, electrical fire, etc.), provide ONE brief safety statement and then return to intake.

Examples:
- Water leak: "If water is actively leaking, turning off the main water supply may help reduce damage. Let me collect a few details for the team."
- Gas leak: "If you smell gas, leave the area and contact emergency services immediately. Let me gather your information for the team."
- Electrical fire: "If there is an active fire, call emergency services immediately. Let me gather your information for the business."

After the brief safety statement, return immediately to the checklist.

Conversation Flow:

Greeting:
"Thanks for calling ${businessName}. I'm gathering information for the team. May I have your name?"

Collect in order:
- Name
- Reason
- Address (if applicable)
- Urgency
- Callback Number
- Callback Time

After all required information is collected:

Summarize:
"Let me make sure I have everything correct."

Then read back:
- Name
- Reason
- Address
- Urgency
- Callback Number
- Callback Time

Ask: "Does that look correct?"

If confirmed:
"Perfect. I've passed your information along to the team. Someone will contact you as soon as possible."

OPTIONAL HELP PHASE:
Only AFTER intake is complete, you may answer a few follow-up questions from the caller.

Help Phase Rules:
- Keep responses brief
- Do not guarantee outcomes
- Do not provide professional advice
- Do not replace a licensed professional
- Continue acting as a receptionist

Call Ending:
After intake is complete and any brief follow-up questions are answered:
"Thank you for calling ${businessName}. Have a great day."

Wait 3 seconds for any response.

If caller says nothing, end the conversation naturally.

If caller speaks during the pause, respond briefly and end the conversation.

Do not continue chatting after intake is complete.`;
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
            console.log('[OPENAI AUDIT] websocket library import:', 'ws package');
            const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
            console.log('[OPENAI AUDIT] websocket URL:', wsUrl);
            console.log('[OPENAI AUDIT] model:', 'gpt-realtime');
            console.log('[OPENAI API KEY] exists:', !!OPENAI_API_KEY);
            console.log('[OPENAI API KEY] length:', OPENAI_API_KEY?.length || 0);
            console.log('[OPENAI API KEY] first 8 chars:', OPENAI_API_KEY?.substring(0, 8) || 'N/A');
            console.log('[STREAM OPENAI] creating websocket');
            const headers = {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
            };
            console.log('[OPENAI AUDIT] headers keys:', Object.keys(headers));
            const wsId = Math.random().toString(36).substring(2, 9);
            openAiWs = new WebSocket(wsUrl, { headers });
            (openAiWs as any).wsId = wsId;
            console.log('[WS CREATED] id:', wsId, 'readyState:', openAiWs.readyState);
            
            // Log readyState every second for first 10 seconds
            for (let i = 1; i <= 10; i++) {
              setTimeout(() => {
                if (openAiWs) {
                  console.log(`[WS STATE] id:${(openAiWs as any).wsId} after ${i}s readyState:`, openAiWs.readyState);
                }
              }, i * 1000);
            }
            
            // Add EXTREMELY LOUD websocket event logs with ID
            openAiWs.on('open', () => {
              console.log('[WS OPEN] id:', (openAiWs as any).wsId);
              console.log('[OPENAI OPEN EVENT FIRED]');
            });
            
            openAiWs.on('close', (code, reason) => {
              console.log('[WS CLOSE] id:', (openAiWs as any).wsId, { code, reason });
              console.log('[OPENAI CLOSE EVENT]', { code, reason });
            });
            
            openAiWs.on('error', (error) => {
              console.log('[WS ERROR] id:', (openAiWs as any).wsId, { error: String(error) });
              console.log('[OPENAI ERROR EVENT]', { error: String(error) });
            });
            
            openAiWs.on('unexpected-response', (request, response) => {
              console.log('[WS UNEXPECTED] id:', (openAiWs as any).wsId, { statusCode: response.statusCode });
              console.log('[OPENAI UNEXPECTED RESPONSE]', { statusCode: response.statusCode });
            });
            
            // Add watchdog every 3 seconds
            setInterval(() => {
              if (openAiWs) {
                console.log('[OPENAI WATCHDOG] readyState:', openAiWs.readyState);
              }
            }, 3000);
            
            // Set websocket on Twilio handler so media handler can access it
            (twilioHandler as any).openAiWs = openAiWs;
            console.log('[WS REF] setting on Twilio handler id:', (openAiWs as any).wsId);
            console.log('[OPENAI REF] websocket set on Twilio handler');
            console.log('[OPENAI REF] media handler websocket exists', { exists: !!((twilioHandler as any).openAiWs) });
            
            console.log('[STREAM OPENAI] listeners attaching');

            // Add open timeout
            let opened = false;
            let greetingSent = false;
            let responseCreatedReceived = false;
            let sessionCreated = false;
            let sessionUpdated = false;
            setTimeout(() => {
              if (!opened) {
                console.log('[OPENAI RAW] open timeout (5 seconds)');
              }
            }, 5000);
            
            // Add timeout to detect if greeting is never triggered
            setTimeout(() => {
              if (opened && !greetingSent) {
                console.log('[MISSING] greeting not triggered');
              }
            }, 10000);
            
            // Add timeout to detect if OpenAI ignores response.create
            setTimeout(() => {
              if (greetingSent && !responseCreatedReceived) {
                console.log('[MISSING] OpenAI ignored response.create');
              }
            }, 15000);

            // Add 5-second timer to check CONNECTING state
            setTimeout(() => {
              if (openAiWs && openAiWs.readyState === 0) {
                console.log('[OPENAI AUDIT] stuck in CONNECTING state');
                console.log('[OPENAI AUDIT] websocket URL:', wsUrl);
                console.log('[OPENAI AUDIT] readyState:', openAiWs.readyState);
                console.log('[OPENAI AUDIT] model:', 'gpt-realtime');
                console.log('[OPENAI AUDIT] headers keys:', Object.keys(headers));
              }
            }, 5000);

            // Attach listeners exactly like /test-openai
            console.log('[OPENAI AUDIT] attaching open listener');
            openAiWs.on('open', () => {
              opened = true;
              console.log('[WS OPEN LISTENER] id:', (openAiWs as any).wsId);
              console.log('[OPENAI AUDIT] open listener attached');
              console.log('[OPENAI RAW] open');
              console.log('[OPENAI READY] setting openAiReady to true');
              twilioHandler.setOpenAiReady();
              console.log('[OPENAI READY] openAiReady set to true');
              
              // Configure session for Twilio-compatible audio and turn detection
              const sessionConfig = {
                type: 'session.update',
                session: {
                  type: 'realtime',
                  audio: {
                    input: {
                      format: { type: 'audio/pcmu' },
                      turn_detection: { type: 'server_vad' },
                    },
                    output: {
                      format: { type: 'audio/pcm', rate: 24000 },
                    },
                  },
                },
              };
              console.log('[OPENAI SEND PAYLOAD] session.update:', JSON.stringify(sessionConfig, null, 2));
              console.log('[AUDIO CONFIG] input format: audio/pcmu (g711_ulaw)');
              console.log('[AUDIO CONFIG] output format: audio/pcm (PCM16 24000Hz)');
              console.log('[AUDIO CONFIG] conversion enabled: true (PCM → μ-law)');
              console.log('[OPENAI OUTBOUND] configuring session:', JSON.stringify(sessionConfig, null, 2));
              if (openAiWs) {
                openAiWs.send(JSON.stringify(sessionConfig));
              }
              
              // Send greeting with English-only instructions
              const businessName = (ws as any).businessName || 'ReplyFlow';
              const englishInstructions = `You are a professional English-speaking receptionist for ${businessName}. Always speak English. Do not speak Spanish, French, or any other language unless the caller explicitly asks you to switch languages. If there is silence or unclear audio, continue speaking English. Keep responses short and professional.`;
              
              const testMessage = {
                type: 'response.create',
                response: {
                  instructions: englishInstructions,
                  voice: AI_VOICE,
                },
              };
              console.log('[OPENAI SEND PAYLOAD] response.create:', JSON.stringify(testMessage, null, 2));
              greetingSent = true;
              console.log('[OPENAI SEND] response.create');
              console.log('[GREETING] sent with English-only instructions');
              console.log('[GREETING] instructions:', englishInstructions);
              console.log('[OPENAI OUTBOUND] sending message:', JSON.stringify(testMessage, null, 2));
              if (openAiWs) {
                openAiWs.send(JSON.stringify(testMessage));
              }
              console.log('[OPENAI TEST] test message sent');
              
              // Set flag to enable manual fallback after greeting
              twilioHandler.setGreetingSent();
            });
            console.log('[OPENAI AUDIT] open listener attached');

            console.log('[OPENAI AUDIT] attaching message listener');
            openAiWs.on('message', (data) => {
              console.log('[WS MESSAGE] id:', (openAiWs as any).wsId);
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
                console.log('[SESSION] session updated', JSON.stringify(message.session, null, 2));
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

              // PCM16 to μ-law conversion function
              const pcm16ToMulaw = (pcm16: number): number => {
                // μ-law encoding formula
                const BIAS = 0x84;
                const CLIP = 32635;
                const SIGN_BIT = 0x80;
                
                let sample = Math.max(-CLIP, Math.min(CLIP, pcm16));
                const sign = (sample >> 8) & SIGN_BIT;
                if (sign !== 0) {
                  sample = -sample;
                }
                
                sample += BIAS;
                let exponent = 7;
                for (; exponent > 0; exponent--) {
                  if ((sample & 0x4000) !== 0) break;
                  sample <<= 1;
                }
                
                const mantissa = (sample >> 4) & 0x0F;
                return (sign | (exponent << 4) | mantissa) ^ 0xFF;
              };

              // Handle audio delta
              if (message.type === 'response.output_audio.delta' && message.delta) {
                console.log('[OPENAI RECV] response.output_audio.delta');
                console.log('[AUDIO] delta received');
                console.log('[GREETING] first audio delta received');
                console.log('[AUDIO OUT] OpenAI delta received', { length: message.delta.length });
                
                // Decode base64 to PCM16 buffer
                const pcmBuffer = Buffer.from(message.delta, 'base64');
                console.log('[AUDIO CONVERT] pcm bytes', { length: pcmBuffer.length });
                
                // OpenAI Realtime API returns PCM16 at 24kHz
                // Twilio expects 8kHz μ-law (G.711)
                // Downsample: 24kHz -> 8kHz (take every 3rd sample)
                const sampleCount = Math.floor(pcmBuffer.length / 2);
                const downsampledSamples: Int16Array = new Int16Array(Math.floor(sampleCount / 3));
                for (let i = 0; i < downsampledSamples.length; i++) {
                  downsampledSamples[i] = pcmBuffer.readInt16LE(i * 6);
                }
                console.log('[AUDIO CONVERT] downsampled to 8kHz', { originalSamples: sampleCount, downsampledSamples: downsampledSamples.length });
                
                // Convert PCM16 to μ-law
                const mulawBytes = Buffer.alloc(downsampledSamples.length);
                for (let i = 0; i < downsampledSamples.length; i++) {
                  mulawBytes[i] = pcm16ToMulaw(downsampledSamples[i]);
                }
                console.log('[AUDIO CONVERT] pcm to mulaw');
                
                // Base64 encode μ-law bytes
                const mulawBase64 = mulawBytes.toString('base64');
                console.log('[AUDIO OUT] sending converted mulaw to Twilio', { streamSidExists: !!twilioHandler.getStreamSid(), payloadLength: mulawBase64.length });
                
                // Send audio to Twilio with exact shape
                const mediaMessage = {
                  event: 'media',
                  streamSid: twilioHandler.getStreamSid(),
                  media: {
                    payload: mulawBase64,
                  },
                };
                
                ws.send(JSON.stringify(mediaMessage));
                console.log('[GREETING] first audio sent to Twilio');
                console.log('[AUDIO OUT] sent to Twilio');
              }
            });
            console.log('[OPENAI AUDIT] message listener attached');

            console.log('[OPENAI AUDIT] attaching error listener');
            openAiWs.on('error', (error) => {
              console.log('[OPENAI AUDIT] error listener attached');
              console.log('[OPENAI RAW] error', { error: String(error) });
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
              console.log('[OPENAI AUDIT] close listener attached');
              console.log('[OPENAI RAW] close', { code, reason: reason?.toString() });
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
