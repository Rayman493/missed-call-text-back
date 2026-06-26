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
  desiredCompletionTime?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
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

CRITICAL: Write all extracted fields like an office receptionist entering notes into a CRM. A business owner should understand the job in 2 seconds.

General Rules:
- Write like a CRM note, not a transcript
- Never preserve conversational wording
- Never preserve sentence structure
- Rewrite into concise professional phrases
- Prefer noun phrases over sentences
- Each extracted field must be a clean standalone CRM value. Do not preserve the customer's sentence structure. Do not output sentence fragments copied from the transcript. Rewrite into concise business-ready notes while preserving meaning.
- Remove ALL filler words unless they materially change meaning: yeah, yep, yes, ok, okay, sure, uh, um, like, you know, alright
- Remove ALL first-person wording: I, my, me, we, us
- Remove ALL hedge words unless they materially change meaning: maybe, probably, I guess, I think, sort of, kind of, just, actually, basically, well
- Remove unnecessary verbs whenever possible
- Keep every field extremely scannable (1-5 words when possible)
- Preserve meaning, not wording
- Never hallucinate information not present in the transcript
- Leave unknown values as null
- Ignore greetings and polite language
- Do NOT over-summarize or infer missing information
- Do NOT embellish or rewrite into marketing language

Field-Specific Rules:

reasonForCalling: Normalize into concise business terminology as a noun phrase. This is the high-level service requested.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Need bushes trimmed" → "Bush trimming"
- "Need mulch put down" → "Mulch installation"
- "Need AC looked at" → "Air conditioner inspection"
- "Need someone to look at my AC" → "Air conditioner inspection"
- "Need someone to clean my house" → "House cleaning"
- "Yeah I need my plumbing fixed" → "Plumbing repair"
- "Need my AC fixed" → "Air conditioner repair"
- "Need my sink fixed" → "Sink repair"
- "The plumbing in the walls of my basement is leaking" → "Basement wall plumbing leak"
- "My AC isn't cooling" → "AC repair"
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Keep factual information only, avoid conversational wording. This field should contain supporting facts about the job (size, condition, urgency, access instructions, special circumstances, etc.). Do NOT repeat the service requested in the Details field unless the customer provides meaningful new information. If the customer only repeats the service without adding anything new, leave this field empty.
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "Three-quarter acre lawn."
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting."
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Yard is overgrown."

desiredCompletionTime: Normalize naturally, keep customer's intent
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it." → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"

preferredCallbackTime: Normalize into concise values
- "Morning" → "Morning"
- "Afternoon" → "Afternoon"
- "Evening" → "Evening"
- "After 5 PM" → "After 5 PM"
- "Weekdays" → "Weekdays"
- "Anytime" → "Anytime"
- "Probably in the mornings" → "Morning"
- "I guess probably in the morning." → "Morning"
- "Sometime in the mornings" → "Morning"
- "After 5 PM works best" → "After 5 PM"
- "Probably after five if possible." → "After 5 PM"
- "Tomorrow morning" → "Tomorrow morning"

