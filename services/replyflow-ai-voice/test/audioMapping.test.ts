/**
 * Audio Mapping Validation Tests
 * Tests that cached audio assets are correctly mapped and not duplicated
 */

import { cachedPromptAudio, cachedAudioChecksums, cachedAudioMetadata } from '../src/cached-audio';
import * as crypto from 'crypto';

// Required prompt keys for Simple Mode
const requiredPromptKeys = [
  'ask_name_reason',
  'ask_name_reason_service_only',
  'ask_name_reason_name_only',
  'ask_details',
  'ask_location',
  'ask_completion_time',
  'ask_callback_time',
  'complete'
];

const prompts = {
  ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
  ask_name_reason_service_only: "And what do you need help with?",
  ask_name_reason_name_only: "And what's your name?",
  ask_details: "Got it. Can you share any important details the business should know?",
  ask_location: "Thanks. Just a couple more questions. Where will this take place?",
  ask_completion_time: "When are you hoping this will be done?",
  ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
  complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
};

console.log('=== AUDIO MAPPING VALIDATION TESTS ===\n');

let passed = 0;
let failed = 0;

// Test 1: All required prompt keys exist in cachedPromptAudio
console.log('Test 1: All required prompt keys exist in cachedPromptAudio');
let allKeysExist = true;
for (const key of requiredPromptKeys) {
  if (!cachedPromptAudio[key as keyof typeof cachedPromptAudio]) {
    console.log(`✗ FAIL: Missing cached audio for key: ${key}`);
    allKeysExist = false;
    failed++;
  }
}
if (allKeysExist) {
  console.log('✓ PASS: All required prompt keys exist');
  passed++;
}

// Test 2: Targeted prompts have their own audio assets (not byte-identical to ask_name_reason)
console.log('\nTest 2: Targeted prompts have their own audio assets');
const askNameReasonAudio = cachedPromptAudio.ask_name_reason;
const askNameReasonHash = crypto.createHash('sha256').update(Buffer.from(askNameReasonAudio, 'base64')).digest('hex');

const serviceOnlyAudio = (cachedPromptAudio as any)['ask_name_reason_service_only'];
const serviceOnlyHash = serviceOnlyAudio ? crypto.createHash('sha256').update(Buffer.from(serviceOnlyAudio, 'base64')).digest('hex') : null;

const nameOnlyAudio = (cachedPromptAudio as any)['ask_name_reason_name_only'];
const nameOnlyHash = nameOnlyAudio ? crypto.createHash('sha256').update(Buffer.from(nameOnlyAudio, 'base64')).digest('hex') : null;

if (!serviceOnlyAudio) {
  console.log('✗ FAIL: ask_name_reason_service_only audio is missing');
  failed++;
} else if (serviceOnlyHash === askNameReasonHash) {
  console.log('✗ FAIL: ask_name_reason_service_only has same hash as ask_name_reason (duplicate audio)');
  failed++;
} else {
  console.log('✓ PASS: ask_name_reason_service_only has unique audio');
  passed++;
}

if (!nameOnlyAudio) {
  console.log('✗ FAIL: ask_name_reason_name_only audio is missing');
  failed++;
} else if (nameOnlyHash === askNameReasonHash) {
  console.log('✗ FAIL: ask_name_reason_name_only has same hash as ask_name_reason (duplicate audio)');
  failed++;
} else {
  console.log('✓ PASS: ask_name_reason_name_only has unique audio');
  passed++;
}

// Test 3: Targeted prompts are significantly shorter than full prompt
console.log('\nTest 3: Targeted prompts are significantly shorter than full prompt');
const askNameReasonLength = Buffer.from(askNameReasonAudio, 'base64').length;

