/**
 * Twilio Media Stream Handler (Phase 1A POC)
 * 
 * Purpose: Accept Twilio Media Stream connections
 * Minimal implementation - just prove connection works
 */

import WebSocket from 'ws';
import { log, LogLevel } from './logger';
import { OpenAIRealtimeClient } from './openai-client';
import Twilio from 'twilio';

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
  private twilioClient: any = null;

  constructor(config: StreamConfig, openAiClient?: OpenAIRealtimeClient) {
    this.config = config;
    this.openAiClient = openAiClient || null;
    
    // Initialize Twilio client for hangup functionality
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (accountSid && authToken) {
        this.twilioClient = Twilio(accountSid, authToken);
        console.log('[TWILIO CLIENT] Initialized successfully for hangup functionality');
      } else {
        console.log('[TWILIO CLIENT] Missing credentials, hangup via REST API unavailable');
        console.log('[TWILIO CLIENT] Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN');
      }
    } catch (error) {
      console.log('[TWILIO CLIENT] Failed to initialize:', error);
      this.twilioClient = null;
    }
  }

  /**
   * Set the OpenAI client after initialization
   */
  setOpenAIClient(client: OpenAIRealtimeClient) {
    this.openAiClient = client;
  }

  /**
   * Set callback for mark received events
   */
  setOnMarkReceived(callback: (markName: string) => void) {
    (this as any).onMarkReceived = callback;
  }

  /**
   * Set greeting sent flag for manual turn detection
   */
  setGreetingSent() {
    (this as any).greetingSent = true;
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
          if (!(this as any).openAiWs) {
            break;
          }

          // Decode base64 audio
          const audioPayload = message.media?.payload;
          if (audioPayload) {
            const audioBuffer = Buffer.from(audioPayload, 'base64');
            
            if (this.openAiReady) {
              // Check if stream is ready to accept audio
              const streamReady = (this as any).streamReady || false;
              if (!streamReady) {
                // Buffer audio until streamReady
                const audioBufferList = (this as any).audioBuffer || [];
                audioBufferList.push(audioBuffer);
                (this as any).audioBuffer = audioBufferList;
                return;
              }
              
              // Send caller audio to OpenAI
              const openAiWs = (this as any).openAiWs;
              const greetingSent = (this as any).greetingSent || false;
              const callState = (this as any).callState || 'active';
              const assistantSpeaking = (this as any).assistantSpeaking || false;
              const terminalClosingResponseStarted = (this as any).terminalClosingResponseStarted || false;
              const confirmationState = (this as any).confirmationState || 'collecting_info';

              // Hard guard: Do not append caller audio when call is not active or assistant is speaking
              if (callState !== 'active') {
                // CRITICAL: Check if this is an invalid closing state
                if (callState === 'closing' && !terminalClosingResponseStarted) {
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] callState is closing but terminalClosingResponseStarted is false');
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] This indicates premature closing before terminal goodbye started');
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] callState:', callState);
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] terminalClosingResponseStarted:', terminalClosingResponseStarted);
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] confirmationState:', confirmationState);
                  console.log('[CRITICAL_INVALID_CLOSING_STATE] NOT treating as terminal closing - allowing audio to continue');
                  // Do NOT block audio - this is an invalid state
                } else {
                  console.log('[INBOUND CALLER AUDIO BLOCKED - CALL STATE]', { callState });
                  return;
                }
              }

              if (assistantSpeaking) {
                console.log('[INBOUND CALLER AUDIO SKIPPED - ASSISTANT SPEAKING]', { assistantSpeaking });
                return;
              }

              if (openAiWs) {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OPENAI INPUT AUDIO APPEND START]', { callState, assistantSpeaking });
                }
                const audioMessage = {
                  type: 'input_audio_buffer.append',
                  audio: audioBuffer.toString('base64'),
                };
                try {
                  openAiWs.send(JSON.stringify(audioMessage));
                  if (process.env.DEBUG_AI_VOICE === 'true') {
                    console.log('[OPENAI INPUT AUDIO APPEND SENT]', { audioLength: audioBuffer.length });
                  }
                } catch (error) {
                  console.log('[OPENAI INPUT AUDIO APPEND ERROR]', error);
                }
                
                // DISABLED FOR AUDIO FORMAT DEBUGGING
                // Manual turn detection fallback after greeting
                /*
                if (greetingSent) {
                  log(LogLevel.INFO, '[TURN] caller audio received after greeting');
                  
                  // Clear existing timer
                  if (this.turnDetectionTimer) {
                    clearTimeout(this.turnDetectionTimer);
                  }
                  
                  // Set timer to commit after 2 seconds
                  this.turnDetectionTimer = setTimeout(() => {
                    if (openAiWs) {
                      const commitMessage = {
                        type: 'input_audio_buffer.commit',
                      };
                      openAiWs.send(JSON.stringify(commitMessage));
                      log(LogLevel.INFO, '[TURN] manual commit sent');
                      
                      // Send response.create
                      const responseMessage = {
                        type: 'response.create',
                        response: {
                          instructions: 'Always respond in English only.',
                        },
                      };
                      openAiWs.send(JSON.stringify(responseMessage));
                      log(LogLevel.INFO, '[TURN] response.create sent');
                    }
                  }, 2000);
                }
                */
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
          console.log('[TWILIO MARK RECEIVED]', { markName: message.mark?.name });
          // Notify main handler about mark received
          if (message.mark?.name && (this as any).onMarkReceived) {
            (this as any).onMarkReceived(message.mark.name);
          }
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
      const callState = (this as any).callState || 'active';
      const finalClosingStarted = (this as any).finalClosingStarted || false;
      
      // Log when final goodbye audio is sent to Twilio
      if (finalClosingStarted) {
        console.log('[FINAL GOODBYE AUDIO SENT] Final goodbye audio sent to Twilio');
        console.log('[FINAL GOODBYE AUDIO SENT] Timestamp:', new Date().toISOString());
        console.log('[FINAL GOODBYE AUDIO SENT] callState:', callState);
        console.log('[FINAL GOODBYE AUDIO SENT] audioLength:', audioData.length);
      }
      
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
   * Send a mark to Twilio to track audio playback completion
   */
  sendMark(markName: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        event: 'mark',
        mark: {
          name: markName,
        },
      };
      this.ws.send(JSON.stringify(message));
      console.log('[TWILIO MARK SENT]', { markName });
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
