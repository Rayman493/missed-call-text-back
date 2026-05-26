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

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  voice?: string;
  onAudioDelta?: (delta: string) => void;
  onOpen?: () => void;
  onSessionUpdated?: () => void;
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

      // Use gpt-realtime model in URL query string for GA API
      const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
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
        
        log(LogLevel.INFO, '[OPENAI] websocket object created');
        log(LogLevel.INFO, '[OPENAI] full websocket URL', { url: wsUrl });
        log(LogLevel.INFO, '[OPENAI] exact model being used', { model: 'gpt-realtime' });

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

          // Call onOpen callback to notify listeners
          if (this.config.onOpen) {
            this.config.onOpen();
          }

          // Clear timeout on successful connection
          if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }

          this.connectionState = ConnectionState.CONNECTED;

          // Send session configuration
          this.sendSessionUpdate();
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
    log(LogLevel.INFO, '[AI POC] exact model being used', { model: 'gpt-realtime' });

    // Configure session with full configuration for Twilio compatibility
    const sessionUpdate = {
      type: 'session.update',
      session: {
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        voice: this.config.voice || 'alloy',
        instructions: 'You are a helpful AI assistant. Respond naturally and concisely.',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    console.log('[OPENAI SESSION] session.update sent');
    log(LogLevel.INFO, '[AI POC] OPENAI SESSION UPDATE', JSON.stringify(sessionUpdate, null, 2));
    log(LogLevel.INFO, '[AI POC] COMPLETE session.update payload', JSON.stringify(sessionUpdate, null, 2));
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
            text: 'Hello. This is the ReplyFlow AI Assistant test environment.',
          },
        ],
      },
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(message, null, 2));
      this.ws.send(JSON.stringify(message));

      // Request response generation
      const createResponse = {
        type: 'response.create',
      };
      log(LogLevel.INFO, '[AI POC] OUTBOUND OPENAI MESSAGE', JSON.stringify(createResponse, null, 2));
      this.ws.send(JSON.stringify(createResponse));

      log(LogLevel.INFO, 'Greeting sent to OpenAI');
    }
  }

  /**
   * Handle incoming messages from OpenAI
   */
  private handleMessage(message: any) {
    switch (message.type) {
      case 'session.updated':
        console.log('[OPENAI SESSION] session.updated received');
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
      case 'response.output_audio.delta':
        console.log('[AUDIO OUT] delta received', { length: message.delta?.length, type: typeof message.delta });
        // Forward audio to Twilio via callback
        if (this.config.onAudioDelta && message.delta) {
          console.log('[AUDIO OUT] about to send audio to Twilio');
          this.config.onAudioDelta(message.delta);
          console.log('[AUDIO OUT] sent audio to Twilio');
        }
        break;
      case 'response.output_audio_transcript.delta':
        log(LogLevel.INFO, '[AI POC] received OpenAI transcript delta (GA schema)');
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