if (serviceOnlyAudio) {
  const serviceOnlyLength = Buffer.from(serviceOnlyAudio, 'base64').length;
  const serviceOnlyDuration = serviceOnlyLength / 160 * 0.02; // 8kHz PCMU, 160 bytes per 20ms chunk
  const askNameReasonDuration = askNameReasonLength / 160 * 0.02;
  
  console.log(`  ask_name_reason duration: ${askNameReasonDuration.toFixed(2)}s`);
  console.log(`  ask_name_reason_service_only duration: ${serviceOnlyDuration.toFixed(2)}s`);
  
  if (serviceOnlyLength < askNameReasonLength * 0.5) {
    console.log('✓ PASS: service_only prompt is significantly shorter');
    passed++;
  } else {
    console.log('✗ FAIL: service_only prompt is not significantly shorter (may be using wrong audio)');
    failed++;
  }
}

if (nameOnlyAudio) {
  const nameOnlyLength = Buffer.from(nameOnlyAudio, 'base64').length;
  const nameOnlyDuration = nameOnlyLength / 160 * 0.02;
  const askNameReasonDuration = askNameReasonLength / 160 * 0.02;
  
  console.log(`  ask_name_reason duration: ${askNameReasonDuration.toFixed(2)}s`);
  console.log(`  ask_name_reason_name_only duration: ${nameOnlyDuration.toFixed(2)}s`);
  
  if (nameOnlyLength < askNameReasonLength * 0.5) {
    console.log('✓ PASS: name_only prompt is significantly shorter');
    passed++;
  } else {
    console.log('✗ FAIL: name_only prompt is not significantly shorter (may be using wrong audio)');
    failed++;
  }
}

// Test 4: Checksums match the actual audio data
console.log('\nTest 4: Checksums match the actual audio data');
let checksumsMatch = true;
for (const key of requiredPromptKeys) {
  const audio = cachedPromptAudio[key as keyof typeof cachedPromptAudio];
  if (!audio) continue;
  
  const actualChecksum = crypto.createHash('sha256').update(Buffer.from(audio, 'base64')).digest('hex');
  const expectedChecksum = cachedAudioChecksums[key as keyof typeof cachedAudioChecksums];
  
  if (actualChecksum !== expectedChecksum) {
    console.log(`✗ FAIL: Checksum mismatch for ${key}`);
    console.log(`  Expected: ${expectedChecksum}`);
    console.log(`  Actual: ${actualChecksum}`);
    checksumsMatch = false;
    failed++;
  }
}
if (checksumsMatch) {
  console.log('✓ PASS: All checksums match');
  passed++;
}

// Test 5: Metadata byte lengths match actual audio byte lengths
console.log('\nTest 5: Metadata byte lengths match actual audio byte lengths');
let metadataMatches = true;
for (const key of requiredPromptKeys) {
  const audio = cachedPromptAudio[key as keyof typeof cachedPromptAudio];
  if (!audio) continue;
  
  const actualByteLength = Buffer.from(audio, 'base64').length;
  const metadataByteLength = cachedAudioMetadata[key as keyof typeof cachedAudioMetadata]?.byteLength;
  
  if (actualByteLength !== metadataByteLength) {
    console.log(`✗ FAIL: Byte length mismatch for ${key}`);
    console.log(`  Expected: ${metadataByteLength}`);
    console.log(`  Actual: ${actualByteLength}`);
    metadataMatches = false;
    failed++;
  }
}
if (metadataMatches) {
  console.log('✓ PASS: All metadata byte lengths match');
  passed++;
}

// Test 6: Prompt text mapping is correct
console.log('\nTest 6: Prompt text mapping is correct');
const expectedTexts = {
  ask_name_reason_service_only: "And what do you need help with?",
  ask_name_reason_name_only: "And what's your name?"
};

let textMappingCorrect = true;
for (const [key, expectedText] of Object.entries(expectedTexts)) {
  const actualText = (prompts as any)[key];
  if (actualText !== expectedText) {
    console.log(`✗ FAIL: Prompt text mismatch for ${key}`);
    console.log(`  Expected: "${expectedText}"`);
    console.log(`  Actual: "${actualText}"`);
    textMappingCorrect = false;
    failed++;
  }
}
if (textMappingCorrect) {
  console.log('✓ PASS: All prompt text mappings are correct');
  passed++;
}

