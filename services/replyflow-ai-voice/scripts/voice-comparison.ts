import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  console.error('Please set OPENAI_API_KEY environment variable before running this script');
  process.exit(1);
}

// ========================================
// VOICE COMPARISON CONFIGURATION
// ========================================
// OpenAI TTS-1 supported voices
const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// Test prompts that stress S sounds
const TEST_PROMPTS = {
  phrase1: "Please share the service address and the best time for the business to call you back.",
  phrase2: "Perfect. Last question—what's the best time for the business to call you back."
};

// DSP configuration (same as production)
const RESAMPLER_CUTOFF = 0.90;
const SAMPLE_RATE_SOURCE = 24000;
const SAMPLE_RATE_TARGET = 8000;

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'voice-comparison-output');

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

// Windowed-sinc resampler with built-in anti-aliasing (same as production)
function windowedSincResample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(outputLength);

  const kernelSize = 16;
  const cutoff = RESAMPLER_CUTOFF;
  
  const kernel = new Float32Array(kernelSize * 2 + 1);
  for (let i = -kernelSize; i <= kernelSize; i++) {
    if (i === 0) {
      kernel[i + kernelSize] = 1.0;
    } else {
      const x = i * Math.PI * cutoff;
      kernel[i + kernelSize] = Math.sin(x) / x;
    }
    kernel[i + kernelSize] *= 0.54 + 0.46 * Math.cos(Math.PI * i / kernelSize);
  }

  // Normalize kernel to preserve DC gain
  let kernelSum = 0;
  for (let i = 0; i < kernel.length; i++) {
    kernelSum += kernel[i];
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

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

// WAV file writer
function writeWavFile(filePath: string, samples: Float32Array, sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * blockAlign;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(fileSize + 8);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

// Audio analysis
function analyzeAudio(samples: Float32Array, label: string, sampleRate: number) {
  let peak = 0;
  let rms = 0;
  let clipping = 0;

  for (let i = 0; i < samples.length; i++) {
    const absSample = Math.abs(samples[i]);
    if (absSample > peak) peak = absSample;
    if (absSample > 1.0) clipping++;
    rms += samples[i] * samples[i];
  }

  rms = Math.sqrt(rms / samples.length);
  const duration = samples.length / sampleRate;

  console.log(`  [${label}]`);
  console.log(`    SampleRate: ${sampleRate} Hz`);
  console.log(`    Samples: ${samples.length}`);
  console.log(`    Duration: ${duration.toFixed(3)}s`);
  console.log(`    Peak: ${peak.toFixed(4)}`);
  console.log(`    RMS: ${rms.toFixed(4)}`);
  console.log(`    Clipping: ${clipping}`);

  return { peak, rms, duration, clipping, sampleRate, sampleCount: samples.length };
}

// Generate audio for a specific voice and prompt
async function generateAudioForVoice(voice: string, prompt: string, phraseKey: string): Promise<Float32Array | null> {
  try {
    console.log(`Generating audio for voice: ${voice}, phrase: ${phraseKey}`);
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: prompt,
        voice: voice,
        response_format: 'pcm',
        sample_rate: SAMPLE_RATE_SOURCE,
      }),
    });

    if (!response.ok) {
      console.error(`  OpenAI TTS API error for voice ${voice}:`, response.status, response.statusText);
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

    // Resample using windowed-sinc (same as production)
    const resampledPcm = windowedSincResample(pcmData, SAMPLE_RATE_SOURCE, SAMPLE_RATE_TARGET);
    console.log(`  Resampled to ${resampledPcm.length} samples at ${SAMPLE_RATE_TARGET} Hz`);

    return resampledPcm;
  } catch (error) {
    console.error(`  Error generating audio for voice ${voice}:`, error);
    return null;
  }
}

// Main comparison function
async function runVoiceComparison() {
  console.log('========================================');
  console.log('OpenAI Voice Comparison');
  console.log('========================================');
  console.log(`Voices to test: ${VOICES.join(', ')}`);
  console.log(`DSP Cutoff: ${RESAMPLER_CUTOFF}`);
  console.log(`Sample rates: ${SAMPLE_RATE_SOURCE} Hz → ${SAMPLE_RATE_TARGET} Hz`);
  console.log('========================================\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: Record<string, any> = {};

  for (const voice of VOICES) {
    console.log(`\n--- Testing Voice: ${voice} ---`);
    
    const voiceDir = path.join(OUTPUT_DIR, voice);
    if (!fs.existsSync(voiceDir)) {
      fs.mkdirSync(voiceDir, { recursive: true });
    }

    const voiceResults: any = {};

    for (const [phraseKey, prompt] of Object.entries(TEST_PROMPTS)) {
      console.log(`\nPhrase: "${prompt}"\n`);

      // Generate audio
      const resampledPcm = await generateAudioForVoice(voice, prompt, phraseKey);
      if (!resampledPcm) {
        console.error(`Failed to generate audio for ${voice} - ${phraseKey}`);
        continue;
      }

      // Write WAV file (8kHz resampled)
      const wavPath = path.join(voiceDir, `${phraseKey}-8khz.wav`);
      writeWavFile(wavPath, resampledPcm, SAMPLE_RATE_TARGET);
      console.log(`  Wrote WAV: ${wavPath}`);

      // Analyze
      const stats = analyzeAudio(resampledPcm, `${voice} - ${phraseKey}`, SAMPLE_RATE_TARGET);
      voiceResults[phraseKey] = stats;

      // PCMU encode
      const mulaw = pcmToMulaw(resampledPcm);
      const mulawPath = path.join(voiceDir, `${phraseKey}-pcmu.ulaw`);
      fs.writeFileSync(mulawPath, mulaw);
      console.log(`  Wrote PCMU: ${mulawPath} (${mulaw.length} bytes)`);
    }

    results[voice] = voiceResults;
  }

  // Summary
  console.log('\n========================================');
  console.log('Voice Comparison Complete');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('========================================\n');

  console.log('Evaluation Instructions:');
  console.log('1. Listen to each voice variant for both phrases');
  console.log('2. Focus on S sounds: service, address, business, what\'s, pass, soon');
  console.log('3. Evaluate each voice on:');
  console.log('   - S harshness (lower is better)');
  console.log('   - S buzziness (lower is better)');
  console.log('   - Overall naturalness (higher is better)');
  console.log('   - Telephone realism (higher is better)');
  console.log('   - Intelligibility (higher is better)');
  console.log('   - Professional IVR quality (higher is better)');
  console.log('4. Rank by how it sounds through telephone playback, not studio quality');
  console.log('5. Select top 2-3 voices for real phone testing');
  console.log('\nNote: All voices use identical DSP pipeline (windowed-sinc resampler, PCMU)');
  console.log('Only the OpenAI voice parameter varies.\n');
}

runVoiceComparison().catch(console.error);
