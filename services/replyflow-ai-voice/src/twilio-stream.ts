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

// Approved assistant utterances per stage - strict allowlist
const APPROVED_UTTERANCES: Record<string, string> = {
  ask_name_reason: "Hi, I'm the assistant for the business. Can you please tell me your name and what you're calling about today?",
  ask_details: "Thanks. Can you share any important details the business should know?",
  ask_location_or_context: "Thanks. What location should the business know about?",
  ask_timing: "Got it. When would you like this completed or scheduled?",
  ask_callback_time: "Thanks. What is the best time for the business to call you back?",
  complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
};

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
  private callerAudioBlockedLogged: boolean = false;
  
  // Validation state for deterministic audio blocking
  private currentStage: string = '';
  private currentTranscript: string = '';
  private audioForwardingBlocked: boolean = false;
  private audioBuffer: Buffer[] = []; // Buffer assistant audio until validation passes
  private currentResponseId: string = ''; // Track response ID for authorization
  private responseAuthorized: boolean = false; // Track if response is authorized
  private expectedPromptText: string = ''; // Expected prompt text for pre-authorized responses
  private authorizedAtCreate: boolean = false; // Track if response was pre-authorized at creation
  private audioBufferedCount: number = 0; // Track total audio chunks buffered
  private audioFlushedCount: number = 0; // Track total audio chunks flushed
  private audioDroppedCount: number = 0; // Track total audio chunks dropped

  constructor(config: StreamConfig, openAiClient?: OpenAIRealtimeClient) {
    this.config = config;
    this.openAiClient = openAiClient || null;
    
    // Initialize Twilio client for hangup functionality
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      console.log('[TWILIO CLIENT INIT] =========================================');
      console.log('[TWILIO CLIENT INIT] Checking environment variables');
      console.log('[TWILIO CLIENT INIT] TWILIO_ACCOUNT_SID present:', !!accountSid);
      console.log('[TWILIO CLIENT INIT] TWILIO_ACCOUNT_SID length:', accountSid?.length || 0);
      console.log('[TWILIO CLIENT INIT] TWILIO_AUTH_TOKEN present:', !!authToken);
      console.log('[TWILIO CLIENT INIT] TWILIO_AUTH_TOKEN length:', authToken?.length || 0);
      console.log('[TWILIO CLIENT INIT] Timestamp:', new Date().toISOString());
      console.log('[TWILIO CLIENT INIT] =========================================');

      if (accountSid && authToken) {
        this.twilioClient = Twilio(accountSid, authToken);
        console.log('[TWILIO CLIENT] Initialized successfully for hangup functionality');
      } else {
        console.log('[TWILIO CLIENT] Missing credentials, hangup via REST API unavailable');
        console.log('[TWILIO CLIENT] Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN');
        console.log('[TWILIO CLIENT] Check Fly secrets: fly secrets list -a replyflow-ai-voice');
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
   * Send a mark to Twilio to track when audio playback completes
   */
  sendMark(markName: string) {
    if (this.ws && this.streamSid) {
      const message = {
        event: 'mark',
        streamSid: this.streamSid,
        mark: {
          name: markName
        }
      };
      try {
        this.ws.send(JSON.stringify(message));
        console.log('[TWILIO MARK SENT]', { markName });
      } catch (error) {
        console.log('[TWILIO MARK SEND ERROR]', error);
      }
    }
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
              // CRITICAL FIX: Read promptPlayback.status from shared callSessionState for authoritative gating
              const callSessionState = (this as any).callSessionState || {};
              const promptPlayback = callSessionState.promptPlayback || null;
              const promptPlaybackStatus = promptPlayback?.status || 'idle';
              const isPromptPlaying = promptPlaybackStatus === 'starting' || promptPlaybackStatus === 'streaming' || promptPlaybackStatus === 'waiting_for_mark';

              // Instrument read for media gating
              console.log('[PROMPT PLAYBACK READ] =========================================');
              console.log('[PROMPT PLAYBACK READ] value:', promptPlaybackStatus);
              console.log('[PROMPT PLAYBACK READ] isPromptPlaying:', isPromptPlaying);
              console.log('[PROMPT PLAYBACK READ] function: handleMessage (media event handler)');
              console.log('[PROMPT PLAYBACK READ] line: 194');
              console.log('[PROMPT PLAYBACK READ] responseId:', callSessionState.activeResponseId || 'unknown');
              console.log('[PROMPT PLAYBACK READ] stage:', callSessionState.currentStage || 'unknown');
              console.log('[PROMPT PLAYBACK READ] timestamp:', new Date().toISOString());
              console.log('[PROMPT PLAYBACK READ] =========================================');
              const terminalClosingResponseStarted = (this as any).terminalClosingResponseStarted || false;
              const confirmationState = (this as any).confirmationState || 'collecting_info';

              // V1 TURN-BASED FLOW: Block caller audio while prompt is playing
              // This ensures reliable turn-taking: AI asks -> AI finishes -> caller answers
              // Using promptPlayback.status as authoritative source of truth

              // VERSION PROOF: Log that we're using promptPlayback state
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] =========================================');
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] callSessionState present:', !!callSessionState);
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] promptPlayback present:', !!promptPlayback);
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] promptPlaybackStatus:', promptPlaybackStatus);
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] isPromptPlaying:', isPromptPlaying);
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] Timestamp:', new Date().toISOString());
              console.log('[VERSION PROOF - TWILIO MEDIA HANDLER USING PROMPT PLAYBACK STATE] =========================================');

              // LOG: Every caller audio packet for debugging
              console.log('[CALLER AUDIO PACKET RECEIVED] =========================================');
              console.log('[CALLER AUDIO PACKET RECEIVED] promptPlaybackStatus:', promptPlaybackStatus);
              console.log('[CALLER AUDIO PACKET RECEIVED] isPromptPlaying:', isPromptPlaying);
              console.log('[CALLER AUDIO PACKET RECEIVED] callState:', callState);
              console.log('[CALLER AUDIO PACKET RECEIVED] Timestamp:', new Date().toISOString());
              console.log('[CALLER AUDIO PACKET RECEIVED] =========================================');
              
              // Hard guard: Do not append caller audio when call is not active
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
                  // Log only once when blocking starts
                  if (!this.callerAudioBlockedLogged) {
                    console.log('[INBOUND CALLER AUDIO BLOCKED - CALL STATE]', { callState });
                    this.callerAudioBlockedLogged = true;
                  }
                  console.log('[CALLER AUDIO BLOCKED - CALL STATE NOT ACTIVE] =========================================');
                  console.log('[CALLER AUDIO BLOCKED - CALL STATE NOT ACTIVE] Reason: callState is not active');
                  console.log('[CALLER AUDIO BLOCKED - CALL STATE NOT ACTIVE] callState:', callState);
                  console.log('[CALLER AUDIO BLOCKED - CALL STATE NOT ACTIVE] Timestamp:', new Date().toISOString());
                  console.log('[CALLER AUDIO BLOCKED - CALL STATE NOT ACTIVE] =========================================');
                  return;
                }
              }

              // Reset the flag when call state becomes active again
              if (callState === 'active') {
                this.callerAudioBlockedLogged = false;
              }

              // V1 STRICT BLOCKING: Block caller audio when prompt is playing
              // This prevents barge-in and ensures turn-based flow
              // Using promptPlayback.status as authoritative source of truth
              if (isPromptPlaying) {
                const activeResponseId = callSessionState.activeResponseId || 'unknown';
                const lastPromptAt = callSessionState.lastPromptAt || 0;
                const timeSinceLastPrompt = Date.now() - lastPromptAt;

                // V1 RELIABILITY: Safety timeout for stuck prompt playback
                // If prompt is stuck for more than 30 seconds, allow caller audio
                if (timeSinceLastPrompt > 30000) {
                  const beforeStatus = promptPlaybackStatus;
                  const stackTrace = new Error().stack?.split('\n').slice(1, 4).join('\n') || 'unknown';

                  console.log('[PROMPT PLAYBACK TIMEOUT] =========================================');
                  console.log('[PROMPT PLAYBACK TIMEOUT] Prompt playback stuck for >30s, forcing done');
                  console.log('[PROMPT PLAYBACK TIMEOUT] BEFORE promptPlayback.status:', beforeStatus);
                  console.log('[PROMPT PLAYBACK TIMEOUT] promptPlaybackStatus is stuck');
                  console.log('[PROMPT PLAYBACK TIMEOUT] activeResponseId:', activeResponseId);
                  console.log('[PROMPT PLAYBACK TIMEOUT] timeSinceLastPrompt:', timeSinceLastPrompt);
                  console.log('[PROMPT PLAYBACK TIMEOUT] Forcing promptPlayback.status to done');
                  console.log('[PROMPT PLAYBACK TIMEOUT] Stack trace:', stackTrace);
                  console.log('[PROMPT PLAYBACK TIMEOUT] Timestamp:', new Date().toISOString());
                  console.log('[PROMPT PLAYBACK TIMEOUT] =========================================');

                  // Force done status and unblock caller audio
                  if (callSessionState.promptPlayback) {
                    callSessionState.promptPlayback.status = 'done';
                    callSessionState.assistantSpeaking = false;
                  }

                  console.log('[PROMPT PLAYBACK] =========================================');
                  console.log('[PROMPT PLAYBACK] event: timeout');
                  console.log('[PROMPT PLAYBACK] id:', callSessionState.promptPlayback?.id || 'unknown');
                  console.log('[PROMPT PLAYBACK] stage:', callSessionState.promptPlayback?.stage || 'unknown');
                  console.log('[PROMPT PLAYBACK] status: done');
                  console.log('[PROMPT PLAYBACK] responseId:', activeResponseId);
                  console.log('[PROMPT PLAYBACK] elapsedMs:', Date.now() - (callSessionState.promptPlayback?.startedAt || 0));
                  console.log('[PROMPT PLAYBACK] =========================================');
                } else {
                  // Valid blocking state - prompt is actually playing
                  // Log that caller audio was blocked
                  console.log('[PROMPT PLAYBACK] =========================================');
                  console.log('[PROMPT PLAYBACK] event: caller_audio_blocked');
                  console.log('[PROMPT PLAYBACK] id:', callSessionState.promptPlayback?.id || 'unknown');
                  console.log('[PROMPT PLAYBACK] stage:', callSessionState.promptPlayback?.stage || 'unknown');
                  console.log('[PROMPT PLAYBACK] status:', promptPlaybackStatus);
                  console.log('[PROMPT PLAYBACK] responseId:', activeResponseId);
                  console.log('[PROMPT PLAYBACK] elapsedMs:', Date.now() - (callSessionState.promptPlayback?.startedAt || 0));
                  console.log('[PROMPT PLAYBACK] =========================================');

                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] =========================================');
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] V1 TURN-BASED FLOW ACTIVE');
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] Caller audio blocked while prompt is playing');
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] promptPlaybackStatus:', promptPlaybackStatus);
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] activeResponseId:', activeResponseId);
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] Timestamp:', new Date().toISOString());
                  console.log('[INBOUND CALLER AUDIO BLOCKED - PROMPT PLAYING] =========================================');

                  return;
                }
              } else {
                // Prompt is not playing - accept caller audio
                console.log('[PROMPT PLAYBACK] =========================================');
                console.log('[PROMPT PLAYBACK] event: caller_audio_accepted');
                console.log('[PROMPT PLAYBACK] id:', callSessionState.promptPlayback?.id || 'none');
                console.log('[PROMPT PLAYBACK] stage:', callSessionState.promptPlayback?.stage || 'none');
                console.log('[PROMPT PLAYBACK] status:', promptPlaybackStatus);
                console.log('[PROMPT PLAYBACK] responseId:', callSessionState.activeResponseId || 'none');
                console.log('[PROMPT PLAYBACK] =========================================');
              }

              // LOG: Caller audio accepted
              console.log('[CALLER AUDIO ACCEPTED] =========================================');
              console.log('[CALLER AUDIO ACCEPTED] promptPlaybackStatus:', promptPlaybackStatus);
              console.log('[CALLER AUDIO ACCEPTED] isPromptPlaying:', isPromptPlaying);
              console.log('[CALLER AUDIO ACCEPTED] Timestamp:', new Date().toISOString());
              console.log('[CALLER AUDIO ACCEPTED] =========================================');

              if (openAiWs) {
                if (process.env.DEBUG_AI_VOICE === 'true') {
                  console.log('[OPENAI INPUT AUDIO APPEND START]', { callState, promptPlaybackStatus });
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
   * Send audio to Twilio (internal method - bypasses buffering)
   */
  sendAudioInternal(audioData: Buffer) {
    // ORDER TRACE: sendAudioInternal called
    const currentStage = (this as any)._currentStage || 'unknown';

    // Greeting timeline: first_media_sent and last_media_sent
    const callSessionState = (this as any).callSessionState || {};
    const responseId = this.currentResponseId || 'unknown';
    const isGreetingResponse = responseId === (this as any).greetingCurrentResponseId;

    if (currentStage === 'ask_name_reason' && !(this as any).firstPromptSendAudioInternalLogged) {
      (this as any).firstPromptSendAudioInternalLogged = true;
      console.log('[OPENING ORDER TRACE] =========================================');
      console.log('[OPENING ORDER TRACE] event: sendAudioInternal');
      console.log('[OPENING ORDER TRACE] responseId:', this.currentResponseId || 'pending');
      console.log('[OPENING ORDER TRACE] stage:', currentStage);
      console.log('[OPENING ORDER TRACE] assistantSpeaking:', (this as any).assistantSpeaking || false);
      console.log('[OPENING ORDER TRACE] authorizedResponseCreateSource:', (this as any).authorizedResponseCreateSource || 'none');
      console.log('[OPENING ORDER TRACE] responseAuthorized:', this.responseAuthorized || false);
      console.log('[OPENING ORDER TRACE] timestamp:', new Date().toISOString());
      console.log('[OPENING ORDER TRACE] =========================================');
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      const callState = (this as any).callState || 'active';
      const finalClosingStarted = (this as any).finalClosingStarted || false;
      const assistantSpeaking = (this as any).assistantSpeaking || false;
      
      // Track chunk count sent
      const responseId = this.currentResponseId || 'unknown';
      const chunkKey = `chunks_${responseId}`;
      if (!(this as any)[chunkKey]) {
        (this as any)[chunkKey] = { received: 0, sent: 0, responseId, firstReceivedAt: null, firstSentAt: null };
      }
      (this as any)[chunkKey].sent++;
      const isFirstChunkSent = (this as any)[chunkKey].sent === 1;
      if (isFirstChunkSent) {
        (this as any)[chunkKey].firstSentAt = Date.now();
      }
      
      // Log streamSid and ws readyState for debugging
      console.log('[SEND AUDIO INTERNAL DEBUG] =========================================');
      console.log('[SEND AUDIO INTERNAL DEBUG] streamSid:', this.streamSid);
      console.log('[SEND AUDIO INTERNAL DEBUG] ws readyState:', this.ws.readyState);
      console.log('[SEND AUDIO INTERNAL DEBUG] ws readyState value:', this.ws.readyState === WebSocket.OPEN ? 'OPEN' : 'NOT OPEN');
      console.log('[SEND AUDIO INTERNAL DEBUG] responseId:', responseId);
      console.log('[SEND AUDIO INTERNAL DEBUG] chunkSent:', (this as any)[chunkKey].sent);
      console.log('[SEND AUDIO INTERNAL DEBUG] chunkReceived:', (this as any)[chunkKey].received);
      console.log('[SEND AUDIO INTERNAL DEBUG] isFirstChunkSent:', isFirstChunkSent);
      console.log('[SEND AUDIO INTERNAL DEBUG] Reading assistantSpeaking from callSessionState:', (this as any).callSessionState?.assistantSpeaking);
      console.log('[SEND AUDIO INTERNAL DEBUG] Reading assistantSpeaking from local variable:', assistantSpeaking);
      console.log('[SEND AUDIO INTERNAL DEBUG] callSessionState exists:', !!(this as any).callSessionState);
      console.log('[SEND AUDIO INTERNAL DEBUG] Timestamp:', new Date().toISOString());
      console.log('[SEND AUDIO INTERNAL DEBUG] =========================================');
      
      // Log when final goodbye audio is sent to Twilio
      if (finalClosingStarted) {
        console.log('[FINAL GOODBYE AUDIO SENT] Final goodbye audio sent to Twilio');
        console.log('[FINAL GOODBYE AUDIO SENT] Timestamp:', new Date().toISOString());
        console.log('[FINAL GOODBYE AUDIO SENT] callState:', callState);
        console.log('[FINAL GOODBYE AUDIO SENT] audioLength:', audioData.length);
      }

      // Comprehensive AUDIO TO TWILIO log before every media send
      const authorized = !!this.responseAuthorized;
      const source = (this as any)._lastAudioSource || 'sendAudioInternal';
      const route = (this as any).responseAuthorized ? 'buffered' : 'direct';
      console.log('[AUDIO TO TWILIO]');
      console.log('[AUDIO TO TWILIO] responseId:', responseId);
      console.log('[AUDIO TO TWILIO] authorized:', authorized);
      console.log('[AUDIO TO TWILIO] source:', source);
      console.log('[AUDIO TO TWILIO] route:', route);

      // Log first prompt media sent to Twilio for debugging
      if (currentStage === 'ask_name_reason') {
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] =========================================');
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] Stage:', currentStage);
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] streamSid:', this.streamSid);
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] ws readyState:', this.ws.readyState);
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] audioLength:', audioData.length);
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] Timestamp:', new Date().toISOString());
        console.log('[FIRST PROMPT MEDIA SENT TO TWILIO] =========================================');
      }

      // Increment flush counter for direct sends (buffered flushes are counted in authorizeResponse)
      this.audioFlushedCount++;

      // Greeting timeline: first_media_sent
      if (isGreetingResponse && currentStage === 'ask_name_reason') {
        // Check if this is the first media sent
        if (!(this as any).greetingFirstMediaSentLogged) {
          (this as any).greetingFirstMediaSentLogged = true;
          const now = Date.now();
          const elapsed = (this as any).greetingTimelineStartTime ? now - (this as any).greetingTimelineStartTime : 0;
          const activeResponseId = callSessionState.activeResponseId || 'unknown';
          const assistantSpeaking = callSessionState.assistantSpeaking;
          const callState = callSessionState.callState || 'unknown';

          console.log('[GREETING TIMELINE] =========================================');
          console.log('[GREETING TIMELINE] event: first_media_sent');
          console.log('[GREETING TIMELINE] elapsed_ms:', elapsed);
          console.log('[GREETING TIMELINE] timestamp_ms:', now);
          console.log('[GREETING TIMELINE] timestamp_iso:', new Date().toISOString());
          console.log('[GREETING TIMELINE] responseId:', responseId);
          console.log('[GREETING TIMELINE] activeResponseId:', activeResponseId);
          console.log('[GREETING TIMELINE] assistantSpeaking:', assistantSpeaking);
          console.log('[GREETING TIMELINE] currentStage:', currentStage);
          console.log('[GREETING TIMELINE] callState:', callState);
          console.log('[GREETING TIMELINE] =========================================');
        }

        // Track media sent count - this will be the last when response.audio.done fires
        (this as any).greetingMediaSentCount = ((this as any).greetingMediaSentCount || 0) + 1;
      }

      const message = {
        event: 'media',
        streamSid: this.streamSid,
        media: {
          payload: audioData.toString('base64'),
        },
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.log('[SEND AUDIO INTERNAL FAILED] =========================================');
      console.log('[SEND AUDIO INTERNAL FAILED] WebSocket not open');
      console.log('[SEND AUDIO INTERNAL FAILED] ws readyState:', this.ws?.readyState);
      console.log('[SEND AUDIO INTERNAL FAILED] streamSid:', this.streamSid);
      console.log('[SEND AUDIO INTERNAL FAILED] Timestamp:', new Date().toISOString());
      console.log('[SEND AUDIO INTERNAL FAILED] =========================================');
    }
  }

  /**
   * Send audio to Twilio with buffering and validation
   */
  sendAudio(audioData: Buffer) {
    // ORDER TRACE: sendAudio called
    const currentStage = (this as any)._currentStage || 'unknown';
    if (currentStage === 'ask_name_reason' && !(this as any).firstPromptSendAudioLogged) {
      (this as any).firstPromptSendAudioLogged = true;
      console.log('[OPENING ORDER TRACE] =========================================');
      console.log('[OPENING ORDER TRACE] event: sendAudio');
      console.log('[OPENING ORDER TRACE] responseId:', this.currentResponseId || 'pending');
      console.log('[OPENING ORDER TRACE] stage:', currentStage);
      console.log('[OPENING ORDER TRACE] assistantSpeaking:', (this as any).assistantSpeaking || false);
      console.log('[OPENING ORDER TRACE] authorizedResponseCreateSource:', (this as any).authorizedResponseCreateSource || 'none');
      console.log('[OPENING ORDER TRACE] responseAuthorized:', this.responseAuthorized || false);
      console.log('[OPENING ORDER TRACE] timestamp:', new Date().toISOString());
      console.log('[OPENING ORDER TRACE] =========================================');
    }

    // Buffer audio if response is not yet authorized
    // Buffer ALL chunks when not authorized, regardless of currentResponseId state
    // This preserves early chunks that arrive before response.created
    if (!this.responseAuthorized) {
      this.audioBufferedCount++;
      const isFirstChunk = this.audioBufferedCount === 1;
      
      console.log('[AUDIO BUFFERED] =========================================');
      console.log('[AUDIO BUFFERED] responseId:', this.currentResponseId || 'pending');
      console.log('[AUDIO BUFFERED] expectedPromptText:', this.expectedPromptText);
      console.log('[AUDIO BUFFERED] authorizedAtCreate:', this.authorizedAtCreate);
      console.log('[AUDIO BUFFERED] audioBuffered:', this.audioBufferedCount);
      console.log('[AUDIO BUFFERED] isFirstChunk:', isFirstChunk);
      console.log('[AUDIO BUFFERED] audioLength:', audioData.length);
      console.log('[AUDIO BUFFERED] Timestamp:', new Date().toISOString());
      console.log('[AUDIO BUFFERED] =========================================');

      // Log first prompt audio buffering for debugging
      if (currentStage === 'ask_name_reason') {
        console.log('[FIRST PROMPT AUDIO BUFFERED] =========================================');
        console.log('[FIRST PROMPT AUDIO BUFFERED] Stage:', currentStage);
        console.log('[FIRST PROMPT AUDIO BUFFERED] responseId:', this.currentResponseId || 'pending');
        console.log('[FIRST PROMPT AUDIO BUFFERED] audioBufferedCount:', this.audioBufferedCount);
        console.log('[FIRST PROMPT AUDIO BUFFERED] isFirstChunk:', isFirstChunk);
        console.log('[FIRST PROMPT AUDIO BUFFERED] Timestamp:', new Date().toISOString());
        console.log('[FIRST PROMPT AUDIO BUFFERED] =========================================');
      }
      
      this.audioBuffer.push(audioData);
      return;
    }
    
    // Validate transcript before forwarding audio
    if (!this.validateTranscript()) {
      this.audioDroppedCount++;
      console.log('[AUDIO DROPPED] =========================================');
      console.log('[AUDIO DROPPED] responseId:', this.currentResponseId);
      console.log('[AUDIO DROPPED] expectedPromptText:', this.expectedPromptText);
      console.log('[AUDIO DROPPED] authorizedAtCreate:', this.authorizedAtCreate);
      console.log('[AUDIO DROPPED] audioDropped:', this.audioDroppedCount);
      console.log('[AUDIO DROPPED] reason:', 'transcript validation failed');
      console.log('[AUDIO DROPPED] currentStage:', this.currentStage);
      console.log('[AUDIO DROPPED] currentTranscript:', this.currentTranscript);
      console.log('[AUDIO DROPPED] audioLength:', audioData.length);
      console.log('[AUDIO DROPPED] Timestamp:', new Date().toISOString());
      console.log('[AUDIO DROPPED] =========================================');
      
      this.audioForwardingBlocked = true;
      return;
    }

    // Send audio if authorized and validated
    this.sendAudioInternal(audioData);
  }

  /**
   * Set current response ID for authorization tracking
   */
  setCurrentResponseId(responseId: string) {
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] setCurrentResponseId called');
    console.log('[TWILIO VALIDATION] Response ID:', responseId);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
    this.currentResponseId = responseId;
    this.responseAuthorized = false;
    this.audioBuffer = []; // Clear buffer for new response
    this.expectedPromptText = ''; // Reset expected prompt text
    this.authorizedAtCreate = false; // Reset pre-authorization flag
  }

  /**
   * Authorize current response and flush buffered audio
   */
  authorizeResponse() {
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] authorizeResponse called');
    console.log('[TWILIO VALIDATION] Response ID:', this.currentResponseId);
    console.log('[TWILIO VALIDATION] Buffer length BEFORE flush:', this.audioBuffer.length);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
    
    this.responseAuthorized = true;
    this.authorizedAtCreate = true; // Mark as pre-authorized at creation time
    
    // Flush buffered audio
    if (this.audioBuffer.length > 0) {
      const currentStage = (this as any)._currentStage || 'unknown';
      const bufferLength = this.audioBuffer.length;
      console.log('[AUDIO FLUSHED] =========================================');
      console.log('[AUDIO FLUSHED] responseId:', this.currentResponseId);
      console.log('[AUDIO FLUSHED] expectedPromptText:', this.expectedPromptText);
      console.log('[AUDIO FLUSHED] authorizedAtCreate:', this.authorizedAtCreate);
      console.log('[AUDIO FLUSHED] audioFlushed:', bufferLength);
      console.log('[AUDIO FLUSHED] audioBuffered:', this.audioBufferedCount);
      console.log('[AUDIO FLUSHED] Timestamp:', new Date().toISOString());
      console.log('[AUDIO FLUSHED] =========================================');

      // Log first prompt audio flushing for debugging
      if (currentStage === 'ask_name_reason') {
        console.log('[FIRST PROMPT AUDIO FLUSHED] =========================================');
        console.log('[FIRST PROMPT AUDIO FLUSHED] Stage:', currentStage);
        console.log('[FIRST PROMPT AUDIO FLUSHED] responseId:', this.currentResponseId);
        console.log('[FIRST PROMPT AUDIO FLUSHED] audioBufferLength:', bufferLength);
        console.log('[FIRST PROMPT AUDIO FLUSHED] Timestamp:', new Date().toISOString());
        console.log('[FIRST PROMPT AUDIO FLUSHED] =========================================');
      }
      
      for (const audioData of this.audioBuffer) {
        this.audioFlushedCount++;
        this.sendAudioInternal(audioData);
      }
      this.audioBuffer = [];
      
      console.log('[TWILIO VALIDATION] =========================================');
      console.log('[TWILIO VALIDATION] Buffer length AFTER flush:', this.audioBuffer.length);
      console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
      console.log('[TWILIO VALIDATION] =========================================');
    }
  }

  /**
   * Cancel current response and drop buffered audio
   */
  cancelResponse() {
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] cancelResponse called');
    console.log('[TWILIO VALIDATION] Response ID:', this.currentResponseId);
    console.log('[TWILIO VALIDATION] Buffer length:', this.audioBuffer.length);
    console.log('[TWILIO VALIDATION] Audio dropped:', this.audioBuffer.length);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
    
    this.responseAuthorized = false;
    this.audioBuffer = []; // Drop buffered audio
    this.currentResponseId = '';
  }

  /**
   * Set the current conversation stage for validation
   */
  setCurrentStage(stage: string) {
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] setCurrentStage called');
    console.log('[TWILIO VALIDATION] Stage:', stage);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
    this.currentStage = stage;
  }

  /**
   * Update the current transcript for validation
   */
  updateTranscript(delta: string) {
    this.currentTranscript += delta;
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] Transcript updated');
    console.log('[TWILIO VALIDATION] Current transcript:', this.currentTranscript);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
  }

  /**
   * Reset validation state for new response
   */
  resetValidationState() {
    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] Resetting validation state');
    console.log('[TWILIO VALIDATION] Previous transcript:', this.currentTranscript);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');
    this.currentTranscript = '';
    this.audioForwardingBlocked = false;
  }

  /**
   * Validate transcript against approved utterance for current stage
   */
  private validateTranscript(): boolean {
    if (!this.currentStage) {
      console.log('[TWILIO VALIDATION] No current stage set, allowing audio');
      return true;
    }

    const approvedUtterance = APPROVED_UTTERANCES[this.currentStage];
    if (!approvedUtterance) {
      console.log('[TWILIO VALIDATION] No approved utterance for stage:', this.currentStage);
      return true;
    }

    const normalizedTranscript = this.currentTranscript.trim().toLowerCase();
    const normalizedApproved = approvedUtterance.trim().toLowerCase();

    const isValid = normalizedTranscript === normalizedApproved;

    console.log('[TWILIO VALIDATION] =========================================');
    console.log('[TWILIO VALIDATION] Transcript validation');
    console.log('[TWILIO VALIDATION] Current stage:', this.currentStage);
    console.log('[TWILIO VALIDATION] Approved utterance:', approvedUtterance);
    console.log('[TWILIO VALIDATION] Current transcript:', this.currentTranscript);
    console.log('[TWILIO VALIDATION] Is valid:', isValid);
    console.log('[TWILIO VALIDATION] Timestamp:', new Date().toISOString());
    console.log('[TWILIO VALIDATION] =========================================');

    return isValid;
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
