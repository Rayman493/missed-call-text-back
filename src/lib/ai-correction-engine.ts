/**
 * AI Intake Correction Engine
 * 
 * Detects and applies customer corrections to AI intake data using OpenAI
 */

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface CorrectionDetectionResult {
  isCorrection: boolean
  fieldChanged?: string
  oldValue?: string
  newValue?: string
  confidence: number
  requiresReview: boolean
  reason?: string
}

export interface ExtractedInfo {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
}

/**
 * Detect if an inbound SMS contains a correction to AI intake data
 */
export async function detectCorrection(
  customerReply: string,
  extractedInfo: ExtractedInfo
): Promise<CorrectionDetectionResult> {
  console.log('[AI CORRECTION DETECTION START]', {
    customerReply,
    extractedInfo
  })

  try {
    const systemPrompt = `You are an AI assistant that detects corrections to previously captured information.

You will receive:
1. A customer's reply to an SMS summary
2. The previously extracted information

Your task:
- Determine if the customer is correcting any information
- Identify which field is being corrected
- Extract the new value
- Assess confidence (0-1)
- Flag for review if confidence < 0.7

Fields to check:
- callerName (customer's name)
- reasonForCalling (reason for calling)
- importantDetails (details about the request)
- urgencyLevel (urgency)
- addressOrLocation (location/service address)
- preferredCallbackTime (when to call back)
- callbackNumber (phone number)

Return JSON:
{
  "isCorrection": boolean,
  "fieldChanged": string | null,
  "oldValue": string | null,
  "newValue": string | null,
  "confidence": number (0-1),
  "requiresReview": boolean,
  "reason": string
}

If not a correction, set isCorrection to false and provide a reason.
If correction detected, set isCorrection to true, identify the field, old value, new value, confidence.`

    const userPrompt = `Customer reply: "${customerReply}"

Previously extracted information:
${JSON.stringify(extractedInfo, null, 2)}

Analyze if this is a correction and return JSON.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const responseText = completion.choices[0].message.content || '{}'
    const result = JSON.parse(responseText) as CorrectionDetectionResult

    console.log('[AI CORRECTION DETECTION RESULT]', result)

    // Validate result structure
    if (!result.isCorrection) {
      return {
        isCorrection: false,
        confidence: 0,
        requiresReview: false,
        reason: result.reason || 'No correction detected'
      }
    }

    // Ensure required fields are present for corrections
    return {
      isCorrection: true,
      fieldChanged: result.fieldChanged || 'unknown',
      oldValue: result.oldValue || '',
      newValue: result.newValue || '',
      confidence: result.confidence || 0.5,
      requiresReview: (result.confidence || 0) < 0.7,
      reason: result.reason || 'Correction detected'
    }
  } catch (error: any) {
    console.error('[AI CORRECTION DETECTION ERROR]', error)
    return {
      isCorrection: false,
      confidence: 0,
      requiresReview: true,
      reason: `Error during detection: ${error.message}`
    }
  }
}

/**
 * Update extracted_info with the corrected field
 */
export function applyCorrection(
  extractedInfo: ExtractedInfo,
  fieldChanged: string,
  newValue: string
): ExtractedInfo {
  const updated = { ...extractedInfo }

  // Map field names to extracted_info keys
  const fieldMapping: Record<string, keyof ExtractedInfo> = {
    'name': 'callerName',
    'callerName': 'callerName',
    'caller name': 'callerName',
    'reason': 'reasonForCalling',
    'reasonForCalling': 'reasonForCalling',
    'reason for calling': 'reasonForCalling',
    'details': 'importantDetails',
    'importantDetails': 'importantDetails',
    'important details': 'importantDetails',
    'urgency': 'urgencyLevel',
    'urgencyLevel': 'urgencyLevel',
    'urgency level': 'urgencyLevel',
    'location': 'addressOrLocation',
    'address': 'addressOrLocation',
    'addressOrLocation': 'addressOrLocation',
    'address or location': 'addressOrLocation',
    'callback time': 'preferredCallbackTime',
    'preferredCallbackTime': 'preferredCallbackTime',
    'preferred callback time': 'preferredCallbackTime',
    'callback number': 'callbackNumber',
    'callbackNumber': 'callbackNumber'
  }

  const mappedField = fieldMapping[fieldChanged.toLowerCase()] || fieldChanged as keyof ExtractedInfo

  if (mappedField in updated) {
    (updated as any)[mappedField] = newValue
  }

  return updated
}

/**
 * Generate correction audit note
 */
export function generateCorrectionNote(
  fieldChanged: string,
  oldValue: string,
  newValue: string,
  confidence: number
): string {
  return `[AI CORRECTION APPLIED] ${fieldChanged} changed from "${oldValue}" to "${newValue}" (confidence: ${confidence.toFixed(2)})`
}
