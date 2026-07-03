/**
 * Voicemail Structured Extraction
 * 
 * Extracts structured information from voicemail transcripts using LLM
 * Reuses existing AI intake field mapping and normalization logic
 */

import { normalizeExtractedInfo, CANONICAL_FIELDS } from './ai-field-mapping'
import OpenAI from 'openai'

/**
 * Strip trailing punctuation from name fields only
 * Removes trailing ., ,, !, ?, : from names
 */
function stripTrailingPunctuationFromName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.replace(/[.,!?:]+$/, '').trim()
}

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
- Remove conversational phrases: "I want...", "I'd like...", "I'm hoping...", "Can someone...", "Looking for...", "Need someone to...", "Trying to get..."
- Keep every field extremely scannable (1-5 words when possible)
- Preserve meaning, not wording
- Never hallucinate information not present in the transcript
- Leave unknown values as null
- Ignore greetings and polite language
- Do NOT over-summarize or infer missing information
- Do NOT embellish or rewrite into marketing language

Field-Specific Rules:

reasonForCalling: Extract the SERVICE CATEGORY as a short noun phrase. This should be something a business owner expects to see inside a CRM, not what the customer literally said. Normalize all variations to the same service category.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Wants his grass cut" → "Lawn mowing"
- "Calling about getting grass cut" → "Lawn mowing"
- "Looking to have somebody mow" → "Lawn mowing"
- "Looking to get my grass cut" → "Lawn mowing"
- "Need somebody to mow my lawn" → "Lawn mowing"
- "Calling about my AC" → "Air conditioner repair"
- "My sink is leaking" → "Sink repair"
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
- "I'd like to get my piano tuned" → "Piano tuning"
- "Looking for piano lessons" → "Piano lessons"
- "Need my dog groomed" → "Dog grooming"
- "Pressure washing needed" → "Pressure washing"
- "Tree needs to come down" → "Tree removal"
- "Water heater replacement" → "Water heater replacement"
- "In the next three weeks" → "Lawn mowing" (this is timing, not service - extract actual service from context)
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Extract supporting information ONLY. Never repeat the service. Extract useful facts in concise CRM-friendly phrases. Remove ALL conversational wording completely.
- "The yard is very hard to get a lawnmower into, it's about a quarter acre and kind of hilly" → "Difficult backyard access, Quarter-acre property, Slight hill"
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "¾-acre lawn"
- "The yard is about three quarters of an acre and it's just the backyard." → "¾-acre backyard"
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting"
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Overgrown yard"
- "It's really steep" → "Steep terrain"
- "I'd like recurring service every two weeks" → "Recurring service every 2 weeks"
- "The gate code is 1234" → "Gate code: 1234"
- "Backyard only" → "Backyard only"
- "It is very hard to get a lawnmower into the backyard, and the entire yard is an acre" → "Difficult backyard access, 1-acre property"
- "The entire yard is about an acre" → "1-acre property"
- "It's really hard to access the backyard" → "Difficult backyard access"
- "It's my grandmother's house" → "Customer's grandmother's property"
- "My grandfather's house" → "Customer's grandfather's property"
- "My sister's place" → "Customer's sister's property"

desiredCompletionTime: Normalize to concise scheduling values. Extract WHEN the customer wants the work completed. Remove ALL conversational filler and hedge words.
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Wednesday" → "Wednesday"
- "Next week" → "Next week"
- "Within two weeks" → "Within 2 weeks"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "In the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it" → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"
- "Today" → "Today"
- "I'm hoping for next week" → "Next week"
- "I'd like it done by Wednesday" → "Wednesday"
- "I'm hoping sometime next week" → "Next week"
- "I'd like it done within the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"

