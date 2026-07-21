import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Load environment variables from .env file
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  console.error('Please set OPENAI_API_KEY environment variable before running this script');
  process.exit(1);
}

// ========================================
// REALTIME AUDIO GENERATION CONFIGURATION
// ========================================
// OpenAI Realtime model to use
const REALTIME_MODEL = "gpt-realtime-2.1";

// Voice selection: marin or cedar (recommended for telephone quality)
const TTS_VOICE = "marin";

// Output format: audio/pcmu for direct telephony compatibility
const OUTPUT_FORMAT = "audio/pcmu";

// Generation version
const CACHED_AUDIO_GENERATION_VERSION = "realtime-pcmu-marin-canonical";

// Production prompts for Simple Mode (canonical runtime stage names)
// These are the exact keys used by the runtime state machine - no aliases allowed
const prompts = {
  ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
  ask_name_reason_service_only: "And what do you need help with?",
  ask_name_reason_name_only: "And what's your name?",
  ask_details: "Okay. Can you share any important details the business should know?",
  ask_location: "And what location or address should the business have for this?",
  ask_completion_time: "When are you hoping this will be done?",
  ask_callback_time: "Okay. Last question—what would be the best time for the business to call you back?",
  complete: "Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a good day."
};

// System instruction for verbatim prompt reading
const SYSTEM_INSTRUCTION = `You are a professional receptionist for a business. Your task is to read the supplied text exactly as written.

Rules:
- Read the text verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.
- Speak as a calm, professional receptionist.
- Use natural pacing suitable for a telephone call.
- Do not add introductory phrases like "Here is the text" or "I will read this now."
- Do not add concluding phrases like "Is there anything else?" unless the text itself includes them.
- The output should sound like a natural human receptionist speaking on a phone call.`;

// ========================================
// REALTIME WEBSOCKET CLIENT
// ========================================
class RealtimeAudioGenerator {
  private ws: WebSocket | null = null;
  private audioChunks: Buffer[] = [];
  private responseComplete: boolean = false;
  private transcript: string = "";
  private sessionConfigured: boolean = false;
  private pendingPrompt: string | null = null;

  async generateAudio(prompt: string): Promise<{ audio: Buffer; transcript: string } | null> {
    return new Promise((resolve, reject) => {
      this.audioChunks = [];
      this.responseComplete = false;
      this.transcript = "";
      this.sessionConfigured = false;
      this.pendingPrompt = prompt;

      // Create WebSocket connection to OpenAI Realtime API (GA)
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });

      this.ws.on('open', () => {
        console.log('WebSocket connection opened');
        this.configureSession();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        if (this.responseComplete && this.audioChunks.length > 0) {
          const audio = Buffer.concat(this.audioChunks);
          console.log(`Generated ${audio.length} bytes of PCMU audio`);
          console.log(`Transcript: "${this.transcript}"`);
          resolve({ audio, transcript: this.transcript });
        } else if (!this.responseComplete) {
          console.error('Connection closed before response complete');
          reject(new Error('Connection closed before response complete'));
        } else {
          reject(new Error('No audio data received'));
        }
      });
    });
  }

  private configureSession() {
    if (!this.ws) return;

    const sessionConfig = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: {
              type: 'audio/pcmu'
            }
          },
          output: {
            format: {
              type: OUTPUT_FORMAT
            },
            voice: TTS_VOICE
          }
        },
        instructions: SYSTEM_INSTRUCTION
      }
    };

    console.log('Configuring session:', JSON.stringify(sessionConfig, null, 2));
    this.ws.send(JSON.stringify(sessionConfig));
  }

  private sendPrompt(prompt: string) {
    if (!this.ws) return;

    const createMessage = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt
          }
        ]
      }
    };

    const createResponse = {
      type: 'response.create'
    };

    console.log('Sending prompt:', prompt);
    this.ws.send(JSON.stringify(createMessage));
    this.ws.send(JSON.stringify(createResponse));
  }

  private handleMessage(data: Buffer) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'session.updated':
          console.log('Session updated');
          this.sessionConfigured = true;
          // Send prompt after session is configured
          if (this.pendingPrompt) {
            this.sendPrompt(this.pendingPrompt);
            this.pendingPrompt = null;
          }
          break;

        case 'response.audio_transcript.delta':
          if (message.delta) {
            this.transcript += message.delta;
          }
          break;

        case 'response.output_audio.delta':
          if (message.delta) {
            // Delta is base64-encoded audio
            const audioBuffer = Buffer.from(message.delta, 'base64');
            this.audioChunks.push(audioBuffer);
          }
          break;

        case 'response.done':
          console.log('Response complete');
          this.responseComplete = true;
          // Close connection after a short delay to ensure all data is received
          setTimeout(() => {
            if (this.ws) {
              this.ws.close();
            }
          }, 100);
          break;

        case 'error':
          console.error('Realtime API error:', message.error);
          break;

        default:
          // Ignore other event types
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
}

// ========================================
// WAV FILE WRITER (for diagnostics only)
// ========================================
function writeWavFile(filePath: string, pcmuData: Buffer) {
  // PCMU is 8kHz, mono, 8-bit per sample
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmuData.length;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(fileSize + 8);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk (for 8-bit PCM)
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

  // Copy PCMU data (8-bit)
  pcmuData.copy(buffer, 44);

  fs.writeFileSync(filePath, buffer);
}

