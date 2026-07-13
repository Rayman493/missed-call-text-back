import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ========================================
// CACHED AUDIO VALIDATION SCRIPT
// ========================================
// This script validates the cached audio assets against canonical prompts
// and reports any mismatches, missing assets, or stale data.

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stalePrompts: string[];
  missingAssets: string[];
  hashMismatches: string[];
}

// Canonical prompts from generation script (must match exactly)
const CANONICAL_PROMPTS = {
  ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
  ask_details: "Okay. Can you share any important details the business should know?",
  ask_location: "All right. Just a couple more questions. Where will this take place?",
  ask_completion_time: "When are you hoping this will be done?",
  ask_callback_time: "Okay. Last question—what's the best time for the business to call you back?",
  complete: "Okay. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a good day."
};

// Stale words that should NOT appear in production prompts
const STALE_WORDS = [
  'Great',
  'Perfect',
  'Thanks',
  'Excellent',
  'Sounds good',
  'Got it',
  'Awesome',
  'Fantastic'
];

function calculateChecksum(base64Audio: string): string {
  const buffer = Buffer.from(base64Audio, 'base64');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validateCachedAudio(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    stalePrompts: [],
    missingAssets: [],
    hashMismatches: []
  };

  console.log('========================================');
  console.log('Cached Audio Validation');
  console.log('========================================\n');

  // Check if cached audio file exists
  const cachedAudioPath = path.join(__dirname, '../src/cached-audio.ts');
  if (!fs.existsSync(cachedAudioPath)) {
    result.errors.push('Cached audio file not found: src/cached-audio.ts');
    result.valid = false;
    return result;
  }

  // Import cached audio module
  let cachedAudio: any;
  try {
    // Dynamic import to avoid TS errors
    const cachedAudioModule = require('../src/cached-audio.ts');
    cachedAudio = cachedAudioModule;
  } catch (error) {
    result.errors.push('Failed to import cached audio module');
    result.valid = false;
    return result;
  }

  // Check generation version
  if (!cachedAudio.CACHED_AUDIO_GENERATION_VERSION) {
    result.warnings.push('Missing CACHED_AUDIO_GENERATION_VERSION');
  } else {
    console.log(`Generation Version: ${cachedAudio.CACHED_AUDIO_GENERATION_VERSION}`);
  }

  if (!cachedAudio.CACHED_AUDIO_GENERATED_AT) {
    result.warnings.push('Missing CACHED_AUDIO_GENERATED_AT');
  } else {
    console.log(`Generated At: ${cachedAudio.CACHED_AUDIO_GENERATED_AT}`);
    // Check if audio is older than 7 days (stale threshold)
    const generatedDate = new Date(cachedAudio.CACHED_AUDIO_GENERATED_AT);
    const daysSinceGeneration = (Date.now() - generatedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGeneration > 7) {
      result.warnings.push(`Cached audio is ${daysSinceGeneration.toFixed(1)} days old (may be stale)`);
    }
  }

  console.log(`\nModel: ${cachedAudio.REALTIME_MODEL || 'unknown'}`);
  console.log(`Voice: ${cachedAudio.TTS_VOICE || 'unknown'}`);
  console.log(`Output Format: ${cachedAudio.OUTPUT_FORMAT || 'unknown'}`);
  console.log('\n========================================\n');

  // Validate each cached prompt
  const cachedPrompts = cachedAudio.cachedPromptAudio || {};
  const cachedChecksums = cachedAudio.cachedAudioChecksums || {};
  const cachedMetadata = cachedAudio.cachedAudioMetadata || {};

  // Check for missing canonical prompts
  for (const key of Object.keys(CANONICAL_PROMPTS)) {
    if (!cachedPrompts[key]) {
      result.missingAssets.push(key);
      result.errors.push(`Missing cached audio for: ${key}`);
      result.valid = false;
    }
  }

  // Check for orphaned cached assets (keys in cache but not in canonical)
  for (const key of Object.keys(cachedPrompts)) {
    if (!CANONICAL_PROMPTS[key as keyof typeof CANONICAL_PROMPTS]) {
      result.warnings.push(`Orphaned cached asset (not in canonical): ${key}`);
    }
  }

  // Validate each cached asset
  for (const [key, base64Audio] of Object.entries(cachedPrompts)) {
    console.log(`Validating ${key}...`);

    // Check if audio data is present and non-empty
    if (!base64Audio || typeof base64Audio !== 'string' || base64Audio.length === 0) {
      result.errors.push(`${key}: Empty or invalid audio data`);
      result.valid = false;
      continue;
    }

    // Calculate checksum
    const calculatedChecksum = calculateChecksum(base64Audio as string);
    const storedChecksum = cachedChecksums[key];
    const actualByteLength = Buffer.from(base64Audio as string, 'base64').length;

    if (!storedChecksum) {
      result.warnings.push(`${key}: Missing stored checksum`);
    } else if (calculatedChecksum !== storedChecksum) {
      result.hashMismatches.push(key);
      result.errors.push(`${key}: Checksum mismatch (calculated: ${calculatedChecksum}, stored: ${storedChecksum})`);
      result.valid = false;
    }

    // Validate metadata
    const metadata = cachedMetadata[key];
    if (!metadata) {
      result.warnings.push(`${key}: Missing metadata`);
    } else {
      // Validate byte length matches actual audio data
      if (metadata.byteLength !== actualByteLength) {
        result.errors.push(`${key}: Metadata byteLength (${metadata.byteLength}) does not match actual (${actualByteLength})`);
        result.valid = false;
      }

      // Validate reasonable duration
      if (metadata.expectedDuration && (metadata.expectedDuration < 1 || metadata.expectedDuration > 30)) {
        result.warnings.push(`${key}: Unusual duration: ${metadata.expectedDuration}s`);
      }
    }

    console.log(`  ✓ Checksum: ${calculatedChecksum.substring(0, 16)}...`);
    console.log(`  ✓ Byte length: ${actualByteLength}`);
    console.log(`  ✓ Duration: ${metadata?.expectedDuration || 'unknown'}s`);
  }

  // Check for stale words in canonical prompts
  console.log('\n========================================');
  console.log('Stale Word Detection');
  console.log('========================================\n');

  for (const [key, prompt] of Object.entries(CANONICAL_PROMPTS)) {
    const promptLower = prompt.toLowerCase();
    for (const staleWord of STALE_WORDS) {
      if (promptLower.includes(staleWord.toLowerCase())) {
        result.stalePrompts.push(key);
        result.errors.push(`${key}: Contains stale word "${staleWord}"`);
        result.valid = false;
        console.log(`✗ ${key}: Contains "${staleWord}"`);
      }
    }
  }

  if (result.stalePrompts.length === 0) {
    console.log('✓ No stale words found in canonical prompts');
  }

  // Print summary
  console.log('\n========================================');
  console.log('Validation Summary');
  console.log('========================================\n');

  if (result.errors.length > 0) {
    console.log(`❌ ERRORS (${result.errors.length}):`);
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${result.warnings.length}):`);
    result.warnings.forEach(warn => console.log(`  - ${warn}`));
  }

  if (result.missingAssets.length > 0) {
    console.log(`\n📦 MISSING ASSETS (${result.missingAssets.length}):`);
    result.missingAssets.forEach(asset => console.log(`  - ${asset}`));
  }

  if (result.hashMismatches.length > 0) {
    console.log(`\n🔐 HASH MISMATCHES (${result.hashMismatches.length}):`);
    result.hashMismatches.forEach(key => console.log(`  - ${key}`));
  }

  if (result.stalePrompts.length > 0) {
    console.log(`\n🗑️  STALE PROMPTS (${result.stalePrompts.length}):`);
    result.stalePrompts.forEach(key => console.log(`  - ${key}`));
  }

  console.log('\n========================================');
  if (result.valid) {
    console.log('✅ Cache is VALID');
  } else {
    console.log('❌ Cache is INVALID');
  }
  console.log('========================================\n');

  // Print regeneration instructions if invalid
  if (!result.valid) {
    console.log('To regenerate cached audio:');
    console.log('1. Set OPENAI_API_KEY environment variable');
    console.log('2. Run: npm run generate:cached-audio');
    console.log('   or: npx ts-node scripts/generate-realtime-cached-audio.ts');
    console.log('');
  }

  return result;
}

// Run validation
const result = validateCachedAudio();
process.exit(result.valid ? 0 : 1);