preferredCallbackTime: Extract ONLY when the customer wants to receive a callback (time of day). Never copy desired completion into this field. Normalize to concise time-of-day values, but PRESERVE relative timing words like "tomorrow", "Friday", "next week", "this afternoon", "tomorrow morning".
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
- "Evenings are usually best" → "Evening"
- "Mornings are usually best for a callback" → "Morning"
- "In the afternoons any day" → "Afternoons"
- "Any afternoon works" → "Afternoons"
- "Morning or afternoon" → "Morning or afternoon"
- "Next week" → (null/empty) - this is timing, not callback time
- "Wednesday" → (null/empty) - this is timing, not callback time

CRITICAL: Never copy the desiredCompletionTime field into preferredCallbackTime. If the customer only mentions when they want the work done but does not provide a callback time preference, leave preferredCallbackTime as null.

Examples of correct extraction:
Customer: "I'd like the work done Tuesday or Wednesday."
Desired completion: "Tuesday or Wednesday"
Best callback time: (null/empty)

Customer: "I'm hoping it can be completed next week. Mornings are usually best for a callback."
Desired completion: "Next week"
Best callback time: "Morning"

Customer: "Can you get this done by Wednesday? Afternoons work best for calling me."
Desired completion: "Wednesday"
Best callback time: "Afternoon"

Customer: "I need this done ASAP."
Desired completion: "ASAP"
Best callback time: (null/empty)

addressOrLocation: Extract ONLY the address or location name. Remove ALL conversational context, relationship references, and introductory phrases. Return just the raw address or location identifier.
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"
- "My sister's place at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's my grandma's house, the yard is pretty overgrown" → "Grandma's house"
- "My grandfather's house" → "Grandfather's house"
- "My sister's place" → "Sister's place"
- "It'll be at..." → Extract just the address
- "The work will be done at 123 Oak Street" → "123 Oak Street"

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

reasonForCalling: Extract the SERVICE CATEGORY as a short noun phrase. This should be something a business owner expects to see inside a CRM, not what the customer literally said. Normalize all variations to the same service category.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Wants his grass cut" → "Lawn mowing"
- "Calling about getting grass cut" → "Lawn mowing"
- "Looking to have somebody mow" → "Lawn mowing"
- "Looking to get my grass cut" → "Lawn mowing"
- "Need somebody to mow my lawn" → "Lawn mowing"
- "Calling about my AC" → "Air conditioner repair"
- "My sink is leaking" → "Sink repair"
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
- "I'd like to get my piano tuned" → "Piano tuning"
- "Looking for piano lessons" → "Piano lessons"
- "Need my dog groomed" → "Dog grooming"
- "Pressure washing needed" → "Pressure washing"
- "Tree needs to come down" → "Tree removal"
- "Water heater replacement" → "Water heater replacement"
- "In the next three weeks" → "Lawn mowing" (this is timing, not service - extract actual service from context)
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Extract supporting information ONLY. Never repeat the service. Extract useful facts in concise CRM-friendly phrases. Remove ALL conversational wording completely.
- "The yard is very hard to get a lawnmower into, it's about a quarter acre and kind of hilly" → "Difficult backyard access, Quarter-acre property, Slight hill"
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "¾-acre lawn"
- "The yard is about three quarters of an acre and it's just the backyard." → "¾-acre backyard"
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting"
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Overgrown yard"
- "It's really steep" → "Steep terrain"
- "I'd like recurring service every two weeks" → "Recurring service every 2 weeks"
- "The gate code is 1234" → "Gate code: 1234"
- "Backyard only" → "Backyard only"
- "It is very hard to get a lawnmower into the backyard, and the entire yard is an acre" → "Difficult backyard access, 1-acre property"
- "The entire yard is about an acre" → "1-acre property"
- "It's really hard to access the backyard" → "Difficult backyard access"
- "It's my grandmother's house" → "Customer's grandmother's property"
- "My grandfather's house" → "Customer's grandfather's property"
- "My sister's place" → "Customer's sister's property"

