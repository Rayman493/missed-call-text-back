/**
 * Voicemail Transcription using OpenAI
 * 
 * Downloads Twilio recording audio and transcribes it with OpenAI
 */

import OpenAI from 'openai';

/**
 * Get OpenAI client (lazy initialization to avoid build-time errors)
 */
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Download audio from Twilio recording URL
 */
async function downloadTwilioRecording(recordingUrl: string): Promise<Buffer> {
  console.log('[VOICEMAIL TRANSCRIPTION] Downloading recording from Twilio:', {
    recordingUrl: recordingUrl.substring(0, 50) + '...'
  });

  // Use fetch to download the recording with Twilio credentials
  const response = await fetch(recordingUrl, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN
      ).toString('base64')
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log('[VOICEMAIL TRANSCRIPTION] Recording downloaded:', {
    sizeBytes: arrayBuffer.byteLength,
    sizeKB: (arrayBuffer.byteLength / 1024).toFixed(2)
  });
  
  return Buffer.from(arrayBuffer);
}

/**
 * Transcribe audio buffer using OpenAI Whisper
 */
async function transcribeWithOpenAI(audioBuffer: Buffer): Promise<string> {
  console.log('[VOICEMAIL TRANSCRIPTION] Starting OpenAI transcription:', {
    audioSizeBytes: audioBuffer.length,
    audioSizeKB: (audioBuffer.length / 1024).toFixed(2)
  });

  const openai = getOpenAIClient();

  // Convert Buffer to Uint8Array for Blob
  const uint8Array = new Uint8Array(audioBuffer);
  const blob = new Blob([uint8Array], { type: 'audio/mpeg' });
  const audioFile = new File([blob], 'recording.mp3', { type: 'audio/mpeg' });

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'en',
  });

  console.log('[VOICEMAIL TRANSCRIPTION] OpenAI transcription completed:', {
    transcriptLength: transcription.text.length,
    transcriptPreview: transcription.text.substring(0, 100) + '...'
  });

  return transcription.text;
}

/**
 * Main function: Download recording and transcribe with OpenAI
 */
export async function transcribeVoicemail(
  recordingUrl: string,
  recordingSid: string
): Promise<{ transcript: string; source: 'openai' } | null> {
  try {
    console.log('[VOICEMAIL TRANSCRIPTION] Starting voicemail transcription:', {
      recordingSid,
      recordingUrl: recordingUrl.substring(0, 50) + '...'
    });

    // Download audio from Twilio
    const audioBuffer = await downloadTwilioRecording(recordingUrl);

    if (audioBuffer.length === 0) {
      console.error('[VOICEMAIL TRANSCRIPTION] Downloaded audio is empty');
      return null;
    }

    // Transcribe with OpenAI
    const transcript = await transcribeWithOpenAI(audioBuffer);

    if (!transcript || transcript.trim().length === 0) {
      console.error('[VOICEMAIL TRANSCRIPTION] Transcription result is empty');
      return null;
    }

    console.log('[VOICEMAIL TRANSCRIPTION] Transcription successful:', {
      recordingSid,
      transcriptLength: transcript.length
    });

    return { transcript, source: 'openai' as const };
  } catch (error: any) {
    console.error('[VOICEMAIL TRANSCRIPTION] Error during transcription:', {
      recordingSid,
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}
