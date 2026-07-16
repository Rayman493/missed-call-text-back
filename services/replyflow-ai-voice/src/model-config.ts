/**
 * Centralized Model and Voice Configuration
 * 
 * Purpose: Single source of truth for AI voice model selection with safe fallback support
 * 
 * IMPORTANT: Do not change these defaults without verifying compatibility with:
 * - Current OpenAI Realtime API schema
 * - Cached prompt audio generation
 * - ReplyFlow Simple Mode architecture
 * 
 * Production defaults:
 * - Realtime model: gpt-realtime
 * - Transcription model: gpt-realtime-whisper
 * - Voice: marin (matches cached audio)
 */

// Realtime model configuration
export const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
export const OPENAI_REALTIME_FALLBACK_MODEL = process.env.OPENAI_REALTIME_FALLBACK_MODEL || '';

// Transcription model configuration
export const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-realtime-whisper';
export const OPENAI_TRANSCRIPTION_FALLBACK_MODEL = process.env.OPENAI_TRANSCRIPTION_FALLBACK_MODEL || '';

// Voice configuration
// NOTE: Default is 'alloy' to match previous production behavior
// Cached audio uses 'marin' but that only affects scripted prompt playback
// Dynamic AI responses (if any) would use this default
export const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'alloy';
export const OPENAI_REALTIME_FALLBACK_VOICE = process.env.OPENAI_REALTIME_FALLBACK_VOICE || '';

// Configuration validation
export function hasRealtimeFallback(): boolean {
  return !!OPENAI_REALTIME_FALLBACK_MODEL;
}

export function hasTranscriptionFallback(): boolean {
  return !!OPENAI_TRANSCRIPTION_FALLBACK_MODEL;
}

export function hasVoiceFallback(): boolean {
  return !!OPENAI_REALTIME_FALLBACK_VOICE;
}

// Log configuration at startup (without exposing secrets)
export function logModelConfiguration(): void {
  console.log('[MODEL CONFIGURATION] ========================================');
  console.log('[MODEL CONFIGURATION] Primary Realtime Model:', OPENAI_REALTIME_MODEL);
  console.log('[MODEL CONFIGURATION] Realtime Fallback Configured:', hasRealtimeFallback());
  console.log('[MODEL CONFIGURATION] Primary Transcription Model:', OPENAI_TRANSCRIPTION_MODEL);
  console.log('[MODEL CONFIGURATION] Transcription Fallback Configured:', hasTranscriptionFallback());
  console.log('[MODEL CONFIGURATION] Primary Voice:', OPENAI_REALTIME_VOICE);
  console.log('[MODEL CONFIGURATION] Voice Fallback Configured:', hasVoiceFallback());
  console.log('[MODEL CONFIGURATION] ========================================');
}

// Qualifying error types for model fallback
export const FALLBACK_ERROR_TYPES = [
  'model_not_found',
  'unsupported_model',
  'model_unavailable',
  'invalid_model',
] as const;

export type FallbackErrorType = typeof FALLBACK_ERROR_TYPES[number];

export function isFallbackError(error: any): boolean {
  if (!error) return false;
  
  const errorType = error.error?.type || error.type || error.code;
  const errorMessage = error.error?.message || error.message || '';
  
  // Check for explicit error types
  if (FALLBACK_ERROR_TYPES.includes(errorType)) {
    return true;
  }
  
  // Check for error messages indicating model issues
  const modelErrorPatterns = [
    'model not found',
    'unsupported model',
    'model is not available',
    'invalid model',
    'model has been deprecated',
  ];
  
  const lowerMessage = errorMessage.toLowerCase();
  return modelErrorPatterns.some(pattern => lowerMessage.includes(pattern));
}

// Fallback state tracking to prevent retry loops
// CRITICAL: Each call/session must have its own FallbackState instance
// to prevent state leakage between concurrent callers
export class FallbackState {
  private realtimeFallbackAttempted = false;
  private transcriptionFallbackAttempted = false;
  
  markRealtimeFallbackAttempted(): void {
    this.realtimeFallbackAttempted = true;
    console.log('[FALLBACK STATE] Realtime fallback attempted');
  }
  
  markTranscriptionFallbackAttempted(): void {
    this.transcriptionFallbackAttempted = true;
    console.log('[FALLBACK STATE] Transcription fallback attempted');
  }
  
  hasRealtimeFallbackBeenAttempted(): boolean {
    return this.realtimeFallbackAttempted;
  }
  
  hasTranscriptionFallbackBeenAttempted(): boolean {
    return this.transcriptionFallbackAttempted;
  }
  
  reset(): void {
    this.realtimeFallbackAttempted = false;
    this.transcriptionFallbackAttempted = false;
    console.log('[FALLBACK STATE] Reset');
  }
  
  canAttemptRealtimeFallback(): boolean {
    return hasRealtimeFallback() && !this.realtimeFallbackAttempted;
  }
  
  canAttemptTranscriptionFallback(): boolean {
    return hasTranscriptionFallback() && !this.transcriptionFallbackAttempted;
  }
}

// Factory function to create per-call fallback state instances
// This ensures state isolation between concurrent callers
export function createFallbackState(): FallbackState {
  return new FallbackState();
}
