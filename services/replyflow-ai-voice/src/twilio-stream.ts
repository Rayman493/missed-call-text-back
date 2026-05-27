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
  private streamSid: string | null = null;
  private openAiReady: boolean = false;
  private mediaBuffer: Buffer[] = [];
  private turnDetectionTimer: NodeJS.Timeout | null = null;
  private lastAudioTime: number = 0;

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
   * Mark OpenAI as ready and flush buffered media
   */
  setOpenAiReady() {
    console.log('[STREAM] OpenAI ready, flushing buffer', { bufferSize: this.mediaBuffer.length });
    this.openAiReady = true;
    
    // Flush buffered media
    while (this.mediaBuffer.length > 0) {
      const audioBuffer = this.mediaBuffer.shift();
      if (audioBuffer && this.openAiClient) {
        this.openAiClient.sendAudio(audioBuffer);
      }
    }
    console.log('[STREAM] buffer flushed');
  }

  /**
   * Get the streamSid for Twilio media events
   */
  getStreamSid(): string | null {
    return this.streamSid;
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
          this.streamSid = message.streamSid || null;
          log(LogLevel.INFO, '[STREAM] streamSid extracted', { streamSid: this.streamSid });
          break;
        case 'media':
          log(LogLevel.INFO, '[MEDIA] entered media handler');
          log(LogLevel.INFO, '[MEDIA] openAiWs exists', { exists: !!((this as any).openAiWs) });
          log(LogLevel.INFO, '[MEDIA] openAiReady', { ready: this.openAiReady });
          
          if (!(this as any).openAiWs) {
            log(LogLevel.INFO, '[MEDIA] returning because OpenAI websocket not initialized');
            break;
          }

          // Audio data received from Twilio
          log(LogLevel.INFO, 'Audio data received from Twilio', {
            size: message.media?.payload?.length,
          });

          log(LogLevel.INFO, '[MEDIA] before audio append');
          
          // Decode base64 audio
          const audioPayload = message.media?.payload;
          if (audioPayload) {
            const audioBuffer = Buffer.from(audioPayload, 'base64');
            
            if (this.openAiReady) {
              // Send caller audio to OpenAI
              const openAiWs = (this as any).openAiWs;
              if (openAiWs) {
                const audioMessage = {
                  type: 'input_audio_buffer.append',
                  audio: audioBuffer.toString('base64'),
                };
                openAiWs.send(JSON.stringify(audioMessage));
                log(LogLevel.INFO, '[CALLER AUDIO] sent to OpenAI', { payloadLength: audioMessage.audio.length });
                
                // Manual turn detection fallback
                this.lastAudioTime = Date.now();
                
                // Clear existing timer
                if (this.turnDetectionTimer) {
                  clearTimeout(this.turnDetectionTimer);
                }
                
                // Set timer to commit after 1.5 seconds of silence
                this.turnDetectionTimer = setTimeout(() => {
                  if (openAiWs && this.lastAudioTime > 0) {
                    const commitMessage = {
                      type: 'input_audio_buffer.commit',
                    };
                    openAiWs.send(JSON.stringify(commitMessage));
                    log(LogLevel.INFO, '[TURN] commit sent');
                    
                    // Send response.create
                    const responseMessage = {
                      type: 'response.create',
                    };
                    openAiWs.send(JSON.stringify(responseMessage));
                    log(LogLevel.INFO, '[TURN] response.create sent');
                  }
                }, 1500);
              }
            } else {
              // Buffer if OpenAI is not ready, cap at 100 packets
              if (this.mediaBuffer.length < 100) {
                this.mediaBuffer.push(audioBuffer);
                log(LogLevel.INFO, '[MEDIA] audio buffered', { bufferSize: this.mediaBuffer.length });
              } else {
                log(LogLevel.INFO, '[MEDIA] buffer full, dropping audio');
              }
            }
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