desiredCompletionTime: Normalize to concise scheduling values. Extract WHEN the customer wants the work completed. Remove ALL conversational filler and hedge words.
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Wednesday" → "Wednesday"
- "Next week" → "Next week"
- "Within two weeks" → "Within 2 weeks"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "In the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it" → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"
- "Today" → "Today"
- "I'm hoping for next week" → "Next week"
- "I'd like it done by Wednesday" → "Wednesday"
- "I'm hoping sometime next week" → "Next week"
- "I'd like it done within the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"

preferredCallbackTime: Extract ONLY when the customer wants to receive a callback (time of day). Never copy desired completion into this field. Normalize to concise time-of-day values, but PRESERVE relative timing words like "tomorrow", "Friday", "next week", "this afternoon", "tomorrow morning".
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
- "Evenings are usually best" → "Evening"
- "Mornings are usually best for a callback" → "Morning"
- "In the afternoons any day" → "Afternoons"
- "Any afternoon works" → "Afternoons"
- "Morning or afternoon" → "Morning or afternoon"
- "Next week" → (null/empty) - this is timing, not callback time
- "Wednesday" → (null/empty) - this is timing, not callback time

CRITICAL: Never copy the desiredCompletionTime field into preferredCallbackTime. If the customer only mentions when they want the work done but does not provide a callback time preference, leave preferredCallbackTime as null.

Examples of correct extraction:
Customer: "I'd like the work done Tuesday or Wednesday."
Desired completion: "Tuesday or Wednesday"
Best callback time: (null/empty)

Customer: "I'm hoping it can be completed next week. Mornings are usually best for a callback."
Desired completion: "Next week"
Best callback time: "Morning"

Customer: "Can you get this done by Wednesday? Afternoons work best for calling me."
Desired completion: "Wednesday"
Best callback time: "Afternoon"

Customer: "I need this done ASAP."
Desired completion: "ASAP"
Best callback time: (null/empty)

addressOrLocation: Extract ONLY the address or location name. Remove ALL conversational context, relationship references, and introductory phrases. Return just the raw address or location identifier.
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"
- "My sister's place at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's my grandma's house, the yard is pretty overgrown" → "Grandma's house"
- "My grandfather's house" → "Grandfather's house"
- "My sister's place" → "Sister's place"
- "It'll be at..." → Extract just the address
- "The work will be done at 123 Oak Street" → "123 Oak Street"

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

reasonForCalling: Extract the SERVICE CATEGORY as a short noun phrase. This should be something a business owner expects to see inside a CRM, not what the customer literally said. Normalize all variations to the same service category.
- "Get my grass cut" → "Lawn mowing"
- "See if I can get my grass cut" → "Lawn mowing"
- "Need my grass cut" → "Lawn mowing"
- "Get the yard mowed" → "Lawn mowing"
- "Wants his grass cut" → "Lawn mowing"
- "Calling about getting grass cut" → "Lawn mowing"
- "Looking to have somebody mow" → "Lawn mowing"
- "Looking to get my grass cut" → "Lawn mowing"
- "Need somebody to mow my lawn" → "Lawn mowing"
- "Calling about my AC" → "Air conditioner repair"
- "My sink is leaking" → "Sink repair"
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
- "I'd like to get my piano tuned" → "Piano tuning"
- "Looking for piano lessons" → "Piano lessons"
- "Need my dog groomed" → "Dog grooming"
- "Pressure washing needed" → "Pressure washing"
- "Tree needs to come down" → "Tree removal"
- "Water heater replacement" → "Water heater replacement"
- "In the next three weeks" → "Lawn mowing" (this is timing, not service - extract actual service from context)
Do NOT invent services the customer didn't request. Preserve meaningful differences like inspection vs repair vs replacement.

