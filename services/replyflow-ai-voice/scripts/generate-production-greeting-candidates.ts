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

// Voice selection: marin (production voice)
const TTS_VOICE = "marin";

// Output format: audio/pcmu for direct telephony compatibility
const OUTPUT_FORMAT = "audio/pcmu";

// Canonical ask_name text - DO NOT CHANGE
const ASK_NAME_TEXT = "Hi, thanks for calling. I'm the virtual assistant for the business. I'll gather a few quick details so the business owner can follow up with you. First, may I have your name?";

// Production-faithful candidate instructions
const CANDIDATE_INSTRUCTIONS = {
  A: `You are a professional receptionist for a business. Your task is to read the supplied text exactly as written.

Rules:
- Read the text verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.
- Speak as a calm, professional receptionist.
- Use natural conversational pacing suitable for a telephone call.
- Ensure the greeting finishes cleanly.
- Do not trail off at the end.
- Do not add introductory phrases like "Here is the text" or "I will read this now."
- Do not add concluding phrases like "Is there anything else?" unless the text itself includes them.
- The output should sound like a natural human receptionist speaking on a phone call.`,

  B: `You are a professional receptionist for a business. Your task is to read the supplied text exactly as written.

Rules:
- Read the text verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.
- Speak as a natural professional receptionist.
- Use natural pacing suitable for a telephone call.
- The final phrase must end cleanly and confidently.
- No vocal fry on the final word.
- No rasp or degradation at the end.
- No trailing voice or fade-out.
- No rushed final word.
- Do not add introductory phrases like "Here is the text" or "I will read this now."
- Do not add concluding phrases like "Is there anything else?" unless the text itself includes them.
- The output should sound like a natural human receptionist speaking on a phone call.`,

  C: `You are a warm professional receptionist for a business. Your task is to read the supplied text exactly as written.

Rules:
- Read the text verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.
- Speak in a warm, conversational receptionist tone.
- Use relaxed but efficient pacing suitable for a telephone call.
- The final sentence should sound natural and complete.
- Ensure the final word ends cleanly without overemphasis or artificial stress.
- Do not add introductory phrases like "Here is the text" or "I will read this now."
- Do not add concluding phrases like "Is there anything else?" unless the text itself includes them.
- The output should sound like a natural human receptionist speaking on a phone call.`
};

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

  async generateAudio(prompt: string, instruction: string): Promise<{ audio: Buffer; transcript: string } | null> {
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
        this.configureSession(instruction);
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

  private configureSession(instruction: string) {
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
        instructions: instruction
      }
    };

    console.log('Configuring session');
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

    console.log('Sending prompt');
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
// WAV FILE WRITER (for reference only)
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
async function generateProductionGreetingCandidates() {
  console.log('========================================');
  console.log('Production-Faithful Greeting Candidates');
  console.log('========================================');
  console.log(`Model: ${REALTIME_MODEL}`);
  console.log(`Voice: ${TTS_VOICE}`);
  console.log(`Output Format: ${OUTPUT_FORMAT}`);
  console.log(`Text: "${ASK_NAME_TEXT}"`);
  console.log(`Candidates to generate: ${Object.keys(CANDIDATE_INSTRUCTIONS).length}`);
  console.log('========================================\n');

  const generator = new RealtimeAudioGenerator();
  const outputDir = 'scripts/production-greeting-candidates';

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: Array<{ candidate: string; instruction: string; wavPath: string; pcmuPath: string; base64Path: string; duration: number; transcript: string; checksum: string }> = [];

  for (const [candidateKey, instruction] of Object.entries(CANDIDATE_INSTRUCTIONS)) {
    const baseName = `ask-name-candidate-${candidateKey.toLowerCase()}`;

    console.log(`\n--- Generating Candidate ${candidateKey} ---`);
    console.log(`Instruction: ${instruction.substring(0, 80)}...\n`);

    try {
      const result = await generator.generateAudio(ASK_NAME_TEXT, instruction);
      
      if (!result) {
        console.error(`Failed to generate audio for candidate ${candidateKey}`);
        continue;
      }

      const { audio, transcript } = result;

      // Validate audio was generated
      if (audio.length === 0) {
        console.error(`ERROR: No audio data received for candidate ${candidateKey}`);
        continue;
      }

      // Validate reasonable duration
      const duration = parseFloat((audio.length / 160 * 0.02).toFixed(3));
      if (duration < 1.0 || duration > 30.0) {
        console.error(`ERROR: Unreasonable duration for candidate ${candidateKey}: ${duration}s`);
        continue;
      }

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(audio).digest('hex');

      // Save WAV file for rough reference (non-authoritative)
      const wavPath = `${outputDir}/${baseName}.wav`;
      writeWavFile(wavPath, audio);

      // Save raw PCMU file for production use
      const pcmuPath = `${outputDir}/${baseName}.pcmu`;
      fs.writeFileSync(pcmuPath, audio);

      // Save base64 for easy test integration
      const base64Audio = audio.toString('base64');
      const base64Path = `${outputDir}/${baseName}.base64`;
      fs.writeFileSync(base64Path, base64Audio);

      console.log(`✓ Generated candidate ${candidateKey}:`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Bytes: ${audio.length}`);
      console.log(`  Checksum: ${checksum}`);
      console.log(`  Transcript: "${transcript}"`);
      console.log(`  WAV (reference): ${wavPath}`);
      console.log(`  PCMU (production): ${pcmuPath}`);
      console.log(`  Base64 (test): ${base64Path}`);

      results.push({
        candidate: candidateKey,
        instruction: instruction,
        wavPath,
        pcmuPath,
        base64Path,
        duration,
        transcript,
        checksum
      });

    } catch (error) {
      console.error(`✗ Failed to generate candidate ${candidateKey}:`, error);
    }
  }

  if (results.length === 0) {
    console.error('\nERROR: No candidates were successfully generated');
    process.exit(1);
  }

  // Write summary file
  const summary = {
    generatedAt: new Date().toISOString(),
    model: REALTIME_MODEL,
    voice: TTS_VOICE,
    outputFormat: OUTPUT_FORMAT,
    text: ASK_NAME_TEXT,
    candidates: results
  };

  const summaryPath = `${outputDir}/generation-summary.json`;
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n✓ Wrote generation summary to ${summaryPath}`);

  // Write test selector file
  const testSelectorFile = `// TEMPORARY: Production greeting candidate test selector
// This file allows switching between greeting candidates for live phone testing
// DEFAULT: uses production cached audio
// To test a candidate, set TEST_GREETING_CANDIDATE to 'A', 'B', or 'C'

export const TEST_GREETING_CANDIDATE: 'A' | 'B' | 'C' | null = null;

// Candidate base64 strings (for test integration only)
${results.map(r => `export const CANDIDATE_${r.candidate}_BASE64 = \`${fs.readFileSync(r.base64Path, 'utf-8')}\`;`).join('\n')}
`;
  const selectorPath = `${outputDir}/test-selector.ts`;
  fs.writeFileSync(selectorPath, testSelectorFile);
  console.log(`✓ Wrote test selector to ${selectorPath}`);

  console.log('\n========================================');
  console.log('Candidate Generation Complete');
  console.log('========================================');
  console.log(`Successfully generated ${results.length} candidates`);
  console.log(`\nProduction PCMU files: ${outputDir}/*.pcmu`);
  console.log(`Reference WAV files: ${outputDir}/*.wav`);
  console.log(`Test selector: ${selectorPath}`);
  console.log('\nNOTE: WAV files are for rough reference only.');
  console.log('Choose winner based on LIVE PHONE TEST, not WAV quality.');
  console.log('========================================');
}

// Run generation
generateProductionGreetingCandidates().catch(console.error);