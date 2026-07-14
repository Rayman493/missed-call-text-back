/**
 * Generate Update Voicemail Greeting Audio
 * 
 * This script generates a high-quality AI voice greeting for the Update Voicemail
 * using OpenAI's text-to-speech API. The generated audio is saved as a static asset.
 * 
 * Usage:
 *   OPENAI_API_KEY=your_key npx tsx scripts/generate-update-voicemail-greeting.ts
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Configuration
const GREETING_TEXT = "Hi, this is the assistant for the business. We already have your original request. Please leave a quick update after the tone, and I'll add it to your conversation.";
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'audio');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'update-voicemail-greeting.mp3');

/**
 * Get OpenAI client
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate audio using OpenAI TTS
 */
async function generateGreetingAudio(): Promise<Buffer> {
  console.log('[GREETING GENERATION] Starting audio generation');
  console.log('[GREETING GENERATION] Text:', GREETING_TEXT);
  
  const openai = getOpenAIClient();
  
  // Use "alloy" voice which is natural and professional
  // Other options: "alloy", "echo", "fable", "onyx", "nova", "shimmer"
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: GREETING_TEXT,
    response_format: 'mp3',
  });
  
  const buffer = Buffer.from(await response.arrayBuffer());
  console.log('[GREETING GENERATION] Audio generated:', {
    sizeBytes: buffer.length,
    sizeKB: (buffer.length / 1024).toFixed(2)
  });
  
  return buffer;
}

/**
 * Save audio to public directory
 */
function saveAudioFile(buffer: Buffer): void {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('[GREETING GENERATION] Created directory:', OUTPUT_DIR);
  }
  
  fs.writeFileSync(OUTPUT_FILE, buffer);
  console.log('[GREETING GENERATION] Saved audio file:', OUTPUT_FILE);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('[GREETING GENERATION] =========================================');
    console.log('[GREETING GENERATION] Update Voicemail Greeting Generator');
    console.log('[GREETING GENERATION] =========================================');
    
    // Generate audio
    const audioBuffer = await generateGreetingAudio();
    
    // Save to file
    saveAudioFile(audioBuffer);
    
    console.log('[GREETING GENERATION] =========================================');
    console.log('[GREETING GENERATION] Success!');
    console.log('[GREETING GENERATION] Output:', OUTPUT_FILE);
    console.log('[GREETING GENERATION] Public URL: /audio/update-voicemail-greeting.mp3');
    console.log('[GREETING GENERATION] =========================================');
    
  } catch (error: any) {
    console.error('[GREETING GENERATION] Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { generateGreetingAudio, GREETING_TEXT };
