/**
 * Twilio Media Stream Handler (Phase 1A POC)
 * 
 * Purpose: Accept Twilio Media Stream connections
 * Minimal implementation - just prove connection works
 */

import WebSocket from 'ws';
import { log, LogLevel } from './logger';

export interface StreamConfig {
  sessionId: string;
  businessId: string;
  callSid: string;
}

export class TwilioStreamHandler {
  private ws: WebSocket | null = null;
  private config: StreamConfig;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  /**
   * Handle incoming WebSocket connection from Twilio
   */
  handleConnection(ws: WebSocket, req: any) {
    this.ws = ws;
    
    log(LogLevel.INFO, 'Twilio connected', {
      sessionId: this.config.sessionId,
      callSid: this.config.callSid,
    });

    // Extract parameters from URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      log(LogLevel.WARN, 'Missing session_id parameter');
      ws.close(1008, 'Missing session_id');
      return;
    }

    // Send connected event
    ws.send(JSON.stringify({ event: 'connected' }));

    // Handle media stream events
    ws.on('message', (data) => {
      this.handleMessage(data);
    });

    ws.on('close', (code, reason) => {
      log(LogLevel.INFO, 'Twilio stream closed', {
        code,
        reason: reason.toString(),
      });
    });

    ws.on('error', (error) => {
      log(LogLevel.ERROR, 'Twilio stream error', error);
    });
  }

  /**
   * Handle incoming messages from Twilio
   */
  private handleMessage(data: any) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.event) {
        case 'start':
          log(LogLevel.INFO, 'Twilio stream started', message);
          break;
        case 'media':
          // Audio data received from Twilio
          log(LogLevel.INFO, 'Audio data received from Twilio', {
            size: message.media?.payload?.length,
          });
          break;
        case 'stop':
          log(LogLevel.INFO, 'Twilio stream stopped');
          break;
        case 'mark':
          log(LogLevel.INFO, 'Twilio connection quality mark', message);
          break;
        default:
          log(LogLevel.INFO, `Twilio event: ${message.event}`);
      }
    } catch (error) {
      log(LogLevel.ERROR, 'Error parsing Twilio message', error);
    }
  }

  /**
   * Send audio to Twilio
   */
  sendAudio(audioData: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        event: 'media',
        media: {
          payload: audioData.toString('base64'),
        },
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Close connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
