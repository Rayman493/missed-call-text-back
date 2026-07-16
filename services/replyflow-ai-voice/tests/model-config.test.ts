/**
 * Model Configuration Validation
 * 
 * Purpose: Verify centralized model configuration and fallback behavior
 * This is a standalone validation script that can be run with ts-node
 */

import {
  OPENAI_REALTIME_MODEL,
  OPENAI_REALTIME_FALLBACK_MODEL,
  OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTION_FALLBACK_MODEL,
  OPENAI_REALTIME_VOICE,
  OPENAI_REALTIME_FALLBACK_VOICE,
  hasRealtimeFallback,
  hasTranscriptionFallback,
  hasVoiceFallback,
  isFallbackError,
  FallbackState,
  createFallbackState,
} from '../src/model-config';

console.log('[MODEL CONFIG VALIDATION] ========================================');

// Test 1: Default Configuration
console.log('[TEST 1] Default Configuration');
let passed = 0;
let failed = 0;

if (OPENAI_REALTIME_MODEL === 'gpt-realtime') {
  console.log('✓ Realtime model default: gpt-realtime');
  passed++;
} else {
  console.log('✗ Realtime model default failed:', OPENAI_REALTIME_MODEL);
  failed++;
}

if (OPENAI_TRANSCRIPTION_MODEL === 'gpt-realtime-whisper') {
  console.log('✓ Transcription model default: gpt-realtime-whisper');
  passed++;
} else {
  console.log('✗ Transcription model default failed:', OPENAI_TRANSCRIPTION_MODEL);
  failed++;
}

if (OPENAI_REALTIME_VOICE === 'alloy') {
  console.log('✓ Voice default: alloy (matches previous production behavior)');
  passed++;
} else {
  console.log('✗ Voice default failed:', OPENAI_REALTIME_VOICE);
  failed++;
}

if (OPENAI_REALTIME_FALLBACK_MODEL === '' && OPENAI_TRANSCRIPTION_FALLBACK_MODEL === '' && OPENAI_REALTIME_FALLBACK_VOICE === '') {
  console.log('✓ No fallback configured by default');
  passed++;
} else {
  console.log('✗ Fallback configuration failed');
  failed++;
}

// Test 2: Fallback Error Detection
console.log('[TEST 2] Fallback Error Detection');

const modelNotFoundError = { error: { type: 'model_not_found' } };
if (isFallbackError(modelNotFoundError)) {
  console.log('✓ Detects model_not_found error');
  passed++;
} else {
  console.log('✗ Failed to detect model_not_found error');
  failed++;
}

const unsupportedModelError = { error: { type: 'unsupported_model' } };
if (isFallbackError(unsupportedModelError)) {
  console.log('✓ Detects unsupported_model error');
  passed++;
} else {
  console.log('✗ Failed to detect unsupported_model error');
  failed++;
}

const rateLimitError = { error: { type: 'rate_limit_exceeded' } };
if (!isFallbackError(rateLimitError)) {
  console.log('✓ Does NOT trigger on rate_limit_exceeded');
  passed++;
} else {
  console.log('✗ Incorrectly triggers on rate_limit_exceeded');
  failed++;
}

const vadTimeoutError = { error: { type: 'vad_timeout' } };
if (!isFallbackError(vadTimeoutError)) {
  console.log('✓ Does NOT trigger on vad_timeout');
  passed++;
} else {
  console.log('✗ Incorrectly triggers on vad_timeout');
  failed++;
}

if (!isFallbackError(null)) {
  console.log('✓ Handles null error');
  passed++;
} else {
  console.log('✗ Failed to handle null error');
  failed++;
}

// Test 3: Fallback State Management
console.log('[TEST 3] Fallback State Management');
const fallbackState1 = createFallbackState();

if (!fallbackState1.hasRealtimeFallbackBeenAttempted()) {
  console.log('✓ Initial state: no Realtime fallback attempted');
  passed++;
} else {
  console.log('✗ Initial state failed');
  failed++;
}

fallbackState1.markRealtimeFallbackAttempted();
if (fallbackState1.hasRealtimeFallbackBeenAttempted()) {
  console.log('✓ Tracks Realtime fallback attempt');
  passed++;
} else {
  console.log('✗ Failed to track Realtime fallback attempt');
  failed++;
}

if (!fallbackState1.canAttemptRealtimeFallback()) {
  console.log('✓ Prevents retry after fallback attempted');
  passed++;
} else {
  console.log('✗ Failed to prevent retry');
  failed++;
}

fallbackState1.reset();
if (!fallbackState1.hasRealtimeFallbackBeenAttempted()) {
  console.log('✓ Resets fallback state');
  passed++;
} else {
  console.log('✗ Failed to reset fallback state');
  failed++;
}

// Test 3b: State isolation between concurrent callers
console.log('[TEST 3b] State Isolation');
const fallbackState2 = createFallbackState();
const fallbackState3 = createFallbackState();

fallbackState2.markRealtimeFallbackAttempted();
if (fallbackState2.hasRealtimeFallbackBeenAttempted() && !fallbackState3.hasRealtimeFallbackBeenAttempted()) {
  console.log('✓ State isolated between instances');
  passed++;
} else {
  console.log('✗ State leakage between instances');
  failed++;
}

// Test 4: Production Safety
console.log('[TEST 4] Production Safety');

if (OPENAI_REALTIME_MODEL === 'gpt-realtime' && OPENAI_TRANSCRIPTION_MODEL === 'gpt-realtime-whisper' && OPENAI_REALTIME_VOICE === 'alloy') {
  console.log('✓ Production defaults preserved without env vars');
  passed++;
} else {
  console.log('✗ Production defaults changed');
  failed++;
}

// Summary
console.log('[MODEL CONFIG VALIDATION] ========================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('✓ All validation tests passed');
  process.exit(0);
} else {
  console.log('✗ Some validation tests failed');
  process.exit(1);
}