importantDetails: Extract supporting information ONLY. Never repeat the service. Extract useful facts in concise CRM-friendly phrases. Remove ALL conversational wording completely.
- "The yard is very hard to get a lawnmower into, it's about a quarter acre and kind of hilly" → "Difficult backyard access, Quarter-acre property, Slight hill"
- "Three-fourths acre lawn" → "Three-fourths acre lawn"
- "Um, yeah, it's like, I don't know, about three-quarters of an acre, the yard is." → "¾-acre lawn"
- "The yard is about three quarters of an acre and it's just the backyard." → "¾-acre backyard"
- "Front flower beds need weeding" → "Front flower beds weeding"
- "Fence damaged from storm" → "Storm-damaged fence"
- "Dog is friendly" → "Dog is friendly"
- "Multiple rooms need painting" → "Multiple rooms painting"
- "There are a couple rooms that need painted." → "Multiple rooms need painting"
- "It'll be to cut half an acre of grass" → "Half-acre lawn"
- "Need mulch around flower beds" → "Mulch flower beds"
- "Tree fell on the fence" → "Tree on fence"
- "It's my grandma's house, the yard is pretty overgrown." → "Overgrown yard"
- "It's really steep" → "Steep terrain"
- "I'd like recurring service every two weeks" → "Recurring service every 2 weeks"
- "The gate code is 1234" → "Gate code: 1234"
- "Backyard only" → "Backyard only"
- "It is very hard to get a lawnmower into the backyard, and the entire yard is an acre" → "Difficult backyard access, 1-acre property"
- "The entire yard is about an acre" → "1-acre property"
- "It's really hard to access the backyard" → "Difficult backyard access"
- "It's my grandmother's house" → "Customer's grandmother's property"
- "My grandfather's house" → "Customer's grandfather's property"
- "My sister's place" → "Customer's sister's property"

desiredCompletionTime: Normalize to concise scheduling values. Extract WHEN the customer wants the work completed. Remove ALL conversational filler and hedge words.
- "Tomorrow morning" → "Tomorrow morning"
- "Monday or Tuesday" → "Monday or Tuesday"
- "This week" → "This week"
- "Wednesday" → "Wednesday"
- "Next week" → "Next week"
- "Within two weeks" → "Within 2 weeks"
- "Within the next few days" → "Within few days"
- "Within the next week" → "Within the next week"
- "In the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"
- "I guess anytime this week" → "This week"
- "Whenever possible" → "Flexible"
- "Whenever they can get to it" → "Flexible"
- "Tomorrow afternoon" → "Tomorrow afternoon"
- "This weekend" → "Weekend"
- "Today" → "Today"
- "I'm hoping for next week" → "Next week"
- "I'd like it done by Wednesday" → "Wednesday"
- "I'm hoping sometime next week" → "Next week"
- "I'd like it done within the next three weeks" → "Within 3 weeks"
- "As soon as possible" → "ASAP"

preferredCallbackTime: Extract ONLY when the customer wants to receive a callback (time of day). Never copy desired completion into this field. Normalize to concise time-of-day values, but PRESERVE relative timing words like "tomorrow", "Friday", "next week", "this afternoon", "tomorrow morning".
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
- "Evenings are usually best" → "Evening"
- "Mornings are usually best for a callback" → "Morning"
- "In the afternoons any day" → "Afternoons"
- "Any afternoon works" → "Afternoons"
- "Morning or afternoon" → "Morning or afternoon"
- "Next week" → (null/empty) - this is timing, not callback time
- "Wednesday" → (null/empty) - this is timing, not callback time

CRITICAL: Never copy the desiredCompletionTime field into preferredCallbackTime. If the customer only mentions when they want the work done but does not provide a callback time preference, leave preferredCallbackTime as null.

Examples of correct extraction:
Customer: "I'd like the work done Tuesday or Wednesday."
Desired completion: "Tuesday or Wednesday"
Best callback time: (null/empty)

Customer: "I'm hoping it can be completed next week. Mornings are usually best for a callback."
Desired completion: "Next week"
Best callback time: "Morning"

