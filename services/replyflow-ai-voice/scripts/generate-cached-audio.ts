import WebSocket from 'ws';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  console.error('Please set OPENAI_API_KEY environment variable before running this script');
  process.exit(1);
}

// ========================================
// AUDIO RESAMPLER CONFIGURATION
// ========================================
// Change this value to tune anti-alias cutoff
// Lower values = more high-frequency attenuation (softer S sounds)
// Higher values = more high-frequency preservation (sharper S sounds)
// Valid range: 0.5 to 1.0 (normalized to target Nyquist)
// ========================================
const RESAMPLER_CUTOFF = 0.90;

// ========================================
// OPENAI VOICE CONFIGURATION
// ========================================
// Change this value to test different OpenAI TTS voices
// Supported voices: alloy, echo, fable, onyx, nova, shimmer
// ========================================
const TTS_VOICE = "alloy";

// Generation version - update when changing cutoff or voice
const CACHED_AUDIO_GENERATION_VERSION = "voice-alloy";

const prompts = {
  ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
  ask_details: "Got it. Can you share any important details the business should know?",
  ask_location: "Thanks. Just a couple more questions. Where will this take place?",
  ask_completion_time: "When are you hoping this will be done?",
  ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
  complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
};

// Standard G.711 μ-law encoding
function pcmToMulaw(pcmData: Float32Array): Buffer {
  const MULAW_BIAS = 0x84;
  const MULAW_CLIP = 32635;
  const muLawData = new Uint8Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    let sample = Math.max(-1, Math.min(1, pcmData[i]));
    let linear = Math.floor(sample * 32767);

    let sign = (linear >> 8) & 0x80;
    if (sign !== 0) linear = -linear;
    if (linear > MULAW_CLIP) linear = MULAW_CLIP;
    linear = linear + MULAW_BIAS;

    let exponent = 7;
    for (let expMask = 0x4000; !(linear & expMask) && exponent > 0; exponent--, expMask >>= 1) {
    }
    let mantissa = (linear >> (exponent + 3)) & 0x0F;
    let mulawByte = ~(sign | (exponent << 4) | mantissa);
    muLawData[i] = mulawByte;
  }
  return Buffer.from(muLawData);
}

// Windowed-sinc resampler with built-in anti-aliasing
function windowedSincResample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(outputLength);

  // Windowed-sinc filter parameters
  const kernelSize = 16; // Number of samples on each side
  const cutoff = RESAMPLER_CUTOFF; // Use canonical constant
  
  // Pre-compute sinc kernel
  const kernel = new Float32Array(kernelSize * 2 + 1);
  for (let i = -kernelSize; i <= kernelSize; i++) {
    if (i === 0) {
      kernel[i + kernelSize] = 1.0;
    } else {
      const x = i * Math.PI * cutoff;
      kernel[i + kernelSize] = Math.sin(x) / x;
    }
    // Apply Hamming window
    kernel[i + kernelSize] *= 0.54 + 0.46 * Math.cos(Math.PI * i / kernelSize);
  }

  // Normalize kernel to preserve DC gain (sum of coefficients = 1.0)
  let kernelSum = 0;
  for (let i = 0; i < kernel.length; i++) {
    kernelSum += kernel[i];
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  // Resample using windowed-sinc interpolation
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    let sum = 0;
    for (let k = -kernelSize; k <= kernelSize; k++) {
      const srcIdx = srcIndex + k;
      if (srcIdx >= 0 && srcIdx < samples.length) {
        const kernelIdx = Math.round(k - frac) + kernelSize;
        if (kernelIdx >= 0 && kernelIdx < kernel.length) {
          sum += samples[srcIdx] * kernel[kernelIdx];
        }
      }
    }
    result[i] = sum;
  }

  return result;
}

async function generateCachedAudio() {
  const results: Record<string, string> = {};

  for (const [key, prompt] of Object.entries(prompts)) {
    console.log(`Generating audio for ${key}: ${prompt}`);
    
    const audioData = await generateSingleAudio(prompt);
    if (audioData) {
      results[key] = audioData;
      console.log(`✓ Generated ${key}: ${audioData.length} bytes`);
    } else {
      console.error(`✗ Failed to generate ${key}`);
    }
  }

  // Output as JavaScript object
  console.log('\n\n// Cached PCMU audio for Simple Mode prompts');
  console.log('export const cachedPromptAudio = {');
  for (const [key, value] of Object.entries(results)) {
    console.log(`  ${key}: \`${value}\`,`);
  }
  console.log('} as const;');

  // Also write to file
  const fs = require('fs');
  const crypto = require('crypto');
  
  // Generate checksums for each asset
  const checksums: Record<string, string> = {};
  for (const [key, value] of Object.entries(results)) {
    checksums[key] = crypto.createHash('sha256').update(value).digest('hex');
  }
  
  const output = `// Cached PCMU audio for Simple Mode prompts
// Generated with windowed-sinc resampler
// Cutoff: ${RESAMPLER_CUTOFF}
// Voice: ${TTS_VOICE}
// Generation date: ${new Date().toISOString()}
export const CACHED_AUDIO_GENERATION_VERSION = "${CACHED_AUDIO_GENERATION_VERSION}";
export const CACHED_AUDIO_GENERATED_AT = "${new Date().toISOString()}";
export const RESAMPLER_CUTOFF = ${RESAMPLER_CUTOFF};
export const TTS_VOICE = "${TTS_VOICE}";

export const cachedPromptAudio = {
${Object.entries(results).map(([key, value]) => `  ${key}: \`${value}\`,`).join('\n')}
} as const;

export const cachedAudioChecksums = {
${Object.entries(checksums).map(([key, value]) => `  ${key}: "${value}",`).join('\n')}
} as const;`;
  fs.writeFileSync('src/cached-audio.ts', output);
  console.log('\n✓ Wrote to src/cached-audio.ts');
  console.log('✓ Added version tracking and checksums');
}

async function generateSingleAudio(prompt: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: prompt,
        voice: TTS_VOICE,
        response_format: 'pcm',
        sample_rate: 24000,
      }),
    });

    if (!response.ok) {
      console.error('  OpenAI TTS API error:', response.status, response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const pcmBuffer = Buffer.from(arrayBuffer);
    console.log(`  Received ${pcmBuffer.length} bytes of PCM audio`);

    // Convert to Float32Array
    const pcmData = new Float32Array(pcmBuffer.length / 2);
    for (let i = 0; i < pcmData.length; i++) {
      const sample = pcmBuffer.readInt16LE(i * 2);
      pcmData[i] = sample / 32768.0;
    }

    // Resample from 24kHz to 8kHz using windowed-sinc (built-in anti-aliasing)
    const resampledPcm = windowedSincResample(pcmData, 24000, 8000);

    // Convert to μ-law
    const mulawBuffer = pcmToMulaw(resampledPcm);
    console.log(`  Converted to ${mulawBuffer.length} bytes of μ-law audio`);

    return mulawBuffer.toString('base64');
  } catch (error) {
    console.error('  Error generating audio:', error);
    return null;
  }
}

generateCachedAudio().catch(console.error);
