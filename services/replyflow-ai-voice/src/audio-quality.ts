const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
const OUTPUT_GAIN = 0.86;

function decodeMulawByte(muLawByte: number): number {
  const value = ~muLawByte & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function encodeMulawSample(sample: number): number {
  let linear = Math.max(-MULAW_CLIP, Math.min(MULAW_CLIP, Math.round(sample)));
  const sign = linear < 0 ? 0x80 : 0;

  if (linear < 0) {
    linear = -linear;
  }

  linear = Math.min(linear, MULAW_CLIP) + MULAW_BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; !(linear & expMask) && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (linear >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function applyPcmuOutputHeadroom(audioData: Buffer): Buffer {
  if (audioData.length === 0) {
    return audioData;
  }

  const adjusted = Buffer.allocUnsafe(audioData.length);

  for (let i = 0; i < audioData.length; i++) {
    const sample = decodeMulawByte(audioData[i]) * OUTPUT_GAIN;
    adjusted[i] = encodeMulawSample(sample);
  }

  return adjusted;
}