addressOrLocation: Return only the service location, remove unnecessary conversation
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"

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

    // Clean up extracted text with lightweight local cleanup
    const cleanedExtracted = cleanExtractedInfo(filteredExtracted);

    // Calculate confidence based on number of fields extracted
    const fieldsExtracted = Object.keys(cleanedExtracted).length;
    const confidence = fieldsExtracted > 0 ? Math.min(1, 0.2 + (fieldsExtracted * 0.15)) : 0;

    console.log('[VOICEMAIL EXTRACTION] LLM extraction successful:', {
      fieldsExtracted,
      confidence,
      extracted: cleanedExtracted
    });

    return {
      extractedInfo: cleanedExtracted,
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
 * Intelligently merge SMS correction with existing extraction using LLM
 * Preserves context while applying corrections
 */
export async function intelligentCorrectionMerge(
  existingExtractedInfo: VoicemailExtractedInfo,
  smsBody: string,
  smsExtractedInfo: VoicemailExtractedInfo
): Promise<VoicemailExtractedInfo> {
  console.log('[INTELLIGENT CORRECTION MERGE] Starting LLM-based merge', {
    existingInfo: existingExtractedInfo,
    smsBody: smsBody.substring(0, 100),
    smsExtractedInfo
  })

  try {
    const openai = getOpenAIClient()

    const systemPrompt = `You are a customer information correction assistant. A customer sent an SMS to correct or clarify their previous voicemail.

CRITICAL: Write all extracted fields like an office receptionist entering notes into a CRM. A business owner should understand the job in 2 seconds.

General Rules:
- Write like a CRM note, not a transcript
- Never preserve conversational wording
- Never preserve sentence structure
- Rewrite into concise professional phrases
- Prefer noun phrases over sentences
- Each extracted field must be a clean standalone CRM value. Do not preserve the customer's sentence structure. Do not output sentence fragments copied from the transcript. Rewrite into concise business-ready notes while preserving meaning.
- Remove ALL filler words unless they materially change meaning: yeah, yep, yes, ok, okay, sure, uh, um, like, you know, alright
- Remove ALL first-person wording: I, my, me, we, us
- Remove ALL hedge words unless they materially change meaning: maybe, probably, I guess, I think, sort of, kind of, just, actually, basically, well
- Remove unnecessary verbs whenever possible
- Keep every field extremely scannable (1-5 words when possible)
- Preserve meaning, not wording
- Do NOT over-summarize or infer missing information
- Do NOT embellish or rewrite into marketing language

Field-Specific Rules:

reasonForCalling: Normalize into concise business terminology as a noun phrase. This is the high-level service requested.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Need bushes trimmed" → "Bush trimming"
- "Need mulch put down" → "Mulch installation"
- "Need AC looked at" → "Air conditioner inspection"
- "Need someone to look at my AC" → "Air conditioner inspection"
- "Need someone to clean my house" → "House cleaning"
- "Yeah I need my plumbing fixed" → "Plumbing repair"
- "Need my AC fixed" → "Air conditioner repair"
- "Need my sink fixed" → "Sink repair"
- "The plumbing in the walls of my basement is leaking" → "Basement wall plumbing leak"
- "My AC isn't cooling" → "AC repair"
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Keep factual information only, avoid conversational wording. This field should contain supporting facts about the job (size, condition, urgency, access instructions, special circumstances, etc.). Do NOT repeat the service requested in the Details field unless the customer provides meaningful new information. If the customer only repeats the service without adding anything new, leave this field empty.
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "Three-quarter acre lawn."
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting."
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Yard is overgrown."

desiredCompletionTime: Normalize naturally, keep customer's intent
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it." → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"

preferredCallbackTime: Normalize into concise values
- "Morning" → "Morning"
- "Afternoon" → "Afternoon"
- "Evening" → "Evening"
- "After 5 PM" → "After 5 PM"
- "Weekdays" → "Weekdays"
- "Anytime" → "Anytime"
- "Probably in the mornings" → "Morning"
- "I guess probably in the morning." → "Morning"
- "Sometime in the mornings" → "Morning"
- "After 5 PM works best" → "After 5 PM"
- "Probably after five if possible." → "After 5 PM"
- "Tomorrow morning" → "Tomorrow morning"

addressOrLocation: Return only the service location, remove unnecessary conversation
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"

Your task:
- Update ONLY the fields that the customer is correcting
- PRESERVE unrelated metadata: callerName, callbackNumber, addressOrLocation, urgencyLevel, preferredCallbackTime
- If the customer changes the requested service (e.g., "shower" to "toilet", "lawn mowing" to "flower planting"):
  * Regenerate reasonForCalling to be specific (e.g., "Toilet installation" not "Toilet issue")
  * CRITICAL: Re-evaluate importantDetails in the context of the NEW service
  * If old details are specific to the old service (e.g., "shower is leaking" when now it's a toilet), CLEAR importantDetails instead of preserving stale info
  * If details are still relevant (e.g., "upstairs bathroom"), preserve them
  * If no valid details remain after re-evaluation, set importantDetails to null
- If the customer only adds clarification without changing the service (e.g., "it's the upstairs bathroom"):
  * Enrich importantDetails with the new context
  * Preserve existing details that are still relevant
- NEVER fabricate details. It is better to leave importantDetails empty than to display contradictory information.
- If a field wasn't mentioned in the SMS and is not service-specific, keep the original value

Return JSON only with these fields:
{
  "callerName": string | null,
  "reasonForCalling": string | null,
  "importantDetails": string | null,
  "urgencyLevel": "high" | "medium" | "low" | null,
  "addressOrLocation": string | null,
  "preferredCallbackTime": string | null,
  "callbackNumber": string | null
}`

    const userPrompt = `Original voicemail extraction:
${JSON.stringify(existingExtractedInfo, null, 2)}

Customer SMS correction:
"${smsBody}"

SMS extraction:
${JSON.stringify(smsExtractedInfo, null, 2)}

Please merge these, preserving all original information and only updating what the customer is correcting.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = response.choices[0].message.content
    if (!content) {
      console.error('[INTELLIGENT CORRECTION MERGE] No content in response')
      return existingExtractedInfo
    }

    const merged = JSON.parse(content) as VoicemailExtractedInfo

    // Clean up merged text with lightweight local cleanup
    const cleanedMerged = cleanExtractedInfo(merged)

    console.log('[INTELLIGENT CORRECTION MERGE] LLM merge successful:', {
      merged: cleanedMerged,
      fieldsChanged: Object.keys(cleanedMerged).filter(key => cleanedMerged[key as keyof VoicemailExtractedInfo] !== existingExtractedInfo[key as keyof VoicemailExtractedInfo])
    })

    return cleanedMerged
  } catch (error: any) {
    console.error('[INTELLIGENT CORRECTION MERGE] Error during LLM merge:', error)
    // Fallback to existing extraction on error
    return existingExtractedInfo
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

CRITICAL: Write all extracted fields like an office receptionist entering notes into a CRM. A business owner should understand the job in 2 seconds.

General Rules:
- Write like a CRM note, not a transcript
- Never preserve conversational wording
- Never preserve sentence structure
- Rewrite into concise professional phrases
- Prefer noun phrases over sentences
- Each extracted field must be a clean standalone CRM value. Do not preserve the customer's sentence structure. Do not output sentence fragments copied from the transcript. Rewrite into concise business-ready notes while preserving meaning.
- Remove ALL filler words unless they materially change meaning: yeah, yep, yes, ok, okay, sure, uh, um, like, you know, alright
- Remove ALL first-person wording: I, my, me, we, us
- Remove ALL hedge words unless they materially change meaning: maybe, probably, I guess, I think, sort of, kind of, just, actually, basically, well
- Remove unnecessary verbs whenever possible
- Keep every field extremely scannable (1-5 words when possible)
- Preserve meaning, not wording
- Never hallucinate information not present in the message
- Leave unknown values as null
- Ignore greetings, polite language, and acknowledgments (e.g., "thanks", "ok", "sure")
- Do NOT over-summarize or infer missing information
- Do NOT embellish or rewrite into marketing language

Field-Specific Rules:

reasonForCalling: Normalize into concise business terminology as a noun phrase. This is the high-level service requested.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Need bushes trimmed" → "Bush trimming"
- "Need mulch put down" → "Mulch installation"
- "Need AC looked at" → "Air conditioner inspection"
- "Need someone to look at my AC" → "Air conditioner inspection"
- "Need someone to clean my house" → "House cleaning"
- "Yeah I need my plumbing fixed" → "Plumbing repair"
- "Need my AC fixed" → "Air conditioner repair"
- "Need my sink fixed" → "Sink repair"
- "The plumbing in the walls of my basement is leaking" → "Basement wall plumbing leak"
- "My AC isn't cooling" → "AC repair"
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Keep factual information only, avoid conversational wording. This field should contain supporting facts about the job (size, condition, urgency, access instructions, special circumstances, etc.). Do NOT repeat the service requested in the Details field unless the customer provides meaningful new information. If the customer only repeats the service without adding anything new, leave this field empty.
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "Three-quarter acre lawn."
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting."
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Yard is overgrown."

desiredCompletionTime: Normalize naturally, keep customer's intent
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it." → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"

preferredCallbackTime: Normalize into concise values
- "Morning" → "Morning"
- "Afternoon" → "Afternoon"
- "Evening" → "Evening"
- "After 5 PM" → "After 5 PM"
- "Weekdays" → "Weekdays"
- "Anytime" → "Anytime"
- "Probably in the mornings" → "Morning"
- "I guess probably in the morning." → "Morning"
- "Sometime in the mornings" → "Morning"
- "After 5 PM works best" → "After 5 PM"
- "Probably after five if possible." → "After 5 PM"
- "Tomorrow morning" → "Tomorrow morning"

addressOrLocation: Return only the service location, remove unnecessary conversation
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"
- "My business at 123 Main Street" → "123 Main Street"

For "urgencyLevel", only set if the message explicitly indicates urgency (e.g., "asap", "tomorrow morning", "emergency")

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

    // Clean up extracted text with lightweight local cleanup
    const cleanedExtracted = cleanExtractedInfo(filteredExtracted);

    // Calculate confidence based on number of fields extracted
    const fieldsExtracted = Object.keys(cleanedExtracted).length;
    const confidence = fieldsExtracted > 0 ? Math.min(1, 0.2 + (fieldsExtracted * 0.15)) : 0;

    console.log('[SMS EXTRACTION] LLM extraction successful:', {
      fieldsExtracted,
      confidence,
      extracted: cleanedExtracted
    });

    return {
      extractedInfo: cleanedExtracted,
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
    desiredCompletionTime: mergeField('desiredCompletionTime', voicemailExtractedInfo.desiredCompletionTime, existingExtractedInfo.desiredCompletionTime),
    addressOrLocation: mergeField('addressOrLocation', voicemailExtractedInfo.addressOrLocation, existingExtractedInfo.addressOrLocation),
    preferredCallbackTime: mergeField('preferredCallbackTime', voicemailExtractedInfo.preferredCallbackTime, existingExtractedInfo.preferredCallbackTime)
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
  if (voicemailExtractedInfo.desiredCompletionTime && mergedExtractedInfo.desiredCompletionTime === voicemailExtractedInfo.desiredCompletionTime) {
    sources.desiredCompletionTime = 'voicemail'
  }
  if (voicemailExtractedInfo.addressOrLocation && mergedExtractedInfo.addressOrLocation === voicemailExtractedInfo.addressOrLocation) {
    sources.addressOrLocation = 'voicemail'
  }
  if (voicemailExtractedInfo.preferredCallbackTime && mergedExtractedInfo.preferredCallbackTime === voicemailExtractedInfo.preferredCallbackTime) {
    sources.preferredCallbackTime = 'voicemail'
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
export async function safeMergeSmsExtraction(
  existingMetadata: any,
  smsExtraction: VoicemailExtractionResult,
  originalSmsBody?: string
): Promise<any> {
  console.log('[SMS MERGE START]', {
    hasExistingMetadata: !!existingMetadata,
    hasExtractedInfo: !!existingMetadata?.extracted_info,
    hasIntakeSources: !!existingMetadata?.intake_sources,
    smsExtractionSource: smsExtraction.source,
    smsConfidence: smsExtraction.confidence,
    smsExtractedInfo: smsExtraction.extractedInfo,
    originalSmsBody: originalSmsBody?.substring(0, 100) + '...'
  })

  const metadata = existingMetadata || {}
  const existingExtractedInfo = normalizeExtractedInfo(metadata.extracted_info || {})
  const smsExtractedInfo = smsExtraction.extractedInfo
  const sources = metadata.intake_sources || {}

  console.log('[SMS MERGE] Existing extracted info:', existingExtractedInfo)
  console.log('[SMS MERGE] SMS extracted info:', smsExtractedInfo)

  // Detect correction phrases in the original SMS body
  const correctionPhrases = [
    'actually',
    'i meant',
    'meant',
    'instead',
    'change',
    'changed',
    'never mind',
    'rather',
    'not that',
    'wait',
    'no, it\'s',
    'no its',
    'change that to',
    'it\'s a',
    'its a',
    'just to clarify',
    'correction',
    'i need',
    'rather than',
    'not',
    'sorry',
    'wrong'
  ]
  const smsBodyLower = originalSmsBody?.toLowerCase() || ''
  const detectedCorrectionPhrase = correctionPhrases.find(phrase => smsBodyLower.includes(phrase))
  const hasCorrectionIntent = !!detectedCorrectionPhrase

  console.log('[SMS MERGE] Correction intent detection', {
    hasCorrectionIntent,
    detectedCorrectionPhrase,
    smsBodyPreview: originalSmsBody?.substring(0, 100)
  })

  // If correction intent is detected, use intelligent LLM-based merge
  if (hasCorrectionIntent && originalSmsBody) {
    console.log('[SMS MERGE] Using intelligent correction merge')
    const intelligentlyMerged = await intelligentCorrectionMerge(
      existingExtractedInfo,
      originalSmsBody,
      smsExtractedInfo
    )

    // Log what was preserved vs updated
    const fieldsPreserved: string[] = []
    const fieldsUpdated: string[] = []

    // Track correction metadata
    const fieldCorrections: Record<string, { from: string; to: string; source: string; correctedAt: string }> = {}
    const existingCorrections = metadata.field_corrections || {}

    for (const key of Object.keys(existingExtractedInfo) as (keyof VoicemailExtractedInfo)[]) {
      if (intelligentlyMerged[key] === existingExtractedInfo[key]) {
        fieldsPreserved.push(key)
      } else {
        fieldsUpdated.push(key)
        // Record correction metadata only if there was an actual value change
        if (existingExtractedInfo[key] && intelligentlyMerged[key] && existingExtractedInfo[key] !== intelligentlyMerged[key]) {
          fieldCorrections[key] = {
            from: existingExtractedInfo[key]!,
            to: intelligentlyMerged[key]!,
            source: 'sms',
            correctedAt: new Date().toISOString()
          }
        }
      }
    }

    console.log('[SMS MERGE] Intelligent merge results', {
      fieldsPreserved,
      fieldsUpdated,
      original: existingExtractedInfo,
      merged: intelligentlyMerged,
      fieldCorrections
    })

    // Update sources for fields that were updated
    for (const key of fieldsUpdated as (keyof VoicemailExtractedInfo)[]) {
      if (intelligentlyMerged[key]) {
        sources[key] = 'sms'
      }
    }

    const result = {
      ...metadata,
      extracted_info: intelligentlyMerged,
      intake_sources: sources,
      sms_extraction: {
        extractedAt: smsExtraction.extractedAt,
        confidence: smsExtraction.confidence,
        fieldsExtracted: Object.keys(smsExtractedInfo).filter(k => smsExtractedInfo[k as keyof VoicemailExtractedInfo]).length
      },
      field_corrections: {
        ...existingCorrections,
        ...fieldCorrections
      }
    }

    console.log('[SMS MERGE END] Intelligent merge complete', {
      resultExtractedInfo: result.extracted_info,
      resultIntakeSources: result.intake_sources,
      fieldCorrections: result.field_corrections
    })

    return result
  }

  // Helper to determine if SMS value is better than existing
  const isSmsBetter = (
    fieldName: keyof VoicemailExtractedInfo,
    smsValue: string | undefined,
    existingValue: string | undefined
  ): boolean => {
    console.log(`[SMS MERGE DECISION] Field: ${fieldName}`, {
      smsValue,
      existingValue,
      hasSmsValue: !!smsValue,
      hasExistingValue: !!existingValue
    })

    if (!smsValue) {
      console.log(`[SMS MERGE DECISION] ${fieldName}: REJECTED - no SMS value`)
      return false
    }
    if (!existingValue) {
      console.log(`[SMS MERGE DECISION] ${fieldName}: ACCEPTED - no existing value`)
      return true
    }
    
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
        console.log(`[SMS MERGE DECISION] ${fieldName}: REJECTED - manually corrected field`)
        return false
      }
    }

    // Don't overwrite completed AI intake
    if (metadata.ai_intake_completed) {
      console.log(`[SMS MERGE DECISION] ${fieldName}: REJECTED - AI intake completed`)
      return false
    }

    // Check for correction intent in the original SMS body (not just the extracted value)
    // This allows phrases like "I meant help installing a shower" to override existing values
    if (hasCorrectionIntent && (fieldName === 'reasonForCalling' || fieldName === 'importantDetails')) {
      console.log(`[SMS MERGE DECISION] ${fieldName}: OVERRIDDEN due to correction phrase`, {
        detectedCorrectionPhrase,
        oldValue: existingValue,
        newValue: smsValue
      })
      return true
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
      console.log(`[SMS MERGE DECISION] ${fieldName}: ACCEPTED - existing is weak/generic`)
      return true
    }

    // For importantDetails: always allow SMS to add/append if it contains new information
    if (fieldName === 'importantDetails') {
      // If SMS has importantDetails and existing doesn't, use SMS
      if (!existingValue || existingValue.length === 0) {
        console.log(`[SMS MERGE DECISION] ${fieldName}: ACCEPTED - no existing importantDetails`)
        return true
      }
      // If SMS has different content than existing, append it
      if (existingLower !== smsValue.toLowerCase() && !existingLower.includes(smsValue.toLowerCase())) {
        console.log(`[SMS MERGE DECISION] ${fieldName}: ACCEPTED - new information to append`)
        return true
      }
    }

    console.log(`[SMS MERGE DECISION] ${fieldName}: REJECTED - no improvement criteria met`)
    return false
  }

  // Track correction metadata for regular merge path
  const fieldCorrections: Record<string, { from: string; to: string; source: string; correctedAt: string }> = {}
  const existingCorrections = metadata.field_corrections || {}

  const mergedExtractedInfo = {
    ...existingExtractedInfo,
    callerName: (() => {
      const shouldUse = isSmsBetter('callerName', smsExtractedInfo.callerName, existingExtractedInfo.callerName)
      if (shouldUse && existingExtractedInfo.callerName && smsExtractedInfo.callerName && existingExtractedInfo.callerName !== smsExtractedInfo.callerName) {
        fieldCorrections.callerName = {
          from: existingExtractedInfo.callerName,
          to: smsExtractedInfo.callerName,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return shouldUse ? smsExtractedInfo.callerName : existingExtractedInfo.callerName
    })(),
    reasonForCalling: (() => {
      const shouldUse = isSmsBetter('reasonForCalling', smsExtractedInfo.reasonForCalling, existingExtractedInfo.reasonForCalling)
      if (shouldUse && existingExtractedInfo.reasonForCalling && smsExtractedInfo.reasonForCalling && existingExtractedInfo.reasonForCalling !== smsExtractedInfo.reasonForCalling) {
        fieldCorrections.reasonForCalling = {
          from: existingExtractedInfo.reasonForCalling,
          to: smsExtractedInfo.reasonForCalling,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return shouldUse ? smsExtractedInfo.reasonForCalling : existingExtractedInfo.reasonForCalling
    })(),
    importantDetails: (() => {
      const shouldUse = isSmsBetter('importantDetails', smsExtractedInfo.importantDetails, existingExtractedInfo.importantDetails)
      const newValue = shouldUse
        ? (existingExtractedInfo.importantDetails && !existingExtractedInfo.importantDetails.toLowerCase().includes(smsExtractedInfo.importantDetails?.toLowerCase() || '')
            ? `${existingExtractedInfo.importantDetails}. ${smsExtractedInfo.importantDetails}`
            : smsExtractedInfo.importantDetails)
        : existingExtractedInfo.importantDetails
      if (shouldUse && existingExtractedInfo.importantDetails && newValue && existingExtractedInfo.importantDetails !== newValue) {
        fieldCorrections.importantDetails = {
          from: existingExtractedInfo.importantDetails,
          to: newValue,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return newValue
    })(),
    desiredCompletionTime: (() => {
      const shouldUse = isSmsBetter('desiredCompletionTime', smsExtractedInfo.desiredCompletionTime, existingExtractedInfo.desiredCompletionTime)
      if (shouldUse && existingExtractedInfo.desiredCompletionTime && smsExtractedInfo.desiredCompletionTime && existingExtractedInfo.desiredCompletionTime !== smsExtractedInfo.desiredCompletionTime) {
        fieldCorrections.desiredCompletionTime = {
          from: existingExtractedInfo.desiredCompletionTime,
          to: smsExtractedInfo.desiredCompletionTime,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return shouldUse ? smsExtractedInfo.desiredCompletionTime : existingExtractedInfo.desiredCompletionTime
    })(),
    addressOrLocation: (() => {
      const shouldUse = isSmsBetter('addressOrLocation', smsExtractedInfo.addressOrLocation, existingExtractedInfo.addressOrLocation)
      if (shouldUse && existingExtractedInfo.addressOrLocation && smsExtractedInfo.addressOrLocation && existingExtractedInfo.addressOrLocation !== smsExtractedInfo.addressOrLocation) {
        fieldCorrections.addressOrLocation = {
          from: existingExtractedInfo.addressOrLocation,
          to: smsExtractedInfo.addressOrLocation,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return shouldUse ? smsExtractedInfo.addressOrLocation : existingExtractedInfo.addressOrLocation
    })(),
    preferredCallbackTime: (() => {
      const shouldUse = isSmsBetter('preferredCallbackTime', smsExtractedInfo.preferredCallbackTime, existingExtractedInfo.preferredCallbackTime)
      if (shouldUse && existingExtractedInfo.preferredCallbackTime && smsExtractedInfo.preferredCallbackTime && existingExtractedInfo.preferredCallbackTime !== smsExtractedInfo.preferredCallbackTime) {
        fieldCorrections.preferredCallbackTime = {
          from: existingExtractedInfo.preferredCallbackTime,
          to: smsExtractedInfo.preferredCallbackTime,
          source: 'sms',
          correctedAt: new Date().toISOString()
        }
      }
      return shouldUse ? smsExtractedInfo.preferredCallbackTime : existingExtractedInfo.preferredCallbackTime
    })()
  }

  // Clear stale importantDetails when reasonForCalling is corrected
  // This prevents keeping details that are specific to the previous request
  if (hasCorrectionIntent &&
      mergedExtractedInfo.reasonForCalling !== existingExtractedInfo.reasonForCalling &&
      existingExtractedInfo.importantDetails) {
    console.log('[SMS MERGE] Clearing stale importantDetails due to reasonForCalling correction', {
      oldReason: existingExtractedInfo.reasonForCalling,
      newReason: mergedExtractedInfo.reasonForCalling,
      oldDetails: existingExtractedInfo.importantDetails
    })
    mergedExtractedInfo.importantDetails = smsExtractedInfo.importantDetails || undefined
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
  if (smsExtractedInfo.desiredCompletionTime && mergedExtractedInfo.desiredCompletionTime === smsExtractedInfo.desiredCompletionTime) {
    sources.desiredCompletionTime = 'sms'
  }
  if (smsExtractedInfo.addressOrLocation && mergedExtractedInfo.addressOrLocation === smsExtractedInfo.addressOrLocation) {
    sources.addressOrLocation = 'sms'
  }
  if (smsExtractedInfo.preferredCallbackTime && mergedExtractedInfo.preferredCallbackTime === smsExtractedInfo.preferredCallbackTime) {
    sources.preferredCallbackTime = 'sms'
  }

  const result = {
    ...metadata,
    extracted_info: mergedExtractedInfo,
    intake_sources: sources,
    sms_extraction: {
      extractedAt: smsExtraction.extractedAt,
      confidence: smsExtraction.confidence,
      fieldsExtracted: Object.keys(smsExtractedInfo).filter(k => smsExtractedInfo[k as keyof VoicemailExtractedInfo]).length
    },
    field_corrections: {
      ...existingCorrections,
      ...fieldCorrections
    }
  }

  console.log('[SMS MERGE FINAL RESULT]', {
    mergedExtractedInfo,
    updatedSources: sources,
    smsExtractionRecord: result.sms_extraction,
    fieldCorrections: result.field_corrections,
    fieldsChanged: Object.keys(mergedExtractedInfo).filter(key =>
      mergedExtractedInfo[key as keyof VoicemailExtractedInfo] !== existingExtractedInfo[key as keyof VoicemailExtractedInfo]
    )
  })

  return result
}

/**
 * Clean up extracted text with lightweight local cleanup only
 * Trims whitespace and normalizes spacing - the AI prompt handles CRM formatting
 */
export function cleanExtractedText(text: string): string {
  if (!text || typeof text !== 'string') {
    return text
  }

  let cleaned = text.trim()

  // Normalize multiple spaces to single space
  cleaned = cleaned.replace(/\s+/g, ' ')

  // Remove trailing period if exists, then add single period for consistency
  cleaned = cleaned.replace(/\.$/, '').trim()
  if (cleaned.length > 0) {
    cleaned += '.'
  }

  return cleaned
}


/**
 * Clean all extracted info fields to be business-ready
 */
export function cleanExtractedInfo(info: VoicemailExtractedInfo): VoicemailExtractedInfo {
  const cleaned: VoicemailExtractedInfo = {}

  for (const [key, value] of Object.entries(info)) {
    if (value && typeof value === 'string') {
      cleaned[key as keyof VoicemailExtractedInfo] = cleanExtractedText(value)
    }
  }

  return cleaned
}

/**
 * Capitalize words in a string
 */
function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, char => char.toUpperCase())
}
