/**
 * Twilio Media Stream Handler (Phase 1A POC)
 * 
 * Purpose: Accept Twilio Media Stream connections
 * Minimal implementation - just prove connection works
 */

import WebSocket from 'ws';
import { log, LogLevel } from './logger';
import { OpenAIRealtimeClient } from './openai-client';

export interface StreamConfig {
  sessionId: string;
  businessId: string;
  callSid: string;
}

export class TwilioStreamHandler {
  private ws: WebSocket | null = null;
  private config: StreamConfig;
  private openAiClient: OpenAIRealtimeClient | null = null;

  constructor(config: StreamConfig, openAiClient?: OpenAIRealtimeClient) {
    this.config = config;
    this.openAiClient = openAiClient || null;
  }

  /**
   * Set the OpenAI client after initialization
   */
  setOpenAIClient(client: OpenAIRealtimeClient) {
    this.openAiClient = client;
  }

  /**
   * Handle incoming WebSocket connection from Twilio
   */
  handleConnection(ws: WebSocket, req: any) {
    this.ws = ws;

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
          log(LogLevel.INFO, '[MEDIA] entered media handler');
          log(LogLevel.INFO, '[MEDIA] openAiWs exists', { exists: !!this.openAiClient });
          
          if (!this.openAiClient) {
            log(LogLevel.INFO, '[MEDIA] returning because OpenAI client not initialized');
            break;
          }

          // Audio data received from Twilio
          log(LogLevel.INFO, 'Audio data received from Twilio', {
            size: message.media?.payload?.length,
          });

          log(LogLevel.INFO, '[MEDIA] before audio append');
          
          // Decode base64 audio and forward to OpenAI
          const audioPayload = message.media?.payload;
          if (audioPayload) {
            const audioBuffer = Buffer.from(audioPayload, 'base64');
            this.openAiClient.sendAudio(audioBuffer);
            log(LogLevel.INFO, '[MEDIA] after audio append');
          } else {
            log(LogLevel.INFO, '[MEDIA] skipping because no audio payload');
          }
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
