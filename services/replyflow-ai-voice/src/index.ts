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

          const customParams = message.start?.customParameters || {};
          log(LogLevel.INFO, '[AI POC] received custom parameters', customParams);

          const sessionId = customParams.sessionId || urlSessionId;
          const callSid = customParams.callSid || urlCallSid;
          const businessId = customParams.businessId || urlBusinessId;

          log(LogLevel.INFO, '[AI POC] parsed parameters', { sessionId, callSid, businessId });

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
            instructions = `You are the virtual receptionist for ${businessName}.

A caller reached this line after the business was unavailable.

Greet the caller and say:

'Thanks for calling ${businessName}. We missed your call, but I'd be happy to take a message and let the team know what you need.'

Then ask:
'Can I get your name and the reason for your call?'

Be concise and friendly.`;
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
            console.log('[STREAM OPENAI] creating websocket');
            const headers = {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
            };
            console.log('[OPENAI AUDIT] headers keys:', Object.keys(headers));
            openAiWs = new WebSocket(wsUrl, { headers });
            console.log('[STREAM OPENAI] websocket created, readyState:', openAiWs.readyState);
            
            // Log readyState every second for first 5 seconds
            for (let i = 1; i <= 5; i++) {
              setTimeout(() => {
                if (openAiWs) {
                  console.log(`[OPENAI WATCHDOG] after ${i}s readyState:`, openAiWs.readyState);
                }
              }, i * 1000);
            }
            
            // Add watchdog every 3 seconds
            setInterval(() => {
              if (openAiWs) {
                console.log('[OPENAI WATCHDOG] readyState:', openAiWs.readyState);
              }
            }, 3000);
            
            // Set websocket on Twilio handler so media handler can access it
            (twilioHandler as any).openAiWs = openAiWs;
            console.log('[OPENAI REF] websocket set on Twilio handler');
            console.log('[OPENAI REF] media handler websocket exists', { exists: !!((twilioHandler as any).openAiWs) });
            
            console.log('[STREAM OPENAI] listeners attaching');

            // Add open timeout
            let opened = false;
            setTimeout(() => {
              if (!opened) {
                console.log('[OPENAI RAW] open timeout (5 seconds)');
              }
            }, 5000);

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
              console.log('[OPENAI AUDIT] open listener attached');
              console.log('[OPENAI RAW] open');
              console.log('[OPENAI READY] setting openAiReady to true');
              twilioHandler.setOpenAiReady();
              console.log('[OPENAI READY] openAiReady set to true');
              
              // Send test message with dynamic instructions
              const instructions = (ws as any).aiInstructions || 'Hello from ReplyFlow.';
              
              // Configure session for Twilio-compatible audio and turn detection
              const sessionConfig = {
                type: 'session.update',
                session: {
                  audio: {
                    input_format: 'g711_ulaw',
                    output_format: 'pcm16',
                  },
                  turn_detection: {
                    type: 'server_vad',
                  },
                },
              };
              console.log('[OPENAI OUTBOUND] configuring session:', JSON.stringify(sessionConfig, null, 2));
              if (openAiWs) {
                openAiWs.send(JSON.stringify(sessionConfig));
              }
              
              const testMessage = {
                type: 'response.create',
                response: {
                  instructions: instructions,
                },
              };
              console.log('[OPENAI OUTBOUND] sending message:', JSON.stringify(testMessage, null, 2));
              console.log('[OPENAI TEST] sending test message');
              if (openAiWs) {
                openAiWs.send(JSON.stringify(testMessage));
              }
              console.log('[OPENAI TEST] test message sent');
            });
            console.log('[OPENAI AUDIT] open listener attached');

            console.log('[OPENAI AUDIT] attaching message listener');
            openAiWs.on('message', (data) => {
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

              // Log every message type
              console.log('[OPENAI WS] message type', { type: message.type });

              // Log input audio events
              if (message.type === 'input_audio_buffer.speech_started') {
                console.log('[OPENAI IN] input_audio_buffer.speech_started');
              }
              if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log('[OPENAI IN] input_audio_buffer.speech_stopped');
              }
              if (message.type === 'response.created') {
                console.log('[OPENAI IN] response.created');
              }
              if (message.type === 'response.output_audio.delta') {
                console.log('[OPENAI IN] response.output_audio.delta');
              }
              if (message.type === 'response.done') {
                console.log('[AI TURN] response triggered after caller speech');
              }

              // Log full error payload
              if (message.type === 'error') {
                console.log('[OPENAI ERROR] full payload', JSON.stringify(message, null, 2));
              }

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
                console.log('[AUDIO OUT] OpenAI audio delta received', { length: message.delta.length });
                
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
                console.log('[AUDIO CONVERT] mulaw bytes', { length: mulawBytes.length });
                
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
                console.log('[AUDIO OUT] sent converted mulaw to Twilio');
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
