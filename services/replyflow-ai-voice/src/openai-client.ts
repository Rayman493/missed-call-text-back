/**
 * Minimal OpenAI Realtime Client (Phase 1A POC)
 * 
 * Purpose: Prove connection to OpenAI Realtime API
 * No conversation handling, no extraction, just connection + greeting
 */

import WebSocket from 'ws';
import { log, LogLevel } from './logger';

// Log ws package version
console.log('[OPENAI] ws package version:', require('ws/package.json').version);
console.log('[OPENAI] import statement:', 'import WebSocket from "ws"');

// Approved assistant utterances per stage - strict allowlist
const APPROVED_UTTERANCES: Record<string, string> = {
  ask_name_reason: "Hi, I'm the assistant for the business. Can you please tell me your name and what you're calling about today?",
  ask_details: "Thanks. Can you share any important details the business should know?",
  ask_location_or_context: "Thanks. What location should the business know about?",
  ask_timing: "Got it. When would you like this completed or scheduled?",
  ask_callback_time: "Thanks. What is the best time for the business to call you back?",
  complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
};

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  voice?: string;
  onAudioDelta?: (delta: string) => void;
  onOpen?: () => void;
  onSessionUpdated?: () => void;
  currentStage?: string; // Current intake stage for validation
  responseId?: string; // Current response ID for logging
}

enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  CLOSED = 'closed',
  ERROR = 'error',
}

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private config: OpenAIConfig;
  private connectionState: ConnectionState = ConnectionState.IDLE;
  private timeoutId: NodeJS.Timeout | null = null;
  private sessionUpdateTimeoutId: NodeJS.Timeout | null = null;
  private sessionUpdatedReceived: boolean = false;
  private currentTranscript: string = ''; // Track assistant transcript for validation
  private audioForwardingBlocked: boolean = false; // Block audio if validation fails

  constructor(config: OpenAIConfig) {
    this.config = {
      model: config.model || 'gpt-4o',
      voice: config.voice || 'alloy',
      ...config,
    };
  }

  /**
   * Connect to OpenAI Realtime API
   */
  connect(): Promise<void> {
    // Connection state guard: prevent multiple simultaneous connections
    if (this.connectionState === ConnectionState.CONNECTING) {
      log(LogLevel.WARN, 'Connection already in progress');
      return Promise.reject(new Error('Connection already in progress'));
    }

    if (this.connectionState === ConnectionState.CONNECTED) {
      log(LogLevel.INFO, 'Already connected');
      return Promise.resolve();
    }

    this.connectionState = ConnectionState.CONNECTING;

    return new Promise((resolve, reject) => {
      log(LogLevel.INFO, 'Connecting to OpenAI Realtime API');

      // Log API key presence without logging the key itself
      log(LogLevel.INFO, '[AI POC] OpenAI key present', {
        exists: !!this.config.apiKey,
        length: this.config.apiKey?.length,
      });

      // Use gpt-4o-realtime-preview model in URL query string for GA API
      const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
      const headers = {
        'Authorization': `Bearer ${this.config.apiKey}`,
      };

      log(LogLevel.INFO, '[AI POC] OPENAI URL FINAL', { url: wsUrl });
      log(LogLevel.INFO, '[AI POC] OPENAI HEADERS FINAL', {
        'Authorization': headers.Authorization ? '[REDACTED]' : undefined,
      });

      try {
        console.log('[STREAM OPENAI] creating websocket');
        this.ws = new WebSocket(wsUrl, {
          headers: headers,
        });
        console.log('[STREAM OPENAI] websocket created');

        console.log('[OPENAI] attaching listeners');
        
        // Low-level ws listeners for debugging
        this.ws.on('open', () => {
          console.log('[OPENAI RAW] open');
        });
        
        this.ws.on('message', (data) => {
          console.log('[OPENAI RAW] message', { first200: data.toString().substring(0, 200) });
        });
        
        this.ws.on('error', (error) => {
          console.log('[OPENAI RAW] error', { error: String(error) });
        });
        
        this.ws.on('close', (code, reason) => {
          console.log('[OPENAI RAW] close', { code, reason: reason?.toString() });
        });
        
        console.log('[OPENAI LISTENERS] attached to ws instance');
        
        log(LogLevel.INFO, '[OPENAI] websocket object created');
        log(LogLevel.INFO, '[OPENAI] full websocket URL', { url: wsUrl });
        log(LogLevel.INFO, '[OPENAI] exact model being used', { model: 'gpt-4o-realtime-preview' });

        // Log readyState every second for 15 seconds
        let readyStateCheckCount = 0;
        const readyStateInterval = setInterval(() => {
          if (!this.ws) {
            clearInterval(readyStateInterval);
            return;
          }
          const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
          readyStateCheckCount++;
          log(LogLevel.INFO, '[OPENAI] readyState', {
            state: states[this.ws.readyState] || 'UNKNOWN',
            readyState: this.ws.readyState,
            seconds: readyStateCheckCount,
          });
          
          // Check if stuck in CONNECTING after 10 seconds
          if (readyStateCheckCount === 10 && this.ws.readyState === 0) {
            log(LogLevel.ERROR, '[OPENAI] stuck in CONNECTING after 10 seconds');
          }
          
          if (readyStateCheckCount >= 15) {
            clearInterval(readyStateInterval);
            log(LogLevel.ERROR, '[OPENAI] readyState check timeout after 15 seconds');
          }
        }, 1000);

        this.ws.on('open', () => {
          console.log('[STREAM OPENAI] websocket open event fired');
          console.log('[OPENAI] open event fired');
          clearInterval(readyStateInterval);
          log(LogLevel.INFO, '[OPENAI] websocket open event fired');
          log(LogLevel.INFO, '[AI POC] OpenAI connected');

          // Send minimal test message
          const testMessage = {
            type: 'response.create',
            response: {
              modalities: ['audio', 'text'],
              instructions: 'Say exactly: Hello from ReplyFlow. Always respond in English only.',
            },
          };
          console.log('[AI RESPONSE LANGUAGE LOCK SENT] english - test message');
          console.log('[OPENAI TEST] sending test message');
          if (this.ws) {
            this.ws.send(JSON.stringify(testMessage));
          }
          console.log('[OPENAI TEST] test message sent');

          this.connectionState = ConnectionState.CONNECTED;
          resolve();
        });

        this.ws.on('error', (error) => {
          console.log('[STREAM OPENAI] websocket error event fired', error);
          console.log('[OPENAI] error event fired', error);
          clearInterval(readyStateInterval);
          log(LogLevel.ERROR, '[OPENAI] websocket error event fired', error as Error);
          log(LogLevel.ERROR, '[OPENAI] full error object', JSON.stringify(error, null, 2));
          log(LogLevel.ERROR, '[AI POC] OpenAI websocket error', error as Error);
          this.connectionState = ConnectionState.ERROR;
          this.clearTimeout();
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          console.log('[STREAM OPENAI] websocket close event fired', { code, reason: reason?.toString() });
          clearInterval(readyStateInterval);
          log(LogLevel.INFO, '[OPENAI] websocket close event fired');
          log(LogLevel.INFO, '[AI POC] OPENAI CLOSE', { code, reason: reason?.toString() });
          log(LogLevel.ERROR, '[AI POC] OpenAI websocket closed', {
            code,
            reason: reason?.toString(),
          });
          this.connectionState = ConnectionState.CLOSED;
          this.clearTimeout();
        });

        this.ws.on('unexpected-response', (request, response) => {
          console.log('[OPENAI] unexpected-response event fired', { statusCode: response.statusCode, headers: response.headers });
          log(LogLevel.ERROR, '[OPENAI] unexpected-response event fired', {
            statusCode: response.statusCode,
            headers: response.headers,
          });
        });

        console.log('[OPENAI] listeners attached');

        // Check websocket state after 5 seconds
        setTimeout(() => {
          if (this.ws) {
            const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
            console.log('[OPENAI] state after 5s', {
              readyState: this.ws.readyState,
              state: states[this.ws.readyState] || 'UNKNOWN',
            });
          }
        }, 5000);

        // Check websocket state after 15 seconds
        setTimeout(() => {
          if (this.ws) {
            const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
            console.log('[OPENAI] state after 15s', {
              readyState: this.ws.readyState,
              state: states[this.ws.readyState] || 'UNKNOWN',
            });
          }
        }, 15000);

        this.ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          log(LogLevel.INFO, '[AI POC] OPENAI MESSAGE RECEIVED', JSON.stringify(message, null, 2));
          log(LogLevel.INFO, '[AI POC] OPENAI INBOUND MESSAGE', JSON.stringify(message, null, 2));
          this.handleMessage(message);
        });

        // 10 second timeout with cleanup
        this.timeoutId = setTimeout(() => {
          clearInterval(readyStateInterval);
          log(LogLevel.ERROR, 'OpenAI connection timeout');

          // Cleanup: close WebSocket if it exists
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }

          this.connectionState = ConnectionState.ERROR;
          this.timeoutId = null;

          reject(new Error('OpenAI connection timeout'));
        }, 10000);
      } catch (error) {
        log(LogLevel.ERROR, '[AI POC] OpenAI websocket creation failed', error as Error);
        this.connectionState = ConnectionState.ERROR;
        reject(error);
      }
    });
  }

  /**
   * Clear timeout if exists
   */
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Send session update with greeting
   */
  private sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    log(LogLevel.INFO, '[AI POC] Using GA Realtime API schema');
    log(LogLevel.INFO, '[AI POC] exact model being used', { model: 'gpt-4o-realtime-preview' });

    // Configure session with full configuration for Twilio compatibility
    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: 'You are ReplyFlow\'s phone assistant. You must speak only English. Always respond in clear American English. Never speak Spanish, French, or any other language. If audio is unclear, silence, background noise, or the caller speaks another language, still respond in English only.',
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000
            },
            transcription: {
              model: 'whisper-1',
              language: 'en'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
              create_response: false
            }
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: 24000
            },
            voice: this.config.voice || 'alloy'
          }
        }
      },
    };
    
    // Safety assertion to prevent invalid payload
    if ('turn_detection' in sessionUpdate.session) {
      throw new Error('Invalid payload: session.turn_detection is not allowed');
    }

    console.log('[AI ACTIVE ROUTE] replyflow-ai-voice /stream language-lock-enabled=true');
    console.log('[AI SESSION LANGUAGE LOCK SENT] english - strict lock applied');
    console.log('[OPENAI SESSION] session.update sent');
    console.log('[OPENAI SESSION] session.update fields', {
      type: sessionUpdate.type,
      sessionFields: Object.keys(sessionUpdate.session),
    });
    log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(sessionUpdate, null, 2));
    this.ws.send(JSON.stringify(sessionUpdate));
    log(LogLevel.INFO, 'Session update sent to OpenAI');
  }

  /**
   * Send greeting audio
   */
  sendGreeting() {
    // For Phase 1A, we'll use text-to-speech via the API
    // This is a simplified approach for the POC
    log(LogLevel.INFO, 'Sending greeting via OpenAI');

    // Send a text message that will be converted to speech
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Thanks for calling ReplyFlow. May I have your name?',
          },
        ],
      },
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[AI GREETING ENGLISH SENT] hardcoded English greeting');
      log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(message, null, 2));
      this.ws.send(JSON.stringify(message));

      // Request response generation
      const createResponse = {
        type: 'response.create',
        response: {
          instructions: 'Always respond in English only.',
        },
      };
      console.log('[AI RESPONSE LANGUAGE LOCK SENT] english - greeting');
      log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(createResponse, null, 2));
      this.ws.send(JSON.stringify(createResponse));

      log(LogLevel.INFO, 'Greeting sent to OpenAI');
    }
  }

  /**
   * Update current stage for validation
   */
  setCurrentStage(stage: string) {
    this.config.currentStage = stage;
    console.log('[OPENAI CLIENT] currentStage updated:', stage);
  }

  /**
   * Update response ID for logging
   */
  setResponseId(responseId: string) {
    this.config.responseId = responseId;
    console.log('[OPENAI CLIENT] responseId updated:', responseId);
  }

  /**
   * Reset transcript and blocking state for new response
   */
  resetValidationState() {
    this.currentTranscript = '';
    this.audioForwardingBlocked = false;
    console.log('[OPENAI CLIENT] validation state reset');
  }

  /**
   * Handle incoming messages from OpenAI
   */
  private handleMessage(message: any) {
    console.log('[OPENAI IN] type', { type: message.type });
    switch (message.type) {
      case 'session.created':
        console.log('[OPENAI SESSION] session.created received');
        log(LogLevel.INFO, '[AI POC] OpenAI session created');
        break;
      case 'session.updated':
        console.log('[OPENAI SESSION] session.updated received');
        console.log('[AI SESSION LANGUAGE LOCK ACKED] english - strict lock confirmed');
        this.sessionUpdatedReceived = true;
        if (this.sessionUpdateTimeoutId) {
          clearTimeout(this.sessionUpdateTimeoutId);
          this.sessionUpdateTimeoutId = null;
        }
        log(LogLevel.INFO, '[AI POC] OpenAI session updated');
        // Log audio config fields only
        if (message.session) {
          console.log('[OPENAI SESSION] audio config', {
            input_audio_format: message.session.input_audio_format,
            output_audio_format: message.session.output_audio_format,
          });
        }
        // Call onSessionUpdated callback to notify listeners
        if (this.config.onSessionUpdated) {
          this.config.onSessionUpdated();
        }
        break;
      case 'error':
        console.log('[OPENAI ERROR]', {
          type: message.error?.type,
          code: message.error?.code,
          message: message.error?.message,
          param: message.error?.param,
        });
        log(LogLevel.ERROR, '[AI POC] OpenAI error', message.error);
        break;
      case 'response.created':
        console.log('[OPENAI RESPONSE] response.created received');
        log(LogLevel.INFO, '[AI POC] OpenAI response created');
        // Reset validation state for new response
        this.resetValidationState();
        break;
      case 'response.output_audio.delta':
        console.log('[AUDIO OUT] delta received', { length: message.delta?.length, type: typeof message.delta });
        // Block audio if validation has failed
        if (this.audioForwardingBlocked) {
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] =========================================');
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] Audio forwarding blocked - transcript did not match approved utterance');
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] currentStage:', this.config.currentStage);
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] actualTranscript:', this.currentTranscript);
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] responseId:', this.config.responseId);
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] Timestamp:', new Date().toISOString());
          console.log('[UNAPPROVED ASSISTANT AUDIO BLOCKED] =========================================');
          return;
        }
        // Forward audio to Twilio via callback
        if (this.config.onAudioDelta && message.delta) {
          console.log('[AUDIO OUT] about to send audio to Twilio');
          this.config.onAudioDelta(message.delta);
          console.log('[AUDIO OUT] sent audio to Twilio');
        }
        break;
      case 'response.done':
        console.log('[OPENAI RESPONSE] response.done received');
        log(LogLevel.INFO, '[AI POC] OpenAI response done');
        break;
      case 'response.output_audio_transcript.delta':
        log(LogLevel.INFO, '[AI POC] received OpenAI transcript delta (GA schema)');
        // Capture transcript for validation
        if (message.delta) {
          this.currentTranscript += message.delta;
          console.log('[TRANSCRIPT CAPTURED] =========================================');
          console.log('[TRANSCRIPT CAPTURED] delta:', message.delta);
          console.log('[TRANSCRIPT CAPTURED] currentTranscript:', this.currentTranscript);
          console.log('[TRANSCRIPT CAPTURED] currentStage:', this.config.currentStage);
          console.log('[TRANSCRIPT CAPTURED] Timestamp:', new Date().toISOString());
          console.log('[TRANSCRIPT CAPTURED] =========================================');

          // Validate transcript against approved utterance for current stage
          if (this.config.currentStage && APPROVED_UTTERANCES[this.config.currentStage]) {
            const expectedUtterance = APPROVED_UTTERANCES[this.config.currentStage];
            const normalizedTranscript = this.currentTranscript.trim().toLowerCase();
            const normalizedExpected = expectedUtterance.trim().toLowerCase();

            // Check if transcript matches or starts with approved utterance
            const isMatch = normalizedTranscript === normalizedExpected || normalizedExpected.startsWith(normalizedTranscript);

            console.log('[TRANSCRIPT VALIDATION] =========================================');
            console.log('[TRANSCRIPT VALIDATION] currentStage:', this.config.currentStage);
            console.log('[TRANSCRIPT VALIDATION] expectedUtterance:', expectedUtterance);
            console.log('[TRANSCRIPT VALIDATION] actualTranscript:', this.currentTranscript);
            console.log('[TRANSCRIPT VALIDATION] normalizedExpected:', normalizedExpected);
            console.log('[TRANSCRIPT VALIDATION] normalizedTranscript:', normalizedTranscript);
            console.log('[TRANSCRIPT VALIDATION] isMatch:', isMatch);
            console.log('[TRANSCRIPT VALIDATION] responseId:', this.config.responseId);
            console.log('[TRANSCRIPT VALIDATION] Timestamp:', new Date().toISOString());
            console.log('[TRANSCRIPT VALIDATION] =========================================');

            if (!isMatch && normalizedTranscript.length > 0) {
              // Transcript does not match approved utterance - block audio
              this.audioForwardingBlocked = true;
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] =========================================');
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] Assistant transcript does not match approved utterance');
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] currentStage:', this.config.currentStage);
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] expectedUtterance:', expectedUtterance);
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] actualTranscript:', this.currentTranscript);
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] responseId:', this.config.responseId);
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] Audio forwarding will be blocked');
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] Timestamp:', new Date().toISOString());
              console.log('[UNAPPROVED ASSISTANT TRANSCRIPT DETECTED] =========================================');
            }
          } else if (!this.config.currentStage) {
            console.log('[TRANSCRIPT VALIDATION WARNING] =========================================');
            console.log('[TRANSCRIPT VALIDATION WARNING] No currentStage set - cannot validate transcript');
            console.log('[TRANSCRIPT VALIDATION WARNING] actualTranscript:', this.currentTranscript);
            console.log('[TRANSCRIPT VALIDATION WARNING] Timestamp:', new Date().toISOString());
            console.log('[TRANSCRIPT VALIDATION WARNING] =========================================');
          }
        }
        // Do not send transcript to Twilio
        break;
      case 'response.output_audio.done':
        log(LogLevel.INFO, '[AI POC] OpenAI response.output_audio.done received');
        break;
      case 'response.done':
        log(LogLevel.INFO, '[AI POC] OpenAI response.done received');
        break;
      case 'error':
        log(LogLevel.ERROR, '[AI POC] OpenAI error', message.error);
        break;
      default:
        // Log other message types for debugging
        log(LogLevel.INFO, `[AI POC] OpenAI message type: ${message.type}`);
    }
  }

  /**
   * Send audio to OpenAI
   */
  sendAudio(audioData: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      log(LogLevel.INFO, '[AI POC] about to append audio to OpenAI');
      const message = {
        type: 'input_audio_buffer.append',
        audio: audioData.toString('base64'),
      };
      log(LogLevel.INFO, '[AI POC] appended Twilio audio to OpenAI', {
        audioLength: audioData.length,
        base64Length: message.audio?.length,
      });
      log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(message, null, 2));
      this.ws.send(JSON.stringify(message));
    } else {
      const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      const state = this.ws ? states[this.ws.readyState] : 'NO_WEBSOCKET';
      log(LogLevel.INFO, '[AI POC] skipped audio append because websocket not open', {
        readyState: this.ws?.readyState,
        state,
      });
    }
  }

  /**
   * Close connection
   */
  disconnect() {
    this.clearTimeout();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connectionState = ConnectionState.CLOSED;
      log(LogLevel.INFO, 'OpenAI connection closed');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
