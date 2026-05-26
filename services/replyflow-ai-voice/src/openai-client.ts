/**
 * Minimal OpenAI Realtime Client (Phase 1A POC)
 * 
 * Purpose: Prove connection to OpenAI Realtime API
 * No conversation handling, no extraction, just connection + greeting
 */

import WebSocket from 'ws';
import { log, LogLevel } from './logger';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  voice?: string;
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

      this.ws = new WebSocket('wss://api.openai.com/v1/realtime', {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        log(LogLevel.INFO, 'OpenAI WebSocket connected');
        
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
        log(LogLevel.ERROR, 'OpenAI WebSocket error', error);
        this.connectionState = ConnectionState.ERROR;
        this.clearTimeout();
        reject(error);
      });

      this.ws.on('close', () => {
        log(LogLevel.INFO, 'OpenAI WebSocket closed');
        this.connectionState = ConnectionState.CLOSED;
        this.clearTimeout();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      // 10 second timeout with cleanup
      this.timeoutId = setTimeout(() => {
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

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a test AI assistant. Say: "Hello. This is the ReplyFlow AI Assistant test environment." Then end the call.',
        voice: this.config.voice,
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
      },
    };

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
      this.ws.send(JSON.stringify(message));
      
      // Request response generation
      const createResponse = {
        type: 'response.create',
      };
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
        log(LogLevel.INFO, 'OpenAI session updated');
        break;
      case 'response.audio.delta':
        log(LogLevel.INFO, 'Audio delta received from OpenAI');
        break;
      case 'response.done':
        log(LogLevel.INFO, 'OpenAI response completed');
        break;
      case 'error':
        log(LogLevel.ERROR, 'OpenAI error', message.error);
        break;
      default:
        // Log other message types for debugging
        log(LogLevel.INFO, `OpenAI message type: ${message.type}`);
    }
  }

  /**
   * Send audio to OpenAI
   */
  sendAudio(audioData: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'input_audio_buffer.append',
        audio: audioData.toString('base64'),
      };
      this.ws.send(JSON.stringify(message));
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
