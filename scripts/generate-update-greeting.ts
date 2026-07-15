/**
 * Generate Customer Update greeting audio using OpenAI TTS
 * This script creates a pre-recorded greeting with the "alloy" voice
 * to match the AI intake voice for consistency.
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { OpenAI } from 'openai';

// Load environment variables from .env.local file
config({ path: '.env.local' });

// Check for required API key
if (!process.env.OPENAI_API_KEY) {
  console.error('[GREETING GENERATION] ERROR: OPENAI_API_KEY is not set in .env.local');
  console.error('[GREETING GENERATION] Please add OPENAI_API_KEY to your .env.local file and try again.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GREETING_TEXT = "Hi again. Please leave your update after the tone and we'll add it to your request. Thank you.";
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'update-voicemail-greeting-v2.mp3');

async function generateGreeting() {
  console.log('[GREETING GENERATION] Starting...');
  console.log('[GREETING GENERATION] Text:', GREETING_TEXT);
  console.log('[GREETING GENERATION] Voice: alloy');
  console.log('[GREETING GENERATION] Output:', OUTPUT_FILE);

  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: GREETING_TEXT,
      speed: 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(OUTPUT_FILE, buffer);

    console.log('[GREETING GENERATION] Success! Audio file created:', OUTPUT_FILE);
    console.log('[GREETING GENERATION] File size:', buffer.length, 'bytes');
  } catch (error) {
    console.error('[GREETING GENERATION] Error:', error);
    process.exit(1);
  }
}

generateGreeting();
