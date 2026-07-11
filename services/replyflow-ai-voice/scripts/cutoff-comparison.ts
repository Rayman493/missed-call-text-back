import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  process.exit(1);
}

// Test phrases with problematic S sounds
const testPhrases = {
  phrase1: "Please share the service address and the best time for the business to call you back.",
  phrase2: "Perfect. Last question—what's the best time for the business to call you back."
};

// Cutoff values to test
const cutoffs = [0.90, 0.85, 0.80, 0.75];

// Windowed-sinc resampler with configurable cutoff
function windowedSincResample(samples: Float32Array, fromRate: number, toRate: number, cutoff: number): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(outputLength);

  const kernelSize = 16;
  
  const kernel = new Float32Array(kernelSize * 2 + 1);
  for (let i = -kernelSize; i <= kernelSize; i++) {
    if (i === 0) {
      kernel[i + kernelSize] = 1.0;
    } else {
      const x = i * Math.PI * cutoff;
      kernel[i + kernelSize] = Math.sin(x) / x;
    }
    // Hamming window
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

// PCMU encoding
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

// PCMU decoding
function decodeMulawByte(muLawByte: number): number {
  const MULAW_BIAS = 0x84;
  const value = ~muLawByte & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function decodeMulawBuffer(muLawBuffer: Buffer): Float32Array {
  const pcmData = new Float32Array(muLawBuffer.length);
  for (let i = 0; i < muLawBuffer.length; i++) {
    pcmData[i] = decodeMulawByte(muLawBuffer[i]) / 32768.0;
  }
  return pcmData;
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
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
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

// Fetch source PCM from OpenAI
async function fetchSourcePCM(phrase: string): Promise<Float32Array> {
  console.log(`Fetching source PCM for: "${phrase}"`);
  
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: phrase,
      voice: 'alloy',
      response_format: 'pcm',
      sample_rate: 24000,
    }),
  });

  if (!response.ok) {
    console.error('  OpenAI TTS API error:', response.status, response.statusText);
    throw new Error('Failed to fetch audio');
  }

  const arrayBuffer = await response.arrayBuffer();
  const pcmBuffer = Buffer.from(arrayBuffer);
  console.log(`  Received ${pcmBuffer.length} bytes of PCM audio`);

  const pcmData = new Float32Array(pcmBuffer.length / 2);
  for (let i = 0; i < pcmData.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    pcmData[i] = sample / 32768.0;
  }

  return pcmData;
}

// Main comparison function
async function runCutoffComparison() {
  console.log('========================================');
  console.log('Cutoff Comparison Test');
  console.log('========================================\n');

  const outputDir = path.join(__dirname, 'cutoff-comparison-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const [phraseKey, phrase] of Object.entries(testPhrases)) {
    console.log(`\n--- Processing: ${phraseKey} ---`);
    console.log(`Phrase: "${phrase}"\n`);

    // Fetch source PCM once
    const sourcePCM = await fetchSourcePCM(phrase);
    writeWavFile(path.join(outputDir, `${phraseKey}-source-24k.wav`), sourcePCM, 24000);
    const sourceStats = analyzeAudio(sourcePCM, 'Source (24kHz)', 24000);

    // Process each cutoff
    for (const cutoff of cutoffs) {
      console.log(`\n--- Cutoff: ${cutoff} ---`);
      
      const cutoffDir = path.join(outputDir, `cutoff-${cutoff.toFixed(2)}`);
      if (!fs.existsSync(cutoffDir)) {
        fs.mkdirSync(cutoffDir, { recursive: true });
      }

      // Resample
      const resampled = windowedSincResample(sourcePCM, 24000, 8000, cutoff);
      writeWavFile(path.join(cutoffDir, `${phraseKey}-resampled-8k.wav`), resampled, 8000);
      
      // PCMU encode
      const mulaw = pcmToMulaw(resampled);
      fs.writeFileSync(path.join(cutoffDir, `${phraseKey}-pcmu.ulaw`), mulaw);
      
      // PCMU decode
      const decoded = decodeMulawBuffer(mulaw);
      writeWavFile(path.join(cutoffDir, `${phraseKey}-pcmu-decoded.wav`), decoded, 8000);
      
      const stats = analyzeAudio(resampled, `Cutoff ${cutoff}`, 8000);
      console.log(`  PCMU bytes: ${mulaw.length}`);
      
      // Report duration difference
      const durationDiffMs = Math.abs((stats.duration - sourceStats.duration) * 1000);
      console.log(`  Duration difference: ${durationDiffMs.toFixed(1)}ms`);
      console.log(`  Expected output samples: ${Math.round(sourceStats.sampleCount * 8000 / 24000)}`);
      console.log(`  Actual output samples: ${stats.sampleCount}`);
    }
  }

  console.log('\n========================================');
  console.log('Cutoff Comparison Complete');
  console.log(`Output directory: ${outputDir}`);
  console.log('========================================\n');

  console.log('Listening Instructions:');
  console.log('1. Listen to each cutoff variant for both phrases');
  console.log('2. Focus on S sounds: service, address, business, what\'s, pass, soon');
  console.log('3. Evaluate:');
  console.log('   - S harshness (lower is better)');
  console.log('   - S buzziness (lower is better)');
  console.log('   - Intelligibility (higher is better)');
  console.log('   - Overall naturalness (higher is better)');
  console.log('   - Telephone realism (higher is better)');
  console.log('4. Select cutoff that sounds most like professional IVR');
  console.log('\nGoal: Natural narrowband speech, not maximum treble/brightness\n');
}

runCutoffComparison().catch(console.error);
