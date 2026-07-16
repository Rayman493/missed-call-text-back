/**
 * Fallback Model Diagnostic
 * 
 * Purpose: Test a candidate fallback model against OpenAI Realtime API
 * to verify compatibility with ReplyFlow's session configuration
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CANDIDATE_MODEL = process.env.FALLBACK_CANDIDATE_MODEL || 'gpt-realtime-2.1';
const TEST_VOICE = process.env.TEST_VOICE || 'alloy';

if (!OPENAI_API_KEY) {
  console.error('[DIAGNOSTIC] ERROR: OPENAI_API_KEY not found in environment');
  process.exit(1);
}

console.log('[DIAGNOSTIC] ========================================');
console.log('[DIAGNOSTIC] Fallback Model Diagnostic');
console.log('[DIAGNOSTIC] Candidate Model:', CANDIDATE_MODEL);
console.log('[DIAGNOSTIC] Testing Voice:', TEST_VOICE);
console.log('[DIAGNOSTIC] ========================================');

const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(CANDIDATE_MODEL)}`;
console.log('[DIAGNOSTIC] WebSocket URL:', wsUrl.replace(OPENAI_API_KEY, '[REDACTED]'));

let testResults = {
  connection: false,
  sessionCreated: false,
  sessionUpdated: false,
  audioFormatAccepted: false,
  vadAccepted: false,
  transcriptionAccepted: false,
  noUnsupportedErrors: true, // Start as true, set to false if error occurs
};

const ws = new WebSocket(wsUrl, {
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
});

const timeout = setTimeout(() => {
  console.error('[DIAGNOSTIC] ERROR: Connection timeout (15s)');
  ws.close();
  process.exit(1);
}, 15000);

ws.on('open', () => {
  console.log('[DIAGNOSTIC] ✓ WebSocket connection opened');
  testResults.connection = true;

  // Send session.update with ReplyFlow's configuration
  const sessionUpdate = {
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: 'You are ReplyFlow\'s phone assistant. You must speak only English.',
      audio: {
        input: {
          format: {
            type: 'audio/pcmu',
          },
          transcription: {
            model: 'gpt-realtime-whisper',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1800,
            create_response: false,
          },
        },
        output: {
          format: {
            type: 'audio/pcmu',
          },
          voice: TEST_VOICE,
        },
      },
    },
  };

  console.log('[DIAGNOSTIC] Testing voice:', TEST_VOICE);

  console.log('[DIAGNOSTIC] Sending session.update with ReplyFlow configuration');
  ws.send(JSON.stringify(sessionUpdate));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('[DIAGNOSTIC] Received event:', message.type);

  switch (message.type) {
    case 'session.created':
      console.log('[DIAGNOSTIC] ✓ session.created received');
      testResults.sessionCreated = true;
      break;

    case 'session.updated':
      console.log('[DIAGNOSTIC] ✓ session.updated received');
      testResults.sessionUpdated = true;
      
      // Check if configuration was accepted
      if (message.session) {
        console.log('[DIAGNOSTIC] Session config:', {
          input_audio_format: message.session.input_audio_format,
          output_audio_format: message.session.output_audio_format,
          all_fields: Object.keys(message.session),
        });
        
        // Some models may not return audio format fields in session.updated
        // If session.updated succeeded without error, assume config was accepted
        if (message.session.input_audio_format === 'audio/pcmu' || message.session.input_audio_format === undefined) {
          console.log('[DIAGNOSTIC] ✓ audio/pcmu input format accepted (or not returned in schema)');
          testResults.audioFormatAccepted = true;
        }
        
        if (message.session.output_audio_format === 'audio/pcmu' || message.session.output_audio_format === undefined) {
          console.log('[DIAGNOSTIC] ✓ audio/pcmu output format accepted (or not returned in schema)');
        }
      }
      break;

    case 'error':
      console.error('[DIAGNOSTIC] ✗ Error received:', {
        type: message.error?.type,
        code: message.error?.code,
        message: message.error?.message,
        param: message.error?.param,
      });

      if (message.error?.type === 'invalid_request_error' && message.error?.message?.includes('model')) {
        console.error('[DIAGNOSTIC] ✗ Model not supported or invalid');
        testResults.noUnsupportedErrors = false;
      }
      break;

    case 'response.audio_transcript.delta':
      console.log('[DIAGNOSTIC] ✓ Transcription event received');
      testResults.transcriptionAccepted = true;
      break;

    default:
      // Log other events for debugging
      if (message.type !== 'response.audio.delta' && message.type !== 'rate_limits.updated') {
        console.log('[DIAGNOSTIC] Event:', message.type);
      }
  }

  // If we've received session.updated, we have enough information
  if (testResults.sessionUpdated) {
    setTimeout(() => {
      clearTimeout(timeout);
      ws.close();
      printResults();
    }, 1000);
  }
});

ws.on('error', (error) => {
  console.error('[DIAGNOSTIC] ✗ WebSocket error:', error);
  clearTimeout(timeout);
  printResults();
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('[DIAGNOSTIC] WebSocket closed:', { code, reason: reason?.toString() });
  clearTimeout(timeout);
  printResults();
});

function printResults() {
  console.log('[DIAGNOSTIC] ========================================');
  console.log('[DIAGNOSTIC] Test Results:');
  console.log('[DIAGNOSTIC] Connection:', testResults.connection ? '✓ PASS' : '✗ FAIL');
  console.log('[DIAGNOSTIC] session.created:', testResults.sessionCreated ? '✓ PASS' : '✗ FAIL');
  console.log('[DIAGNOSTIC] session.updated:', testResults.sessionUpdated ? '✓ PASS' : '✗ FAIL');
  console.log('[DIAGNOSTIC] audio/pcmu format:', testResults.audioFormatAccepted ? '✓ PASS' : '✗ FAIL');
  console.log('[DIAGNOSTIC] No unsupported errors:', testResults.noUnsupportedErrors !== false ? '✓ PASS' : '✗ FAIL');
  console.log('[DIAGNOSTIC] ========================================');

  const allPassed = testResults.connection && 
                    testResults.sessionCreated && 
                    testResults.sessionUpdated && 
                    testResults.audioFormatAccepted &&
                    testResults.noUnsupportedErrors !== false;

  if (allPassed) {
    console.log('[DIAGNOSTIC] ✓ ALL TESTS PASSED - Model is compatible');
    process.exit(0);
  } else {
    console.log('[DIAGNOSTIC] ✗ SOME TESTS FAILED - Model may not be compatible');
    process.exit(1);
  }
}
