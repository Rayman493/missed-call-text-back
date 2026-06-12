/**
 * Voicemail Structured Extraction
 * 
 * Extracts structured information from voicemail transcripts using LLM
 * Reuses existing AI intake field mapping and normalization logic
 */

import { normalizeExtractedInfo, CANONICAL_FIELDS } from './ai-field-mapping'
import OpenAI from 'openai'

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

export interface VoicemailExtractedInfo {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
}

export interface VoicemailExtractionResult {
  extractedInfo: VoicemailExtractedInfo
  confidence: number
  source: 'voicemail'
  extractedAt: string
}

/**
 * Extract structured information from voicemail transcript using LLM
 * Uses OpenAI to extract business-useful information
 */
export async function extractFromVoicemailTranscript(transcript: string): Promise<VoicemailExtractionResult> {
  console.log('[VOICEMAIL EXTRACTION] Starting LLM-based extraction:', {
    transcriptLength: transcript.length,
    transcriptPreview: transcript.substring(0, 100) + '...'
  });

  if (!transcript || typeof transcript !== 'string') {
    return {
      extractedInfo: {},
      confidence: 0,
      source: 'voicemail',
      extractedAt: new Date().toISOString()
    }
  }

  try {
    const openai = getOpenAIClient();

    const systemPrompt = `You are a voicemail transcription assistant. Extract structured information from voicemail transcripts for a business.

Rules:
- Extract the ACTUAL service/problem, not conversational filler
- Prefer concise summaries
- Never hallucinate information not present in the transcript
- Leave unknown values as null
- Ignore greetings and polite language
- For "reasonForCalling", capture the core service request (e.g., "Cut my grass", "Air conditioner not working", "Pressure washing estimate")
- For "importantDetails", capture relevant context like timing, specific requirements, or additional context

Return JSON only with these fields:
{
  "callerName": string | null,
  "reasonForCalling": string | null,
  "importantDetails": string | null,
  "urgencyLevel": "high" | "medium" | "low" | null,
  "addressOrLocation": string | null,
  "preferredCallbackTime": string | null,
  "callbackNumber": string | null
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error('[VOICEMAIL EXTRACTION] No content in response');
      return {
        extractedInfo: {},
        confidence: 0,
        source: 'voicemail',
        extractedAt: new Date().toISOString()
      };
    }

    const extracted = JSON.parse(content) as VoicemailExtractedInfo;
    
    // Filter out null/undefined values
    const filteredExtracted: VoicemailExtractedInfo = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value && typeof value === 'string' && value.trim().length > 0) {
        filteredExtracted[key as keyof VoicemailExtractedInfo] = value.trim();
      }
    }

    // Calculate confidence based on number of fields extracted
    const fieldsExtracted = Object.keys(filteredExtracted).length;
    const confidence = fieldsExtracted > 0 ? Math.min(1, 0.2 + (fieldsExtracted * 0.15)) : 0;

    console.log('[VOICEMAIL EXTRACTION] LLM extraction successful:', {
      fieldsExtracted,
      confidence,
      extracted: filteredExtracted
    });

    return {
      extractedInfo: filteredExtracted,
      confidence,
      source: 'voicemail',
      extractedAt: new Date().toISOString()
    };
  } catch (error: any) {
    console.error('[VOICEMAIL EXTRACTION] Error during LLM extraction:', error);
    // Fallback to empty result on error
    return {
      extractedInfo: {},
      confidence: 0,
      source: 'voicemail',
      extractedAt: new Date().toISOString()
    };
  }
}

/**
 * Safely merge voicemail extracted info with existing lead metadata
 * Preserves high-confidence existing data and user corrections
 */
export function safeMergeVoicemailExtraction(
  existingMetadata: any,
  voicemailExtraction: VoicemailExtractionResult
): any {
  const metadata = existingMetadata || {}
  const existingExtractedInfo = normalizeExtractedInfo(metadata.extracted_info || {})
  const voicemailExtractedInfo = voicemailExtraction.extractedInfo

  // Track sources for each field
  const sources = metadata.intake_sources || {}

  // Helper to safely merge a field
  const mergeField = (
    fieldName: keyof VoicemailExtractedInfo,
    voicemailValue: string | undefined,
    existingValue: string | undefined
  ) => {
    // Only populate if:
    // 1. Voicemail has a value
    // 2. Existing field is empty OR voicemail confidence is high
    if (voicemailValue && (!existingValue || voicemailExtraction.confidence > 0.5)) {
      return voicemailValue
    }
    return existingValue
  }

  const mergedExtractedInfo = {
    ...existingExtractedInfo,
    callerName: mergeField('callerName', voicemailExtractedInfo.callerName, existingExtractedInfo.callerName),
    reasonForCalling: mergeField('reasonForCalling', voicemailExtractedInfo.reasonForCalling, existingExtractedInfo.reasonForCalling),
    importantDetails: mergeField('importantDetails', voicemailExtractedInfo.importantDetails, existingExtractedInfo.importantDetails),
    urgencyLevel: mergeField('urgencyLevel', voicemailExtractedInfo.urgencyLevel, existingExtractedInfo.urgencyLevel),
    addressOrLocation: mergeField('addressOrLocation', voicemailExtractedInfo.addressOrLocation, existingExtractedInfo.addressOrLocation),
    preferredCallbackTime: mergeField('preferredCallbackTime', voicemailExtractedInfo.preferredCallbackTime, existingExtractedInfo.preferredCallbackTime),
    callbackNumber: mergeField('callbackNumber', voicemailExtractedInfo.callbackNumber, existingExtractedInfo.callbackNumber)
  }

  // Update sources for fields that were updated from voicemail
  if (voicemailExtractedInfo.callerName && mergedExtractedInfo.callerName === voicemailExtractedInfo.callerName) {
    sources.callerName = 'voicemail'
  }
  if (voicemailExtractedInfo.reasonForCalling && mergedExtractedInfo.reasonForCalling === voicemailExtractedInfo.reasonForCalling) {
    sources.reasonForCalling = 'voicemail'
  }
  if (voicemailExtractedInfo.importantDetails && mergedExtractedInfo.importantDetails === voicemailExtractedInfo.importantDetails) {
    sources.importantDetails = 'voicemail'
  }
  if (voicemailExtractedInfo.urgencyLevel && mergedExtractedInfo.urgencyLevel === voicemailExtractedInfo.urgencyLevel) {
    sources.urgencyLevel = 'voicemail'
  }
  if (voicemailExtractedInfo.addressOrLocation && mergedExtractedInfo.addressOrLocation === voicemailExtractedInfo.addressOrLocation) {
    sources.addressOrLocation = 'voicemail'
  }
  if (voicemailExtractedInfo.preferredCallbackTime && mergedExtractedInfo.preferredCallbackTime === voicemailExtractedInfo.preferredCallbackTime) {
    sources.preferredCallbackTime = 'voicemail'
  }
  if (voicemailExtractedInfo.callbackNumber && mergedExtractedInfo.callbackNumber === voicemailExtractedInfo.callbackNumber) {
    sources.callbackNumber = 'voicemail'
  }

  return {
    ...metadata,
    extracted_info: mergedExtractedInfo,
    intake_sources: sources,
    voicemail_extraction: {
      extractedAt: voicemailExtraction.extractedAt,
      confidence: voicemailExtraction.confidence,
      fieldsExtracted: Object.keys(voicemailExtractedInfo).filter(k => voicemailExtractedInfo[k as keyof VoicemailExtractedInfo]).length
    }
  }
}

/**
 * Capitalize words in a string
 */
function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, char => char.toUpperCase())
}
