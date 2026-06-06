/**
 * AI Call Assistant Prompts (Phase 0 - QA Only)
 * 
 * Simple intake script for collecting customer information
 */

/**
 * System prompt for OpenAI Realtime API
 */
export function getSystemPrompt(businessName: string): string {
  return `You are ReplyFlow's phone assistant for ${businessName}. Always speak in clear, natural American English. Never switch languages. If the caller speaks another language or the audio is unclear, continue in English.

LANGUAGE REQUIREMENTS:
- You must always speak English. Do not switch languages under any circumstances.
- If the caller speaks another language, politely respond in English and say you can help in English.
- Never infer or switch language based on accent, background noise, short utterances, silence, or unclear audio.
- All responses must be in English regardless of caller's language or audio quality.

Your role is to:
1. Greet the caller professionally in English
2. Collect 4 pieces of information:
   - Caller's name
   - Reason for calling
   - Urgency level (high/medium/low)
   - Best callback number
3. Read back a concise summary of what you captured
4. Ask for final confirmation: "Is that all correct?"
5. If caller confirms (yes, correct, that's right, etc.):
   - Thank the caller
   - End the call
6. If caller corrects something:
   - Update the corrected field
   - Regenerate summary
   - Ask confirmation again
7. Only complete intake after caller confirms the information is correct

Important guidelines:
- Be polite and professional
- Keep responses brief (1-2 sentences)
- Do not make up information you don't have
- If the caller is unclear, ask for clarification in English
- Do not promise anything beyond taking a message
- Always get final confirmation before ending the call
- If caller provides corrections, acknowledge them and ask confirmation again

Greeting: "Hi, thanks for calling ${businessName}. I'm the automated assistant. I can take a quick message for the team. May I get your name?"

Confirmation question: "Let me confirm what I have. [read summary]. Is that all correct?"

Closing (after confirmation): "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."`
}

/**
 * Intake questions in order
 */
export const INTAKE_QUESTIONS = [
  {
    field: 'name',
    question: "May I get your name?",
    prompt: "Ask for the caller's name"
  },
  {
    field: 'reason',
    question: "What's the reason for your call today?",
    prompt: "Ask for the reason for the call"
  },
  {
    field: 'urgency',
    question: "How urgent is this matter? Is it high, medium, or low priority?",
    prompt: "Ask for urgency level"
  },
  {
    field: 'callback_number',
    question: "What's the best callback number for the team to reach you?",
    prompt: "Ask for callback number"
  }
]

/**
 * Function calling schema for extracting customer information
 */
export const EXTRACTION_FUNCTION = {
  name: 'extract_customer_info',
  description: 'Extract customer information from the conversation',
  parameters: {
    type: 'object',
    properties: {
      caller_name: {
        type: 'string',
        description: "The caller's full name"
      },
      reason_for_call: {
        type: 'string',
        description: "Brief description of why the customer is calling"
      },
      urgency: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: "Urgency level of the call"
      },
      callback_number: {
        type: 'string',
        description: "Phone number for callback"
      }
    },
    required: ['caller_name', 'reason_for_call', 'urgency', 'callback_number']
  }
}

/**
 * Generate greeting message
 */
export function getGreeting(businessName: string): string {
  console.log('[AI SESSION LANGUAGE LOCK] english')
  return `Hi, thanks for calling ${businessName}. I'm the automated assistant. I can take a quick message for the team. May I get your name?`
}

/**
 * Generate closing message
 */
export function getClosing(): string {
  return "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."
}

/**
 * Generate confirmation question with summary
 */
export function getConfirmationQuestion(data: {
  caller_name: string
  reason_for_call: string
  urgency: string
  callback_number: string
}): string {
  console.log('[AI FINAL CONFIRMATION ASKED]', {
    caller_name: data.caller_name,
    reason_for_call: data.reason_for_call,
    urgency: data.urgency,
    callback_number: data.callback_number
  })
  
  const summary = `Name: ${data.caller_name}, reason: ${data.reason_for_call}, urgency: ${data.urgency}, callback: ${data.callback_number}`
  return `Let me confirm what I have. ${summary}. Is that all correct?`
}

/**
 * Log confirmation acceptance
 */
export function logConfirmationAccepted(): void {
  console.log('[AI FINAL CONFIRMATION ACCEPTED]')
}

/**
 * Log correction received
 */
export function logCorrectionReceived(field: string, newValue: string): void {
  console.log('[AI FINAL CONFIRMATION CORRECTION_RECEIVED]', {
    field,
    newValue
  })
}

/**
 * Log summary regenerated after correction
 */
export function logSummaryRegenerated(data: {
  caller_name: string
  reason_for_call: string
  urgency: string
  callback_number: string
}): void {
  console.log('[AI SUMMARY REGENERATED_AFTER_CORRECTION]', data)
}

/**
 * Generate summary from extracted data
 */
export function generateSummary(data: {
  caller_name: string
  reason_for_call: string
  urgency: string
  callback_number: string
}): string {
  return `Name: ${data.caller_name}
Need: ${data.reason_for_call}
Urgency: ${data.urgency}
Callback: ${data.callback_number}`
}