// ========================================
// MAIN GENERATION FUNCTION
// ========================================
async function generateRealtimeCachedAudio() {
  console.log('========================================');
  console.log('OpenAI Realtime Cached Audio Generation');
  console.log('========================================');
  console.log(`Model: ${REALTIME_MODEL}`);
  console.log(`Voice: ${TTS_VOICE}`);
  console.log(`Output Format: ${OUTPUT_FORMAT}`);
  console.log(`Generation Version: ${CACHED_AUDIO_GENERATION_VERSION}`);
  console.log('========================================\n');

  // Optional key filter: support single-key or subset regeneration without touching others
  // Accept --keys=ask_location,ask_details or KEYS env var
  const cliArg = process.argv.find(a => a.startsWith('--keys='));
  const cliKeys = cliArg ? cliArg.split('=')[1] : '';
  const envKeys = process.env.KEYS || '';
  const requestedKeys = (cliKeys || envKeys)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let keysToGenerate = Object.keys(prompts);
  if (requestedKeys.length > 0) {
    const valid = new Set(Object.keys(prompts));
    keysToGenerate = requestedKeys.filter(k => valid.has(k));
    if (keysToGenerate.length === 0) {
      console.error('No valid keys specified via --keys or KEYS env. Valid keys:', Array.from(valid).join(', '));
      process.exit(1);
    }
    console.log(`Filtering to keys: ${keysToGenerate.join(', ')}`);
  }

  const generator = new RealtimeAudioGenerator();
  const results: Record<string, string> = {};
  const metadata: Record<string, any> = {};

  for (const key of keysToGenerate) {
    const prompt = (prompts as any)[key];
    console.log(`\n--- Generating ${key} ---`);
    console.log(`Prompt: "${prompt}"\n`);

    try {
      const result = await generator.generateAudio(prompt);
      
      if (!result) {
        console.error(`Failed to generate audio for ${key}`);
        continue;
      }

      const { audio, transcript } = result;

      // For audio-only mode, we cannot validate transcript
      // Instead validate that audio was generated and response completed
      if (audio.length === 0) {
        console.error(`ERROR: No audio data received for ${key}`);
        continue;
      }

      // Validate reasonable duration (at least 1 second, at most 30 seconds)
      const duration = parseFloat((audio.length / 160 * 0.02).toFixed(3));
      if (duration < 1.0 || duration > 30.0) {
        console.error(`ERROR: Unreasonable duration for ${key}: ${duration}s`);
        continue;
      }

      // Save raw PCMU (production asset)
      const base64Audio = audio.toString('base64');
      results[key] = base64Audio;

      // Calculate metadata
      const checksum = crypto.createHash('sha256').update(audio).digest('hex');
      const expectedDuration = (audio.length / 160 * 0.02).toFixed(3);

      metadata[key] = {
        byteLength: audio.length,
        expectedDuration: parseFloat(expectedDuration),
        checksum,
        transcript,
        generatedAt: new Date().toISOString()
      };

      console.log(`✓ Generated ${key}: ${audio.length} bytes`);
      console.log(`  Duration: ${expectedDuration}s`);
      console.log(`  Checksum: ${checksum}`);
      console.log(`  Transcript: "${transcript}"`);

      // Write diagnostic WAV file
      const diagnosticDir = 'scripts/realtime-diagnostics';
      if (!fs.existsSync(diagnosticDir)) {
        fs.mkdirSync(diagnosticDir, { recursive: true });
      }
      const wavPath = `${diagnosticDir}/${key}-${TTS_VOICE}.wav`;
      writeWavFile(wavPath, audio);
      console.log(`  Diagnostic WAV: ${wavPath}`);

    } catch (error) {
      console.error(`✗ Failed to generate ${key}:`, error);
    }
  }

  if (Object.keys(results).length === 0) {
    console.error('\nERROR: No prompts were successfully generated');
    process.exit(1);
  }

  // Merge with existing cached-audio.ts so unrelated assets remain unchanged
  let existing: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    existing = require('../src/cached-audio.ts');
  } catch (e) {
    console.warn('Warning: Failed to import existing cached-audio.ts, will create fresh file');
  }

  const mergedAudio: Record<string, string> = {
    ...(existing?.cachedPromptAudio || {}),
    ...results,
  };
  const mergedChecksums: Record<string, string> = {
    ...(existing?.cachedAudioChecksums || {}),
    ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, (v as any).checksum])),
  };
  const mergedMetadata: Record<string, any> = {
    ...(existing?.cachedAudioMetadata || {}),
    ...metadata,
  };

  // Write merged file
  const output = `// Cached PCMU audio for Simple Mode prompts
// Generated with OpenAI Realtime API
// Model: ${REALTIME_MODEL}
// Voice: ${TTS_VOICE}
// Output Format: ${OUTPUT_FORMAT}
// Generation date: ${new Date().toISOString()}
export const CACHED_AUDIO_GENERATION_VERSION = "${CACHED_AUDIO_GENERATION_VERSION}";
export const CACHED_AUDIO_GENERATED_AT = "${new Date().toISOString()}";
export const REALTIME_MODEL = "${REALTIME_MODEL}";
export const TTS_VOICE = "${TTS_VOICE}";
export const OUTPUT_FORMAT = "${OUTPUT_FORMAT}";

export const cachedPromptAudio = {
${Object.entries(mergedAudio).map(([key, value]) => `  ${key}: \`${value}\`,`).join('\n')}
} as const;

export const cachedAudioChecksums = {
${Object.entries(mergedChecksums).map(([key, value]) => `  ${key}: "${value}",`).join('\n')}
} as const;

export const cachedAudioMetadata = {
${Object.entries(mergedMetadata).map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`).join('\n')}
} as const;`;

  fs.writeFileSync('src/cached-audio.ts', output);
  console.log('\n✓ Wrote merged output to src/cached-audio.ts');
  console.log('✓ Preserved unrelated cached assets and checksums');
  console.log('\n========================================');
  console.log('Generation Complete');
  console.log('========================================');
}

generateRealtimeCachedAudio().catch(console.error);
