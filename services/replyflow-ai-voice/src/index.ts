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
    // Extract parameters from URL
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');
    const businessId = url.searchParams.get('business_id');
    const callSid = url.searchParams.get('call_sid');

    if (!sessionId || !callSid) {
      log(LogLevel.WARN, 'Missing required parameters', { sessionId, callSid });
      ws.close(1008, 'Missing required parameters');
      return;
    }

    log(LogLevel.INFO, 'Connection parameters', { sessionId, businessId, callSid });

    // Create Twilio stream handler
    const twilioHandler = new TwilioStreamHandler({
      sessionId,
      businessId: businessId || '',
      callSid,
    });

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
