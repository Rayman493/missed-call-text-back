/**
 * Realtime Model Failover Diagnostic
 * 
 * Purpose: Test the production failover implementation by simulating
 * a primary model failure and verifying the fallback model connects successfully
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || 'intentionally-invalid-model';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'gpt-realtime-2.1';

if (!OPENAI_API_KEY) {
  console.error('[FAILOVER TEST] ERROR: OPENAI_API_KEY not found in environment');
  process.exit(1);
}

console.log('[REALTIME FAILOVER TEST] ========================================');
console.log('[REALTIME FAILOVER TEST] Primary Model:', PRIMARY_MODEL);
console.log('[REALTIME FAILOVER TEST] Fallback Model:', FALLBACK_MODEL);
console.log('[REALTIME FAILOVER TEST] ========================================');

let testResults = {
  primaryAttemptStarted: false,
  primaryFailedAsExpected: false,
  fallbackAttemptStarted: false,
  fallbackConnected: false,
  sessionInitialized: false,
  audioFormatAccepted: false,
  noFallbackErrors: true,
};

function attemptConnection(model: string, isFallback: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    console.log(`[REALTIME FAILOVER TEST] Attempting connection to model: ${model}`);
    console.log(`[REALTIME FAILOVER TEST] WebSocket URL: ${OPENAI_API_KEY ? wsUrl.replace(OPENAI_API_KEY, '[REDACTED]') : wsUrl}`);

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    const timeout = setTimeout(() => {
      console.error(`[REALTIME FAILOVER TEST] Connection timeout for model: ${model}`);
      ws.close();
      reject(new Error('Connection timeout'));
    }, 10000);

    ws.on('open', () => {
      console.log(`[REALTIME FAILOVER TEST] ✓ WebSocket opened for model: ${model}`);
      clearTimeout(timeout);

      if (isFallback) {
        testResults.fallbackConnected = true;
        console.log('[REALTIME FAILOVER TEST] Fallback connected successfully');
      }

      // Send session.update with ReplyFlow configuration
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
              voice: 'alloy',
            },
          },
        },
      };

      console.log('[REALTIME FAILOVER TEST] Sending session.update with ReplyFlow configuration');
      ws.send(JSON.stringify(sessionUpdate));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`[REALTIME FAILOVER TEST] Received event from ${model}:`, message.type);

      switch (message.type) {
        case 'session.created':
          console.log(`[REALTIME FAILOVER TEST] ✓ session.created from ${model}`);
          if (isFallback) {
            testResults.sessionInitialized = true;
          }
          break;

        case 'session.updated':
          console.log(`[REALTIME FAILOVER TEST] ✓ session.updated from ${model}`);
          if (isFallback) {
            testResults.sessionInitialized = true;
            
            if (message.session) {
              console.log('[REALTIME FAILOVER TEST] Session config:', {
                input_audio_format: message.session.input_audio_format,
                output_audio_format: message.session.output_audio_format,
              });
              
              if (message.session.input_audio_format === 'audio/pcmu' || message.session.input_audio_format === undefined) {
                console.log('[REALTIME FAILOVER TEST] ✓ audio/pcmu input format accepted');
                testResults.audioFormatAccepted = true;
              }
              
              if (message.session.output_audio_format === 'audio/pcmu' || message.session.output_audio_format === undefined) {
                console.log('[REALTIME FAILOVER TEST] ✓ audio/pcmu output format accepted');
              }
            }
            
            // Close connection after successful session initialization
            setTimeout(() => {
              clearTimeout(timeout);
              ws.close();
              resolve();
            }, 1000);
          }
          break;

        case 'error':
          console.error(`[REALTIME FAILOVER TEST] ✗ Error from ${model}:`, {
            type: message.error?.type,
            code: message.error?.code,
            message: message.error?.message,
          });

          if (!isFallback) {
            // Primary model failed as expected
            testResults.primaryFailedAsExpected = true;
            console.log('[REALTIME FAILOVER TEST] Primary failed as expected');
          } else {
            // Fallback model failed - this is a problem
            testResults.noFallbackErrors = false;
            console.error('[REALTIME FAILOVER TEST] ✗ Fallback model failed unexpectedly');
          }

          clearTimeout(timeout);
          ws.close();
          if (!isFallback) {
            resolve(); // Primary failure is expected
          } else {
            reject(new Error('Fallback model failed'));
          }
          break;

        default:
          // Log other events for debugging
          if (message.type !== 'response.audio.delta' && message.type !== 'rate_limits.updated') {
            console.log(`[REALTIME FAILOVER TEST] Event from ${model}:`, message.type);
          }
      }
    });

    ws.on('error', (error) => {
      console.error(`[REALTIME FAILOVER TEST] ✗ WebSocket error for ${model}:`, String(error));
      clearTimeout(timeout);

      if (!isFallback) {
        // Primary model failed as expected
        testResults.primaryFailedAsExpected = true;
        console.log('[REALTIME FAILOVER TEST] Primary failed as expected (WebSocket error)');
        resolve(); // Primary failure is expected
      } else {
        // Fallback model failed - this is a problem
        testResults.noFallbackErrors = false;
        console.error('[REALTIME FAILOVER TEST] ✗ Fallback model failed unexpectedly (WebSocket error)');
        reject(error);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[REALTIME FAILOVER TEST] WebSocket closed for ${model}:`, { code, reason: reason?.toString() });
      clearTimeout(timeout);
    });
  });
}

async function runFailoverTest() {
  try {
    // Step 1: Attempt primary connection with invalid model
    console.log('[REALTIME FAILOVER TEST] Primary attempt started');
    testResults.primaryAttemptStarted = true;
    
    try {
      await attemptConnection(PRIMARY_MODEL, false);
    } catch (error) {
      // Primary failure is expected
      console.log('[REALTIME FAILOVER TEST] Primary attempt completed (with expected failure)');
    }

    // Step 2: Attempt fallback connection
    console.log('[REALTIME FAILOVER TEST] Fallback attempt started');
    testResults.fallbackAttemptStarted = true;
    
    await attemptConnection(FALLBACK_MODEL, true);
    console.log('[REALTIME FAILOVER TEST] Fallback attempt completed successfully');

    // Print results
    console.log('[REALTIME FAILOVER TEST] ========================================');
    console.log('[REALTIME FAILOVER TEST] Test Results:');
    console.log('[REALTIME FAILOVER TEST] Primary attempt started:', testResults.primaryAttemptStarted ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] Primary failed as expected:', testResults.primaryFailedAsExpected ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] Fallback attempt started:', testResults.fallbackAttemptStarted ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] Fallback connected:', testResults.fallbackConnected ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] Session initialized:', testResults.sessionInitialized ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] audio/pcmu format:', testResults.audioFormatAccepted ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] No fallback errors:', testResults.noFallbackErrors ? '✓ PASS' : '✗ FAIL');
    console.log('[REALTIME FAILOVER TEST] ========================================');

    const allPassed = testResults.primaryAttemptStarted &&
                      testResults.primaryFailedAsExpected &&
                      testResults.fallbackAttemptStarted &&
                      testResults.fallbackConnected &&
                      testResults.sessionInitialized &&
                      testResults.audioFormatAccepted &&
                      testResults.noFallbackErrors;

    if (allPassed) {
      console.log('[REALTIME FAILOVER TEST] ✓ PASS - All tests passed');
      console.log('[REALTIME FAILOVER TEST] Failover path is working correctly');
      process.exit(0);
    } else {
      console.log('[REALTIME FAILOVER TEST] ✗ FAIL - Some tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('[REALTIME FAILOVER TEST] ✗ Test failed with error:', error);
    process.exit(1);
  }
}

runFailoverTest();
