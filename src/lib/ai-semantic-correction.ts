/**
 * AI-Powered Semantic Correction Layer
 * 
 * Uses OpenAI API to intelligently analyze customer SMS messages
 * for corrections, additions, and clarifications to AI intake data.
 */

import OpenAI from 'openai'

/**
 * Get OpenAI client (lazy initialization to avoid build-time errors)
 */
function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface SemanticCorrectionResult {
  shouldUpdate: boolean
  updates: Array<{
    field: string
    value: string
    oldValue?: string
    action: 'correction' | 'addition' | 'clarification'
  }>
  reason: string
  confidence: number
  isConversational: boolean
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
 * Analyze customer SMS using AI to determine if it contains corrections or additions
 */
export async function analyzeSemanticCorrection(
  customerReply: string,
  extractedInfo: ExtractedInfo,
  conversationContext?: string
): Promise<SemanticCorrectionResult> {
  console.log('[SEMANTIC CORRECTION ANALYSIS START]', {
    customerReply,
    extractedInfo,
    conversationContext
  })

  // First, check if this is a conversational message using regex (fast path)
  const isConversational = isConversationalReply(customerReply)
  if (isConversational) {
    console.log('[CONVERSATIONAL REPLY DETECTED]', {
      message: customerReply,
      reason: 'Message appears to be a conversational acknowledgement'
    })
    return {
      shouldUpdate: false,
      updates: [],
      reason: 'Conversational reply - no correction or addition needed',
      confidence: 0.95,
      isConversational: true
    }
  }

  try {
    const openai = getOpenAIClient()
    const systemPrompt = `You are an intelligent assistant that analyzes customer SMS messages to detect corrections or additions to previously captured information.

Your task is to analyze the customer's reply and determine:
1. Is this a correction of existing information?
2. Is this an addition of new information?
3. Is this a clarification of existing information?
4. Which field(s) should be updated?
5. What should the new value(s) be?

Available fields:
- callerName: Customer's name
- reasonForCalling: Reason for calling (e.g., "plumbing repair", "piano lessons")
- importantDetails: Important details about the request (e.g., "trim and wash for a Springer Spaniel", "half an acre lawn")
- urgencyLevel: Urgency level (e.g., "Urgent", "Not urgent")
- addressOrLocation: Service address or location
- preferredCallbackTime: Best time for callback
- callbackNumber: Callback phone number

Guidelines:
- Be conservative - only suggest updates if the customer is clearly correcting or adding information
- If the customer is correcting something specific (e.g., "my dog is actually a Cocker Spaniel"), treat it as a correction
- If the customer is adding new information (e.g., "it's about half an acre", "they are for my daughter"), treat it as an addition
- If the customer is clarifying (e.g., "they'll actually be at my house"), treat it as a clarification
- For details field, intelligently replace or expand based on context
- For location, only update if it's clearly a new location or correction
- Never treat conversational messages (thanks, ok, sounds good, etc.) as corrections or additions
- Maintain the original structure and format of the information
- Preserve high-confidence information unless clearly corrected

IMPORTANT: Callback time detection must take priority over name detection
- Phrases like "you can call me back at any time", "call me back anytime", "call me after 5", "anytime is fine" should update preferredCallbackTime
- Extract the actual callback time value (e.g., "Anytime", "After 5 PM", "Tomorrow", "Morning")
- Do NOT treat these as name corrections
- Only update callerName from explicit patterns like "my name is Brian", "this is Brian", "I'm Brian"

Output format (JSON only, no additional text):
{
  "shouldUpdate": true or false,
  "updates": [
    {
      "field": "fieldName",
      "value": "new value",
      "oldValue": "current value if being corrected",
      "action": "correction" or "addition" or "clarification"
    }
  ],
  "reason": "brief explanation",
  "confidence": 0.0 to 1.0
}`

    const userPrompt = `Customer SMS: "${customerReply}"

Current extracted information:
${JSON.stringify(extractedInfo, null, 2)}

${conversationContext ? `Conversation context: ${conversationContext}` : ''}

Analyze this message and determine if it contains corrections or additions.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const responseText = completion.choices[0]?.message?.content || '{}'
    const analysis = JSON.parse(responseText)

    console.log('[SEMANTIC ANALYSIS RESULT]', {
      analysis,
      rawResponse: responseText
    })

    // Validate and sanitize the response
    const validatedResult = validateAndSanitizeResult(analysis, extractedInfo)

    console.log('[SEMANTIC CORRECTION ANALYSIS COMPLETE]', {
      shouldUpdate: validatedResult.shouldUpdate,
      updates: validatedResult.updates,
      reason: validatedResult.reason,
      confidence: validatedResult.confidence
    })

    return validatedResult

  } catch (error: any) {
    console.error('[SEMANTIC ANALYSIS ERROR]', {
      error: error.message,
      stack: error.stack
    })

    // Fallback to no update if AI analysis fails
    return {
      shouldUpdate: false,
      updates: [],
      reason: `AI analysis failed: ${error.message}`,
      confidence: 0,
      isConversational: false
    }
  }
}

/**
 * Validate and sanitize the AI analysis result
 */
function validateAndSanitizeResult(
  analysis: any,
  extractedInfo: ExtractedInfo
): SemanticCorrectionResult {
  const validFields = ['callerName', 'reasonForCalling', 'importantDetails', 'urgencyLevel', 'addressOrLocation', 'preferredCallbackTime', 'callbackNumber']

  // Default result
  const result: SemanticCorrectionResult = {
    shouldUpdate: false,
    updates: [],
    reason: analysis.reason || 'No valid updates detected',
    confidence: analysis.confidence || 0,
    isConversational: false
  }

  if (!analysis || typeof analysis !== 'object') {
    return result
  }

  if (typeof analysis.shouldUpdate !== 'boolean') {
    return result
  }

  result.shouldUpdate = analysis.shouldUpdate

  if (Array.isArray(analysis.updates)) {
    for (const update of analysis.updates) {
      if (update.field && validFields.includes(update.field) && update.value) {
        // Safety check: don't overwrite high-confidence data with low-confidence guesses
        if (analysis.confidence < 0.7 && extractedInfo[update.field as keyof ExtractedInfo]) {
          console.log('[SEMANTIC SAFETY CHECK]', {
            field: update.field,
            reason: 'Confidence too low to overwrite existing data',
            confidence: analysis.confidence,
            existingValue: extractedInfo[update.field as keyof ExtractedInfo]
          })
          continue
        }

        result.updates.push({
          field: update.field,
          value: String(update.value),
          oldValue: update.oldValue || extractedInfo[update.field as keyof ExtractedInfo],
          action: update.action || 'correction'
        })
      }
    }
  }

  result.reason = analysis.reason || result.reason
  result.confidence = Math.min(1, Math.max(0, analysis.confidence || 0))

  return result
}

/**
 * Detect if a message is a conversational reply (not a correction)
 * These should be ignored and not trigger acknowledgements
 */
function isConversationalReply(message: string): boolean {
  const reply = message.toLowerCase().trim()
  
  const conversationalPatterns = [
    // Positive acknowledgements
    /^(thanks|thank you|thx|ty|appreciate it|appreciated)\.?$/i,
    /^(perfect|great|awesome|excellent|wonderful|fantastic)\.?$/i,
    /^(sounds good|sounds great|that sounds good)\.?$/i,
    /^(got it|gotcha|understood|understand)\.?$/i,
    /^(ok|okay|okey|okie)\.?$/i,
    /^(sure|no problem|no worries|no problemo)\.?$/i,
    /^(cool|nice|sweet)\.?$/i,
    /^(done|finished|complete)\.?$/i,
    /^(yes|yeah|yep|yup|yay)\.?$/i,
    /^(no|nope|nah)\.?$/i,
    
    // Emoji-only responses
    /^(👍|👌|✅|🆗|✨|💯|🙌|👏|😊|😄|🙂)$/i,
    
    // Very short responses
    /^(ok|yes|no|sure|fine|good|great|thanks|bye|hi|hello)\.?$/i,
    
    // Conversational fillers
    /^(oh i see|i see|i understand|gotcha|alright|right)\.?$/i,
  ]
  
  return conversationalPatterns.some(pattern => pattern.test(reply))
}

/**
 * Intelligently merge new details with existing details
 */
export function mergeDetailsField(
  existingDetails: string | undefined,
  newDetails: string,
  action: 'correction' | 'addition' | 'clarification'
): string {
  if (!existingDetails) {
    return newDetails
  }

  if (action === 'correction') {
    // For corrections, replace the relevant part
    // This is a simple implementation - could be enhanced with more sophisticated NLP
    return newDetails
  }

  if (action === 'addition') {
    // For additions, append the new information
    return `${existingDetails}. ${newDetails}`
  }

  if (action === 'clarification') {
    // For clarifications, merge intelligently
    return `${existingDetails} (${newDetails})`
  }

  return newDetails
}
