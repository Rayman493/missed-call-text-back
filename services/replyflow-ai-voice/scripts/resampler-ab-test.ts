import * as fs from 'fs';
import * as path from 'path';

// A/B Validation Script: Current Custom DSP vs Proven Resampler
// This script generates comparable audio outputs for quality comparison

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

// Test phrases
const testPhrases = {
  middle: "Please share the service address and the best time for the business to call you back.",
  final: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
};

// Current custom DSP implementation (RC filter + cubic resampling)
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

function customResample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    resampled[i] = cubicInterpolate(samples, srcIndex);
  }

  return resampled;
}

// Proven resampler using windowed-sinc interpolation (standard DSP technique)
function provenResample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  // Calculate ratio and output length
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(outputLength);

  // Windowed-sinc filter parameters
  const kernelSize = 16; // Number of samples on each side
  const cutoff = 0.9; // Cutoff frequency (normalized, < 1.0 to prevent aliasing)
  
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

// PCMU encoding (shared by both paths)
function pcmToMulaw(pcmData: Float32Array): Buffer {
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

// Decode μ-law to PCM16
function decodeMulawByte(muLawByte: number): number {
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

// Write WAV file
function writeWavFile(filename: string, pcmData: Float32Array, sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length * 2;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  for (let i = 0; i < pcmData.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = Math.round(sample * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
}

// Analyze audio statistics
function analyzeAudio(pcmData: Float32Array, label: string) {
  let max = 0;
  let min = 0;
  let sum = 0;
  let clippingCount = 0;
  
  for (let i = 0; i < pcmData.length; i++) {
    const sample = pcmData[i];
    if (sample > max) max = sample;
    if (sample < min) min = sample;
    sum += Math.abs(sample);
    if (Math.abs(sample) >= 0.999) clippingCount++;
  }
  
  const rms = Math.sqrt(sum / pcmData.length);
  const duration = pcmData.length / 8000;
  
  console.log(`  [${label}]`);
  console.log(`    Samples: ${pcmData.length}`);
  console.log(`    Duration: ${duration.toFixed(3)}s`);
  console.log(`    Peak: ${max.toFixed(4)} / ${min.toFixed(4)}`);
  console.log(`    RMS: ${rms.toFixed(4)}`);
  console.log(`    Clipping: ${clippingCount}`);
  
  return { max, min, rms, duration, clippingCount };
}

// Generate test tone with sibilant frequencies
function generateTestTone(duration: number, sampleRate: number): Float32Array {
  const samples = Math.floor(sampleRate * duration);
  const pcm = new Float32Array(samples);
  
  // Mix of frequencies including sibilant range (4-8 kHz)
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // Base tone
    pcm[i] = 0.3 * Math.sin(2 * Math.PI * 400 * t);
    // Sibilant frequencies
    pcm[i] += 0.15 * Math.sin(2 * Math.PI * 5000 * t);
    pcm[i] += 0.1 * Math.sin(2 * Math.PI * 7000 * t);
    // Add some harmonics
    pcm[i] += 0.05 * Math.sin(2 * Math.PI * 2000 * t);
  }
  
  return pcm;
}

async function runABTest() {
  const outputDir = path.join(__dirname, 'ab-test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('========================================');
  console.log('Resampler A/B Validation Test');
  console.log('========================================\n');
  
  const sourceSampleRate = 24000;
  const targetSampleRate = 8000;
  const testDuration = 2.0; // 2 seconds
  
  // Generate source audio (simulating OpenAI TTS output)
  console.log('Generating source audio (24kHz)...');
  const sourcePcm = generateTestTone(testDuration, sourceSampleRate);
  writeWavFile(path.join(outputDir, 'source-24k.wav'), sourcePcm, sourceSampleRate);
  analyzeAudio(sourcePcm, 'Source (24kHz)');
  
  // Variant A: Current custom DSP
  console.log('\n--- Variant A: Current Custom DSP ---');
  console.log('Pipeline: RC filter (3400Hz) → Cubic resample → PCMU');
  
  const filteredA = applyLowPassFilter(sourcePcm, sourceSampleRate, 3400);
  const resampledA = customResample(filteredA, sourceSampleRate, targetSampleRate);
  const mulawA = pcmToMulaw(resampledA);
  const decodedA = decodeMulawBuffer(mulawA);
  
  writeWavFile(path.join(outputDir, 'variant-a-filtered-24k.wav'), filteredA, sourceSampleRate);
  writeWavFile(path.join(outputDir, 'variant-a-resampled-8k.wav'), resampledA, targetSampleRate);
  writeWavFile(path.join(outputDir, 'variant-a-pcmu-decoded.wav'), decodedA, targetSampleRate);
  fs.writeFileSync(path.join(outputDir, 'variant-a-pcmu.ulaw'), mulawA);
  
  const statsA = analyzeAudio(resampledA, 'Variant A (Custom DSP)');
  console.log(`  PCMU bytes: ${mulawA.length}`);
  
  // Variant B: Proven resampler (windowed-sinc)
  console.log('\n--- Variant B: Proven Resampler (Windowed-Sinc) ---');
  console.log('Pipeline: Windowed-sinc interpolation → PCMU');
  
  const resampledB = provenResample(sourcePcm, sourceSampleRate, targetSampleRate);
  const mulawB = pcmToMulaw(resampledB);
  const decodedB = decodeMulawBuffer(mulawB);
  
  writeWavFile(path.join(outputDir, 'variant-b-resampled-8k.wav'), resampledB, targetSampleRate);
  writeWavFile(path.join(outputDir, 'variant-b-pcmu-decoded.wav'), decodedB, targetSampleRate);
  fs.writeFileSync(path.join(outputDir, 'variant-b-pcmu.ulaw'), mulawB);
  
  const statsB = analyzeAudio(resampledB, 'Variant B (Windowed-Sinc)');
  console.log(`  PCMU bytes: ${mulawB.length}`);
  
  // Comparison
  console.log('\n--- Comparison ---');
  console.log(`  Sample count difference: ${statsA.max - statsB.max} samples`);
  console.log(`  Duration difference: ${(statsA.duration - statsB.duration).toFixed(3)}s`);
  console.log(`  Peak difference: ${(statsA.max - statsB.max).toFixed(4)}`);
  console.log(`  RMS difference: ${(statsA.rms - statsB.rms).toFixed(4)}`);
  console.log(`  PCMU size difference: ${mulawA.length - mulawB.length} bytes`);
  
  console.log('\n========================================');
  console.log('A/B Test Complete');
  console.log(`Output directory: ${outputDir}`);
  console.log('========================================');
  console.log('\nListening Test Instructions:');
  console.log('1. Listen to variant-a-pcmu-decoded.wav (current DSP)');
  console.log('2. Listen to variant-b-pcmu-decoded.wav (libsamplerate)');
  console.log('3. Compare S-sound clarity, harshness, smearing');
  console.log('4. Check for aliasing artifacts in high frequencies');
}

runABTest().catch(console.error);
