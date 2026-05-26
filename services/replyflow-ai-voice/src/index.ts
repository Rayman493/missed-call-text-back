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
import { log, LogLevel } from './logger';
import { OpenAIRealtimeClient } from './openai-client';
import { TwilioStreamHandler } from './twilio-stream';

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  log(LogLevel.ERROR, 'OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Create HTTP server for health checks
const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'ai-voice-poc' }));
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
  log(LogLevel.INFO, '[WS ENTRY] waiting for first message');

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

    let startEventReceived = false;
    let firstMessageLogged = false;
    let openaiClient: any = null;

    // Set 5-second timeout for start event
    const startTimeout = setTimeout(() => {
      log(LogLevel.ERROR, '[AI POC] start event timeout - no start event received within 5 seconds');
      ws.close(1000, 'No start event received');
    }, 5000);

    // Override handleMessage to capture customParameters from start event
    const originalHandleMessage = (twilioHandler as any).handleMessage.bind(twilioHandler);
    (twilioHandler as any).handleMessage = (data: any) => {
      try {
        if (!firstMessageLogged) {
          log(LogLevel.INFO, '[AI POC] first websocket message');
          firstMessageLogged = true;
        }

        const message = JSON.parse(data.toString());

        log(LogLevel.INFO, `[AI POC] Twilio event: ${message.event}`);

        switch (message.event) {
          case 'connected':
            log(LogLevel.INFO, '[AI POC] Twilio connected event received');
            // Send connected acknowledgment
            ws.send(JSON.stringify({ event: 'connected' }));
            break;

          case 'start':
            if (startEventReceived) {
              log(LogLevel.INFO, '[AI POC] start event already processed, skipping');
              originalHandleMessage(data);
              return;
            }

            startEventReceived = true;
            clearTimeout(startTimeout);

            log(LogLevel.INFO, '[AI POC] start payload:', JSON.stringify(message, null, 2));

            const customParams = message.start?.customParameters || {};

            log(LogLevel.INFO, '[AI POC] extracted customParameters:', customParams);

            const sessionId = customParams.sessionId || urlSessionId;
            const callSid = customParams.callSid || urlCallSid;
            const businessId = customParams.businessId || urlBusinessId;

            log(LogLevel.INFO, '[AI POC] parsed sessionId:', sessionId);
            log(LogLevel.INFO, '[AI POC] parsed callSid:', callSid);

            if (!sessionId || !callSid) {
              log(LogLevel.WARN, '[AI POC] Missing Twilio start customParameters');
              ws.close(1008, 'Missing required parameters');
              return;
            }

            // Update handler config with real parameters
            (twilioHandler as any).config = {
              sessionId,
              businessId: businessId || '',
              callSid,
            };

            log(LogLevel.INFO, '[AI POC] Connection parameters validated', { sessionId, callSid });

            // Now initialize OpenAI after receiving start event
            log(LogLevel.INFO, '[AI POC] initializing OpenAI');

            openaiClient = new OpenAIRealtimeClient({
              apiKey: OPENAI_API_KEY,
              model: 'gpt-4o',
              voice: 'alloy',
            });

            openaiClient
              .connect()
              .then(() => {
                log(LogLevel.INFO, '[AI POC] OpenAI connected');

                // Send greeting
                log(LogLevel.INFO, 'Sending greeting...');
                openaiClient.sendGreeting();
                log(LogLevel.INFO, 'Greeting sent');
              })
              .catch((error: Error) => {
                log(LogLevel.ERROR, '[AI POC] Failed to connect to OpenAI', error);

                // Fallback: close connection, Twilio will redirect to voicemail
                log(LogLevel.INFO, '[AI POC] Falling back to voicemail');
                ws.close(1011, 'OpenAI connection failed');
              });

            break;

          case 'media':
            if (!startEventReceived) {
              log(LogLevel.WARN, '[AI POC] media received before start event, ignoring');
              return;
            }
            log(LogLevel.INFO, 'Audio data received from Twilio', {
              size: message.media?.payload?.length,
            });
            break;

          case 'stop':
            log(LogLevel.INFO, '[AI POC] Twilio stop event received');
            break;

          default:
            log(LogLevel.INFO, `[AI POC] Unknown Twilio event: ${message.event}`);
        }

        // Call original handler
        originalHandleMessage(data);
      } catch (error) {
        log(LogLevel.ERROR, '[AI POC] Error parsing Twilio message', error);
      }
    };

    // Handle WebSocket close
    ws.on('close', (code, reason) => {
      clearTimeout(startTimeout);
      log(LogLevel.INFO, '[WS CLOSED]', { code, reason: reason?.toString() });
      if (openaiClient) {
        openaiClient.disconnect();
      }
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
      clearTimeout(startTimeout);
      log(LogLevel.ERROR, '[WS ERROR]', { message: (error as Error).message, stack: (error as Error).stack });
      if (openaiClient) {
        openaiClient.disconnect();
      }
    });

    // Handle Twilio connection
    twilioHandler.handleConnection(ws, req);

  } catch (error) {
    log(LogLevel.ERROR, '[WS FATAL ERROR]', { message: (error as Error).message, stack: (error as Error).stack });
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
