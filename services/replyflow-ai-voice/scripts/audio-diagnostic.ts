import * as fs from 'fs';
import * as path from 'path';

// Audio diagnostic script - processes controlled phrases through each pipeline stage
// Generates local artifacts for forensic analysis

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

// Standard G.711 μ-law encoding
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

// Low-pass filter (RC filter - single pole IIR)
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

// Write WAV file header + PCM16 data
function writeWavFile(filename: string, pcmData: Float32Array, sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length * 2;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  
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
  
  // Write PCM16 data
  for (let i = 0; i < pcmData.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = Math.round(sample * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
  console.log(`✓ Wrote ${filename} (${pcmData.length} samples, ${sampleRate} Hz)`);
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
  const duration = pcmData.length / 24000; // Assuming 24kHz source
  
  console.log(`\n[${label}]`);
  console.log(`  Samples: ${pcmData.length}`);
  console.log(`  Duration: ${duration.toFixed(3)}s`);
  console.log(`  Peak: ${max.toFixed(4)} / ${min.toFixed(4)}`);
  console.log(`  RMS: ${rms.toFixed(4)}`);
  console.log(`  Clipping samples: ${clippingCount}`);
}

async function runDiagnostics() {
  const outputDir = path.join(__dirname, 'diagnostic-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Audio Diagnostic Script');
  console.log('========================\n');
  
  // Test phrases
  const testPhrases = {
    middle: "Please share the service address and the best time for the business to call you back.",
    final: "Thanks for calling. I'll pass this information to the business, and they will get back to you soon. Have a great day."
  };
  
  for (const [key, phrase] of Object.entries(testPhrases)) {
    console.log(`\nProcessing: ${key}`);
    console.log(`Phrase: "${phrase}"`);
    
    // Simulate OpenAI TTS output (24kHz PCM16)
    // For this diagnostic, we'll use a simple sine wave as placeholder
    // In production, this would come from OpenAI TTS API
    const sourceSampleRate = 24000;
    const duration = phrase.length * 0.08; // Rough estimate
    const sourceSamples = Math.floor(sourceSampleRate * duration);
    const sourcePcm = new Float32Array(sourceSamples);
    
    // Generate test tone (400Hz sine wave for sibilant testing)
    for (let i = 0; i < sourceSamples; i++) {
      const t = i / sourceSampleRate;
      sourcePcm[i] = 0.5 * Math.sin(2 * Math.PI * 400 * t);
    }
    
    analyzeAudio(sourcePcm, 'Source (24kHz PCM)');
    writeWavFile(path.join(outputDir, `${key}-source-24k.wav`), sourcePcm, sourceSampleRate);
    
    // Apply low-pass filter
    const filtered = applyLowPassFilter(sourcePcm, sourceSampleRate, 3400);
    analyzeAudio(filtered, 'After LPF (3400Hz)');
    writeWavFile(path.join(outputDir, `${key}-filtered-24k.wav`), filtered, sourceSampleRate);
    
    // Resample to 8kHz
    const targetSampleRate = 8000;
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.floor(filtered.length / ratio);
    const resampledPcm = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      resampledPcm[i] = cubicInterpolate(filtered, srcIndex);
    }
    
    analyzeAudio(resampledPcm, 'After Resample (8kHz)');
    writeWavFile(path.join(outputDir, `${key}-resampled-8k.wav`), resampledPcm, targetSampleRate);
    
    // Convert to PCMU
    const mulawBuffer = pcmToMulaw(resampledPcm);
    console.log(`\n[PCMU Encoding]`);
    console.log(`  Bytes: ${mulawBuffer.length}`);
    console.log(`  Expected duration: ${(mulawBuffer.length / 160 * 0.02).toFixed(3)}s (160 bytes = 20ms at 8kHz)`);
    
    fs.writeFileSync(path.join(outputDir, `${key}-pcmu.ulaw`), mulawBuffer);
    console.log(`  ✓ Wrote ${key}-pcmu.ulaw`);
    
    // Decode PCMU back to PCM for verification
    const decodedPcm = decodeMulawBuffer(mulawBuffer);
    analyzeAudio(decodedPcm, 'Decoded from PCMU');
    writeWavFile(path.join(outputDir, `${key}-pcmu-decoded.wav`), decodedPcm, targetSampleRate);
  }
  
  // Analyze current cached assets
  console.log('\n\n========================================');
  console.log('Current Cached Assets Analysis');
  console.log('========================================\n');
  
  const cachedAudio = require('../src/cached-audio.ts') as { cachedPromptAudio: Record<string, string> };
  
  for (const [key, base64Audio] of Object.entries(cachedAudio.cachedPromptAudio)) {
    const buffer = Buffer.from(base64Audio as string, 'base64');
    const decodedPcm = decodeMulawBuffer(buffer);
    
    console.log(`\n[${key}]`);
    console.log(`  Base64 length: ${(base64Audio as string).length}`);
    console.log(`  PCMU bytes: ${buffer.length}`);
    console.log(`  Expected duration: ${(buffer.length / 160 * 0.02).toFixed(3)}s`);
    analyzeAudio(decodedPcm, 'Decoded from cache');
    writeWavFile(path.join(outputDir, `cached-${key}-decoded.wav`), decodedPcm, 8000);
  }
  
  console.log('\n\n========================================');
  console.log('Diagnostic complete');
  console.log(`Output directory: ${outputDir}`);
  console.log('========================================');
}

runDiagnostics().catch(console.error);
