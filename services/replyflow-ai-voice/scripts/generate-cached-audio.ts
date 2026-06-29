import WebSocket from 'ws';
import fetch from 'node-fetch';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  console.error('Please set OPENAI_API_KEY environment variable before running this script');
  process.exit(1);
}

const prompts = {
  ask_name_reason: "Hi, this is ReplyFlow AI. Who am I speaking with, and what can we help you with today?",
  ask_details: "Thanks. Can you share any other details the business should know?",
  ask_location: "What address or location is this for?",
  ask_completion_time: "When would you like this work completed?",
  ask_callback_time: "What is the best time for the business to call you back?",
  complete: "Perfect. I'll pass this information along, and the business will get back to you soon. Goodbye."
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

// Cubic interpolation for resampling
function cubicInterpolate(samples: Float32Array, position: number): number {
  const i = Math.floor(position);
  const frac = position - i;
  const p0 = samples[Math.max(0, i - 1)];
  const p1 = samples[i];
  const p2 = samples[Math.min(samples.length - 1, i + 1)];
  const p3 = samples[Math.min(samples.length - 1, i + 2)];

  const a0 = p3 - p2 - p0 + p1;
  const a1 = p0 - p1 - a0;
  const a2 = p2 - p0;
  const a3 = p1;

  return a0 * frac * frac * frac + a1 * frac * frac + a2 * frac + a3;
}

// Low-pass filter
function applyLowPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const filtered = new Float32Array(samples.length);
  const rc = 1.0 / (cutoffHz * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  filtered[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    filtered[i] = alpha * samples[i] + (1 - alpha) * filtered[i - 1];
  }
  return filtered;
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
  const output = `// Cached PCMU audio for Simple Mode prompts
export const cachedPromptAudio = {
${Object.entries(results).map(([key, value]) => `  ${key}: \`${value}\`,`).join('\n')}
} as const;`;
  fs.writeFileSync('src/cached-audio.ts', output);
  console.log('\n✓ Wrote to src/cached-audio.ts');
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
        voice: 'alloy',
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

    // Apply low-pass filter
    const lowPassFiltered = applyLowPassFilter(pcmData, 24000, 3400);

    // Resample to 8kHz
    const targetSampleRate = 8000;
    const sourceSampleRate = 24000;
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.floor(lowPassFiltered.length / ratio);
    const resampledPcm = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      resampledPcm[i] = cubicInterpolate(lowPassFiltered, srcIndex);
    }

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
