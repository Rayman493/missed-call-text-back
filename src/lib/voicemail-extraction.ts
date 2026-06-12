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
  source: 'voicemail' | 'sms'
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
 * Extract structured information from SMS body using LLM
 * Uses OpenAI to extract business-useful information from customer SMS replies
 */
export async function extractFromSmsBody(smsBody: string): Promise<VoicemailExtractionResult> {
  console.log('[SMS EXTRACTION] Starting LLM-based extraction:', {
    smsLength: smsBody.length,
    smsPreview: smsBody.substring(0, 100) + '...'
  });

  if (!smsBody || typeof smsBody !== 'string') {
    return {
      extractedInfo: {},
      confidence: 0,
      source: 'sms',
      extractedAt: new Date().toISOString()
    }
  }

  // Skip very short messages (likely just "thanks", "ok", etc.)
  if (smsBody.trim().length < 10) {
    console.log('[SMS EXTRACTION] Message too short, skipping extraction');
    return {
      extractedInfo: {},
      confidence: 0,
      source: 'sms',
      extractedAt: new Date().toISOString()
    }
  }

  try {
    const openai = getOpenAIClient();

    const systemPrompt = `You are an SMS message analysis assistant. Extract structured information from customer SMS replies for a business.

Rules:
- Extract the ACTUAL service/problem, not conversational filler
- Prefer concise summaries
- Never hallucinate information not present in the message
- Leave unknown values as null
- Ignore greetings, polite language, and acknowledgments (e.g., "thanks", "ok", "sure")
- For "reasonForCalling", capture the core service request (e.g., "Cut my grass", "Air conditioner not working", "Pressure washing estimate")
- For "importantDetails", capture relevant context like timing, specific requirements, or additional context
- For "urgencyLevel", only set if the message explicitly indicates urgency (e.g., "asap", "tomorrow morning", "emergency")

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
        { role: 'user', content: smsBody }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error('[SMS EXTRACTION] No content in response');
      return {
        extractedInfo: {},
        confidence: 0,
        source: 'sms',
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

    console.log('[SMS EXTRACTION] LLM extraction successful:', {
      fieldsExtracted,
      confidence,
      extracted: filteredExtracted
    });

    return {
      extractedInfo: filteredExtracted,
      confidence,
      source: 'sms',
      extractedAt: new Date().toISOString()
    };
  } catch (error: any) {
    console.error('[SMS EXTRACTION] Error during LLM extraction:', error);
    // Fallback to empty result on error
    return {
      extractedInfo: {},
      confidence: 0,
      source: 'sms',
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
 * Safely merge SMS extracted info with existing lead metadata
 * Improves weak/generic voicemail fields when SMS is clearly better
 * Preserves manually corrected fields and completed AI intake
 */
export function safeMergeSmsExtraction(
  existingMetadata: any,
  smsExtraction: VoicemailExtractionResult
): any {
  const metadata = existingMetadata || {}
  const existingExtractedInfo = normalizeExtractedInfo(metadata.extracted_info || {})
  const smsExtractedInfo = smsExtraction.extractedInfo
  const sources = metadata.intake_sources || {}

  // Helper to determine if SMS value is better than existing
  const isSmsBetter = (
    fieldName: keyof VoicemailExtractedInfo,
    smsValue: string | undefined,
    existingValue: string | undefined
  ): boolean => {
    if (!smsValue) return false
    if (!existingValue) return true
    
    // Don't overwrite manually corrected fields
    if (metadata.customer_corrected_info && metadata.corrected_fields) {
      const fieldKeyMap: Record<string, string> = {
        'addressOrLocation': 'address',
        'callbackNumber': 'phone',
        'preferredCallbackTime': 'callback_time',
        'urgencyLevel': 'urgency',
        'importantDetails': 'details',
        'reasonForCalling': 'reason',
        'callerName': 'name'
      }
      const correctedFieldKey = fieldKeyMap[fieldName] || fieldName
      if (metadata.corrected_fields[correctedFieldKey]) {
        return false
      }
    }

    // Don't overwrite completed AI intake
    if (metadata.ai_intake_completed) {
      return false
    }

    // Improve weak/generic voicemail fields
    const weakPatterns = [
      'someone to come out',
      'someone to help',
      'need help',
      'service',
      'call back',
      'callback'
    ]
    
    const existingLower = existingValue.toLowerCase()
    const isWeak = weakPatterns.some(pattern => existingLower.includes(pattern))
    
    if (isWeak && smsValue.length > existingValue.length) {
      return true
    }

    return false
  }

  const mergedExtractedInfo = {
    ...existingExtractedInfo,
    callerName: isSmsBetter('callerName', smsExtractedInfo.callerName, existingExtractedInfo.callerName) 
      ? smsExtractedInfo.callerName 
      : existingExtractedInfo.callerName,
    reasonForCalling: isSmsBetter('reasonForCalling', smsExtractedInfo.reasonForCalling, existingExtractedInfo.reasonForCalling) 
      ? smsExtractedInfo.reasonForCalling 
      : existingExtractedInfo.reasonForCalling,
    importantDetails: isSmsBetter('importantDetails', smsExtractedInfo.importantDetails, existingExtractedInfo.importantDetails) 
      ? smsExtractedInfo.importantDetails 
      : existingExtractedInfo.importantDetails,
    urgencyLevel: isSmsBetter('urgencyLevel', smsExtractedInfo.urgencyLevel, existingExtractedInfo.urgencyLevel) 
      ? smsExtractedInfo.urgencyLevel 
      : existingExtractedInfo.urgencyLevel,
    addressOrLocation: isSmsBetter('addressOrLocation', smsExtractedInfo.addressOrLocation, existingExtractedInfo.addressOrLocation) 
      ? smsExtractedInfo.addressOrLocation 
      : existingExtractedInfo.addressOrLocation,
    preferredCallbackTime: isSmsBetter('preferredCallbackTime', smsExtractedInfo.preferredCallbackTime, existingExtractedInfo.preferredCallbackTime) 
      ? smsExtractedInfo.preferredCallbackTime 
      : existingExtractedInfo.preferredCallbackTime,
    callbackNumber: isSmsBetter('callbackNumber', smsExtractedInfo.callbackNumber, existingExtractedInfo.callbackNumber) 
      ? smsExtractedInfo.callbackNumber 
      : existingExtractedInfo.callbackNumber
  }

  // Update sources for fields that were updated from SMS
  if (smsExtractedInfo.callerName && mergedExtractedInfo.callerName === smsExtractedInfo.callerName) {
    sources.callerName = 'sms'
  }
  if (smsExtractedInfo.reasonForCalling && mergedExtractedInfo.reasonForCalling === smsExtractedInfo.reasonForCalling) {
    sources.reasonForCalling = 'sms'
  }
  if (smsExtractedInfo.importantDetails && mergedExtractedInfo.importantDetails === smsExtractedInfo.importantDetails) {
    sources.importantDetails = 'sms'
  }
  if (smsExtractedInfo.urgencyLevel && mergedExtractedInfo.urgencyLevel === smsExtractedInfo.urgencyLevel) {
    sources.urgencyLevel = 'sms'
  }
  if (smsExtractedInfo.addressOrLocation && mergedExtractedInfo.addressOrLocation === smsExtractedInfo.addressOrLocation) {
    sources.addressOrLocation = 'sms'
  }
  if (smsExtractedInfo.preferredCallbackTime && mergedExtractedInfo.preferredCallbackTime === smsExtractedInfo.preferredCallbackTime) {
    sources.preferredCallbackTime = 'sms'
  }
  if (smsExtractedInfo.callbackNumber && mergedExtractedInfo.callbackNumber === smsExtractedInfo.callbackNumber) {
    sources.callbackNumber = 'sms'
  }

  return {
    ...metadata,
    extracted_info: mergedExtractedInfo,
    intake_sources: sources,
    sms_extraction: {
      extractedAt: smsExtraction.extractedAt,
      confidence: smsExtraction.confidence,
      fieldsExtracted: Object.keys(smsExtractedInfo).filter(k => smsExtractedInfo[k as keyof VoicemailExtractedInfo]).length
    }
  }
}

/**
 * Capitalize words in a string
 */
function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, char => char.toUpperCase())
}