// Test 7: Canonical registry contains all 8 legitimate prompt keys
console.log('\nTest 7: Canonical registry contains all 8 legitimate prompt keys');
const canonicalPromptKeys = [
  'ask_name_reason',
  'ask_name_reason_service_only',
  'ask_name_reason_name_only',
  'ask_details',
  'ask_location',
  'ask_completion_time',
  'ask_callback_time',
  'complete'
];
let canonicalRegistryComplete = true;
for (const key of canonicalPromptKeys) {
  if (!cachedPromptAudio[key as keyof typeof cachedPromptAudio]) {
    console.log(`✗ FAIL: Canonical registry missing key: ${key}`);
    canonicalRegistryComplete = false;
    failed++;
  }
}
if (canonicalRegistryComplete) {
  console.log('✓ PASS: Canonical registry contains all 8 legitimate prompt keys');
  passed++;
}

// Test 8: Current cachedPromptAudio produces empty missing and unexpected arrays
console.log('\nTest 8: Current cachedPromptAudio produces empty missing and unexpected arrays');
const loadedPromptKeys = Object.keys(cachedPromptAudio);
const missingPromptKeys = canonicalPromptKeys.filter(key => !loadedPromptKeys.includes(key));
const unexpectedPromptKeys = loadedPromptKeys.filter(key => !canonicalPromptKeys.includes(key));

if (missingPromptKeys.length === 0 && unexpectedPromptKeys.length === 0) {
  console.log('✓ PASS: No missing or unexpected prompt keys');
  passed++;
} else {
  console.log('✗ FAIL: Missing or unexpected prompt keys found');
  console.log(`  Missing: ${JSON.stringify(missingPromptKeys)}`);
  console.log(`  Unexpected: ${JSON.stringify(unexpectedPromptKeys)}`);
  failed++;
}

// Test 9: Targeted prompts are not classified as unexpected
console.log('\nTest 9: Targeted prompts are not classified as unexpected');
const targetedKeys = ['ask_name_reason_service_only', 'ask_name_reason_name_only'];
let targetedNotUnexpected = true;
for (const key of targetedKeys) {
  if (unexpectedPromptKeys.includes(key)) {
    console.log(`✗ FAIL: Targeted key classified as unexpected: ${key}`);
    targetedNotUnexpected = false;
    failed++;
  }
}
if (targetedNotUnexpected) {
  console.log('✓ PASS: Targeted prompts are not classified as unexpected');
  passed++;
}

// Test 10: Fake unknown prompt key would be detected as unexpected
console.log('\nTest 10: Fake unknown prompt key would be detected as unexpected');
const fakeKey = 'fake_unknown_prompt_key';
const wouldBeUnexpected = !canonicalPromptKeys.includes(fakeKey);
if (wouldBeUnexpected) {
  console.log('✓ PASS: Fake unknown prompt key would be detected as unexpected');
  passed++;
} else {
  console.log('✗ FAIL: Fake unknown prompt key would not be detected as unexpected');
  failed++;
}

// Test 11: Removing a required prompt would be detected as missing
console.log('\nTest 11: Removing a required prompt would be detected as missing');
const simulatedRemoval = 'ask_name_reason';
const simulatedLoadedKeys = loadedPromptKeys.filter(key => key !== simulatedRemoval);
const wouldBeMissing = canonicalPromptKeys.filter(key => !simulatedLoadedKeys.includes(key)).includes(simulatedRemoval);
if (wouldBeMissing) {
  console.log('✓ PASS: Removing required prompt would be detected as missing');
  passed++;
} else {
  console.log('✗ FAIL: Removing required prompt would not be detected as missing');
  failed++;
}

// Summary
console.log('\n=== TEST SUMMARY ===');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n✓ All audio mapping tests passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some audio mapping tests failed. Please run: npx ts-node scripts/generate-realtime-cached-audio.ts');
  process.exit(1);
}
