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
  log(LogLevel.INFO, 'WebSocket connection received');

  try {
    // Extract parameters from URL (fallback)
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

    // Override handleMessage to capture customParameters from start event
    const originalHandleMessage = (twilioHandler as any).handleMessage.bind(twilioHandler);
    (twilioHandler as any).handleMessage = (data: any) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.event === 'start') {
          const customParams = message.start?.customParameters || {};
          const sessionId = customParams.sessionId || urlSessionId;
          const callSid = customParams.callSid || urlCallSid;
          const businessId = customParams.businessId || urlBusinessId;

          log(LogLevel.INFO, '[AI POC] Twilio start event customParameters:', customParams);
          log(LogLevel.INFO, '[AI POC] parsed sessionId:', sessionId);
          log(LogLevel.INFO, '[AI POC] parsed callSid:', callSid);

          if (!sessionId || !callSid) {
            log(LogLevel.WARN, '[AI POC] Missing required parameters from both URL and customParameters');
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
        }

        // Call original handler
        originalHandleMessage(data);
      } catch (error) {
        log(LogLevel.ERROR, '[AI POC] Error parsing Twilio message', error);
      }
    };

    // Handle Twilio connection
    twilioHandler.handleConnection(ws, req);

    // Connect to OpenAI Realtime
    const openaiClient = new OpenAIRealtimeClient({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4o',
      voice: 'alloy',
    });

    log(LogLevel.INFO, 'Connecting to OpenAI...');

    openaiClient
      .connect()
      .then(() => {
        log(LogLevel.INFO, 'OpenAI connected successfully');
        
        // Send greeting
        log(LogLevel.INFO, 'Sending greeting...');
        openaiClient.sendGreeting();
        log(LogLevel.INFO, 'Greeting sent');
      })
      .catch((error) => {
        log(LogLevel.ERROR, 'Failed to connect to OpenAI', error);
        
        // Fallback: close connection, Twilio will redirect to voicemail
        log(LogLevel.INFO, 'Falling back to voicemail');
        ws.close(1011, 'OpenAI connection failed');
      });

    // Handle WebSocket close
    ws.on('close', () => {
      log(LogLevel.INFO, 'WebSocket connection closed');
      openaiClient.disconnect();
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
      log(LogLevel.ERROR, 'WebSocket error', error);
      openaiClient.disconnect();
    });

  } catch (error) {
    log(LogLevel.ERROR, 'Error handling connection', error);
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