Customer: "Can you get this done by Wednesday? Afternoons work best for calling me."
Desired completion: "Wednesday"
Best callback time: "Afternoon"

Customer: "I need this done ASAP."
Desired completion: "ASAP"
Best callback time: (null/empty)

addressOrLocation: Extract ONLY the address or location name. Remove ALL conversational context, relationship references, and introductory phrases. Return just the raw address or location identifier.
- "1632 South Pine Drive" → "1632 South Pine Drive"
- "It'll be at my grandma's house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's at my house at 1632 South Pine Drive" → "1632 South Pine Drive"
- "My business at 123 Main Street" → "123 Main Street"
- "My sister's place at 1632 South Pine Drive" → "1632 South Pine Drive"
- "It's my grandma's house, the yard is pretty overgrown" → "Grandma's house"
- "My grandfather's house" → "Grandfather's house"
- "My sister's place" → "Sister's place"
- "It'll be at..." → Extract just the address
- "The work will be done at 123 Oak Street" → "123 Oak Street"
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
    callerName: stripTrailingPunctuationFromName(mergeField('callerName', voicemailExtractedInfo.callerName, existingExtractedInfo.callerName)),
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
  const explicitFieldPatterns: Record<keyof VoicemailExtractedInfo, RegExp[]> = {
    callerName: [/\bmy name is\b/i, /\bname is\b/i, /\bthis is\b/i, /\bi am\b/i, /\bi'm\b/i],
    reasonForCalling: [/\bi need\b/i, /\bi want\b/i, /\bneed help with\b/i],
    importantDetails: [/\bit is actually\b/i, /\bit's actually\b/i, /\bactually\b/i],
    desiredCompletionTime: [/\bit should be\b/i, /\bshould be\b/i, /\bi need it\b/i],
    addressOrLocation: [/\bmy address is\b/i, /\baddress is\b/i, /\bmy service address is\b/i, /\bservice address is\b/i],
    preferredCallbackTime: [/\bcall me\b/i, /\bcall me after\b/i, /\bcall after\b/i, /\bavailable after\b/i]
  }
  const explicitlyProvidedFields = new Set<keyof VoicemailExtractedInfo>()
  for (const [field, patterns] of Object.entries(explicitFieldPatterns) as [keyof VoicemailExtractedInfo, RegExp[]][]) {
    if ((smsExtractedInfo as any)[field] && patterns.some(pattern => pattern.test(originalSmsBody || ''))) {
      explicitlyProvidedFields.add(field)
    }
  }
  const detectedCorrectionPhrase = correctionPhrases.find(phrase => smsBodyLower.includes(phrase))
  const hasCorrectionIntent = !!detectedCorrectionPhrase || explicitlyProvidedFields.size > 0

  console.log('[SMS MERGE] Correction intent detection', {
    hasCorrectionIntent,
    detectedCorrectionPhrase,
    explicitlyProvidedFields: Array.from(explicitlyProvidedFields),
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

    const explicitOnlyMerged: VoicemailExtractedInfo = { ...existingExtractedInfo }
    const fieldsPreserved: string[] = []
    const fieldsUpdated: string[] = []
    const fieldCorrections: Record<string, { from: string; to: string; source: string; correctedAt: string }> = {}
    const existingCorrections = metadata.field_corrections || {}

    for (const field of Object.keys(explicitFieldPatterns) as (keyof VoicemailExtractedInfo)[]) {
      const existing = existingExtractedInfo[field]
      const incoming = smsExtractedInfo[field]
      const llmMerged = intelligentlyMerged[field]
      const isExplicit = explicitlyProvidedFields.has(field)
      const merged = isExplicit && incoming ? incoming : existing
      explicitOnlyMerged[field] = merged

      if (merged === existing) {
        fieldsPreserved.push(field)
      } else {
        fieldsUpdated.push(field)
        if (existing && merged) {
          fieldCorrections[field] = {
            from: existing,
            to: merged,
            source: 'sms',
            correctedAt: new Date().toISOString()
          }
        }
      }

      console.log('[SMS MERGE FIELD]', {
        field,
        existing,
        incoming,
        llmMerged,
        merged,
        reason: isExplicit && incoming
          ? 'explicit_customer_correction_sms_value_replaces_existing'
          : llmMerged !== existing
            ? 'llm_merge_change_ignored_field_not_explicitly_provided'
            : 'sms_did_not_explicitly_provide_field_existing_preserved'
      })
    }

    console.log('[SMS MERGE] Intelligent merge results', {
      fieldsPreserved,
      fieldsUpdated,
      original: existingExtractedInfo,
      llmMerged: intelligentlyMerged,
      explicitOnlyMerged,
      fieldCorrections
    })

    for (const key of fieldsUpdated as (keyof VoicemailExtractedInfo)[]) {
      if (explicitOnlyMerged[key]) {
        sources[key] = 'sms'
      }
    }

    const result = {
      ...metadata,
      extracted_info: explicitOnlyMerged,
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

    if (explicitlyProvidedFields.has(fieldName)) {
      console.log(`[SMS MERGE DECISION] ${fieldName}: ACCEPTED - explicit customer correction`, {
        oldValue: existingValue,
        newValue: smsValue
      })
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

  const mergeSmsField = (fieldName: keyof VoicemailExtractedInfo): string | undefined => {
    const shouldUse = isSmsBetter(fieldName, smsExtractedInfo[fieldName], existingExtractedInfo[fieldName])
    const merged = shouldUse ? smsExtractedInfo[fieldName] : existingExtractedInfo[fieldName]
    if (shouldUse && existingExtractedInfo[fieldName] && smsExtractedInfo[fieldName] && existingExtractedInfo[fieldName] !== smsExtractedInfo[fieldName]) {
      fieldCorrections[fieldName] = {
        from: existingExtractedInfo[fieldName]!,
        to: smsExtractedInfo[fieldName]!,
        source: 'sms',
        correctedAt: new Date().toISOString()
      }
    }
    console.log('[SMS MERGE FIELD]', {
      field: fieldName,
      existing: existingExtractedInfo[fieldName],
      incoming: smsExtractedInfo[fieldName],
      merged,
      reason: shouldUse
        ? explicitlyProvidedFields.has(fieldName)
          ? 'explicit_customer_correction_sms_value_replaces_existing'
          : existingExtractedInfo[fieldName]
            ? 'sms_value_accepted_by_merge_policy'
            : 'existing_value_empty'
        : smsExtractedInfo[fieldName]
          ? 'existing_value_preserved_by_merge_policy'
          : 'sms_did_not_provide_field'
    })
    return merged
  }

  const mergedExtractedInfo = {
    ...existingExtractedInfo,
    callerName: stripTrailingPunctuationFromName(mergeSmsField('callerName')),
    reasonForCalling: mergeSmsField('reasonForCalling'),
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
      console.log('[SMS MERGE FIELD]', {
        field: 'importantDetails',
        existing: existingExtractedInfo.importantDetails,
        incoming: smsExtractedInfo.importantDetails,
        merged: newValue,
        reason: shouldUse
          ? explicitlyProvidedFields.has('importantDetails')
            ? 'explicit_customer_correction_sms_value_replaces_existing'
            : existingExtractedInfo.importantDetails
              ? 'sms_value_accepted_by_merge_policy'
              : 'existing_value_empty'
          : smsExtractedInfo.importantDetails
            ? 'existing_value_preserved_by_merge_policy'
            : 'sms_did_not_provide_field'
      })
      return newValue
    })(),
    desiredCompletionTime: mergeSmsField('desiredCompletionTime'),
    addressOrLocation: mergeSmsField('addressOrLocation'),
    preferredCallbackTime: mergeSmsField('preferredCallbackTime')
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
