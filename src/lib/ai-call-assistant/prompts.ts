/**
 * AI Call Assistant Prompts (Phase 0 - QA Only)
 * 
 * Business-type-aware intake script for collecting customer information
 */

/**
 * Business categories with tailored intake instructions
 */
export type BusinessCategory = 
  | 'home_services'      // general contractors, handymen
  | 'plumbing_hvac'       // plumbers, HVAC technicians
  | 'cleaning'            // cleaning services
  | 'landscaping'         // landscapers, lawn care
  | 'real_estate'         // real estate agents, inspectors
  | 'travel_agent'        // travel agents
  | 'salon_appointment'   // salons, appointment-based services
  | 'general_service'     // fallback for other local services

/**
 * Category-specific intake questions and instructions
 */
export const CATEGORY_INTAKE_CONFIG: Record<BusinessCategory, {
  greeting: string
  reasonQuestion: string
  followUpQuestions: string[]
  urgencyQuestion: string
  locationQuestion: string | null
  callbackTimeQuestion: string | null
  callbackNumberQuestion: string
  confirmationFormat: (data: any) => string
}> = {
  home_services: {
    greeting: "Hi, this is the assistant. I can help get your request over to the team. What can I help with?",
    reasonQuestion: "What type of service are you looking for today?",
    followUpQuestions: [
      "Could you describe the issue or project in a bit more detail?",
      "Do you have a preferred date or time for the service?"
    ],
    urgencyQuestion: "How soon do you need this taken care of? Is it urgent, or can it wait a few days?",
    locationQuestion: "What's the service address?",
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, service: ${data.reason_for_call}, urgency: ${data.urgency}, address: ${data.address || 'not provided'}, callback: ${data.callback_number}`
  },
  
  plumbing_hvac: {
    greeting: "Hi, this is the assistant. I can help get your request over to the plumbing team. What can I help with?",
    reasonQuestion: "Are you calling about a plumbing issue or HVAC service?",
    followUpQuestions: [
      "Could you describe the problem briefly?",
      "Is this an emergency situation?"
    ],
    urgencyQuestion: "Is this an emergency that needs immediate attention, or can it wait for a scheduled appointment?",
    locationQuestion: "What's the service address?",
    callbackTimeQuestion: "When would be the best time for a technician to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, service: ${data.reason_for_call}, urgency: ${data.urgency}, address: ${data.address || 'not provided'}, callback: ${data.callback_number}`
  },
  
  cleaning: {
    greeting: "Hi, this is the assistant. I can help get your request over to the cleaning team. What can I help with?",
    reasonQuestion: "What type of cleaning service are you looking for?",
    followUpQuestions: [
      "What's the size of the space?",
      "Do you have a preferred day for the cleaning?"
    ],
    urgencyQuestion: "How soon do you need cleaning service?",
    locationQuestion: "What's the cleaning address?",
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, service: ${data.reason_for_call}, urgency: ${data.urgency}, address: ${data.address || 'not provided'}, callback: ${data.callback_number}`
  },
  
  landscaping: {
    greeting: "Hi, this is the assistant. I can help get your request over to the landscaping team. What can I help with?",
    reasonQuestion: "What type of landscaping or lawn care do you need?",
    followUpQuestions: [
      "Could you tell me a bit more about what you're looking for?",
      "Do you have a preferred timeline?"
    ],
    urgencyQuestion: "Is this time-sensitive, or can we schedule for a later date?",
    locationQuestion: "What's the property address?",
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, service: ${data.reason_for_call}, urgency: ${data.urgency}, address: ${data.address || 'not provided'}, callback: ${data.callback_number}`
  },
  
  real_estate: {
    greeting: "Hi, this is the assistant. I can help get your request over to the team. What can I help with?",
    reasonQuestion: "Are you calling about buying, selling, or a property inspection?",
    followUpQuestions: [
      "Could you share a bit more about what you're looking for?",
      "Do you have a specific property in mind?"
    ],
    urgencyQuestion: "How soon are you looking to move forward with this?",
    locationQuestion: "What's the property address or area you're interested in?",
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, interest: ${data.reason_for_call}, urgency: ${data.urgency}, property: ${data.address || 'not provided'}, callback: ${data.callback_number}`
  },
  
  travel_agent: {
    greeting: "Hi, this is the assistant. I can help get your request over to the travel team. What can I help with?",
    reasonQuestion: "What's your travel destination or trip idea?",
    followUpQuestions: [
      "Do you have approximate travel dates in mind?",
      "How many travelers will be going?"
    ],
    urgencyQuestion: "How soon are you planning to travel? Is this time-sensitive?",
    locationQuestion: null, // Don't ask for address for travel
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, destination: ${data.reason_for_call}, urgency: ${data.urgency}, travelers: ${data.travelers || 'not specified'}, callback: ${data.callback_number}`
  },
  
  salon_appointment: {
    greeting: "Hi, this is the assistant. I can help get your request over to the team. What can I help with?",
    reasonQuestion: "What type of appointment are you looking to book?",
    followUpQuestions: [
      "Do you have a preferred date or time?",
      "What services are you interested in?"
    ],
    urgencyQuestion: "How soon would you like to get in?",
    locationQuestion: null, // Don't ask for address for appointments
    callbackTimeQuestion: "What's the best time for us to reach you?",
    callbackNumberQuestion: "What's the best callback number for you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, appointment: ${data.reason_for_call}, urgency: ${data.urgency}, preferred time: ${data.preferred_time || 'not specified'}, callback: ${data.callback_number}`
  },
  
  general_service: {
    greeting: "Hi, this is the assistant. I can help get your request over to the team. What can I help with?",
    reasonQuestion: "What's the reason for your call today?",
    followUpQuestions: [
      "Could you tell me a bit more about what you need?",
      "Is there anything else I should know?"
    ],
    urgencyQuestion: "How urgent is this matter?",
    locationQuestion: null,
    callbackTimeQuestion: null,
    callbackNumberQuestion: "What's the best callback number for the team to reach you?",
    confirmationFormat: (data) => `Name: ${data.caller_name}, reason: ${data.reason_for_call}, urgency: ${data.urgency}, callback: ${data.callback_number}`
  }
}

/**
 * Detect business category from business name or description
 */
export function detectBusinessCategory(businessName: string, businessDescription?: string): BusinessCategory {
  const lowerName = businessName.toLowerCase()
  const lowerDesc = (businessDescription || '').toLowerCase()
  
  // Travel agent keywords
  if (lowerName.includes('travel') || lowerName.includes('vacation') || lowerName.includes('cruise') ||
      lowerDesc.includes('travel') || lowerDesc.includes('vacation') || lowerDesc.includes('cruise') ||
      lowerDesc.includes('trip') || lowerDesc.includes('destination')) {
    return 'travel_agent'
  }
  
  // Plumbing/HVAC keywords
  if (lowerName.includes('plumb') || lowerName.includes('hvac') || lowerName.includes('heating') ||
      lowerName.includes('cooling') || lowerName.includes('air conditioning') ||
      lowerDesc.includes('plumb') || lowerDesc.includes('hvac') || lowerDesc.includes('heating')) {
    return 'plumbing_hvac'
  }
  
  // Cleaning keywords
  if (lowerName.includes('clean') || lowerName.includes('maid') || lowerName.includes('janitorial') ||
      lowerDesc.includes('clean') || lowerDesc.includes('maid')) {
    return 'cleaning'
  }
  
  // Landscaping keywords
  if (lowerName.includes('landscap') || lowerName.includes('lawn') || lowerName.includes('garden') ||
      lowerDesc.includes('landscap') || lowerDesc.includes('lawn') || lowerDesc.includes('garden')) {
    return 'landscaping'
  }
  
  // Real estate keywords
  if (lowerName.includes('real estate') || lowerName.includes('realty') || lowerName.includes('home') ||
      lowerName.includes('property') || lowerName.includes('inspector') ||
      lowerDesc.includes('real estate') || lowerDesc.includes('realty') || lowerDesc.includes('buy') ||
      lowerDesc.includes('sell') || lowerDesc.includes('inspector')) {
    return 'real_estate'
  }
  
  // Salon/appointment keywords
  if (lowerName.includes('salon') || lowerName.includes('spa') || lowerName.includes('barber') ||
      lowerName.includes('hair') || lowerName.includes('beauty') || lowerName.includes('massage') ||
      lowerDesc.includes('salon') || lowerDesc.includes('spa') || lowerDesc.includes('barber') ||
      lowerDesc.includes('appointment') || lowerDesc.includes('booking')) {
    return 'salon_appointment'
  }
  
  // Home services keywords
  if (lowerName.includes('contractor') || lowerName.includes('handyman') || lowerName.includes('repair') ||
      lowerName.includes('service') || lowerName.includes('electric') || lowerName.includes('roofing') ||
      lowerDesc.includes('contractor') || lowerDesc.includes('handyman') || lowerDesc.includes('repair')) {
    return 'home_services'
  }
  
  // Default to general service
  return 'general_service'
}

/**
 * System prompt for OpenAI Realtime API
 */
export function getSystemPrompt(businessName: string, category: BusinessCategory = 'general_service'): string {
  const config = CATEGORY_INTAKE_CONFIG[category]
  
  return `You are ReplyFlow's phone assistant for ${businessName}. Always speak in clear, natural American English. Never switch languages. If the caller speaks another language or the audio is unclear, continue in English.

LANGUAGE REQUIREMENTS:
- You must always speak English. Do not switch languages under any circumstances.
- If the caller speaks another language, politely respond in English and say you can help in English.
- Never infer or switch language based on accent, background noise, short utterances, silence, or unclear audio.
- All responses must be in English regardless of caller's language or audio quality.

Your role is to:
1. Greet the caller professionally in English
2. Collect the following information in a natural conversation:
   - Caller's name
   - Reason for calling (ask naturally: "${config.reasonQuestion}")
   - Urgency level (ask naturally: "${config.urgencyQuestion}")
   - Callback number (ask naturally: "${config.callbackNumberQuestion}")
   ${config.locationQuestion ? `- Location/address (ask naturally: "${config.locationQuestion}")` : ''}
   ${config.callbackTimeQuestion ? `- Best callback time (ask naturally: "${config.callbackTimeQuestion}")` : ''}
3. Ask relevant follow-up questions naturally based on the caller's responses
4. Read back a concise summary of what you captured
5. Ask for final confirmation: "Is that all correct?"
6. If caller confirms (yes, correct, that's right, etc.):
   - Thank the caller
   - End the call
7. If caller corrects something:
   - Update the corrected field
   - Regenerate summary
   - Ask confirmation again
8. Only complete intake after caller confirms the information is correct

Important guidelines:
- Be polite and professional
- Keep responses brief (1-2 sentences)
- Do not make up information you don't have
- If the caller is unclear, ask for clarification in English
- Do not promise anything beyond taking a message
- Always get final confirmation before ending the call
- If caller provides corrections, acknowledge them and ask confirmation again
- Adapt your questions naturally based on the caller's responses
- Don't sound robotic - ask follow-up questions naturally when appropriate

Greeting: "${config.greeting}"

Confirmation question: "Let me confirm what I have. [read summary]. Is that all correct?"

Closing (after confirmation): "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."`
}

/**
 * Intake questions in order - now category-aware
 */
export function getIntakeQuestions(category: BusinessCategory = 'general_service') {
  const config = CATEGORY_INTAKE_CONFIG[category]
  
  const questions = [
    {
      field: 'name',
      question: "May I get your name?",
      prompt: "Ask for the caller's name"
    },
    {
      field: 'reason',
      question: config.reasonQuestion,
      prompt: "Ask for the reason for the call"
    }
  ]
  
  // Add location question if applicable
  if (config.locationQuestion) {
    questions.push({
      field: 'address',
      question: config.locationQuestion,
      prompt: "Ask for the service address or location"
    })
  }
  
  // Add callback time question if applicable
  if (config.callbackTimeQuestion) {
    questions.push({
      field: 'callback_time',
      question: config.callbackTimeQuestion,
      prompt: "Ask for the best callback time"
    })
  }
  
  // Add urgency question
  questions.push({
    field: 'urgency',
    question: config.urgencyQuestion,
    prompt: "Ask for urgency level"
  })
  
  // Add callback number
  questions.push({
    field: 'callback_number',
    question: config.callbackNumberQuestion,
    prompt: "Ask for callback number"
  })
  
  return questions
}

/**
 * Function calling schema for extracting customer information - now with optional fields
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
      },
      address: {
        type: 'string',
        description: "Service address or location (if applicable)"
      },
      callback_time: {
        type: 'string',
        description: "Best time for callback (if applicable)"
      },
      travelers: {
        type: 'string',
        description: "Number of travelers (for travel agents)"
      },
      preferred_time: {
        type: 'string',
        description: "Preferred appointment time (for salons)"
      }
    },
    required: ['caller_name', 'reason_for_call', 'urgency', 'callback_number']
  }
}

/**
 * Generate greeting message - now category-aware
 */
export function getGreeting(businessName: string, category: BusinessCategory = 'general_service'): string {
  console.log('[AI SESSION LANGUAGE LOCK] english')
  const config = CATEGORY_INTAKE_CONFIG[category]
  return config.greeting.replace('${businessName}', businessName)
}

/**
 * Generate closing message
 */
export function getClosing(): string {
  return "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."
}

/**
 * Generate confirmation question with summary - now category-aware
 */
export function getConfirmationQuestion(data: any, category: BusinessCategory = 'general_service'): string {
  console.log('[AI FINAL CONFIRMATION ASKED]', {
    caller_name: data.caller_name,
    reason_for_call: data.reason_for_call,
    urgency: data.urgency,
    callback_number: data.callback_number,
    category
  })
  
  const config = CATEGORY_INTAKE_CONFIG[category]
  const summary = config.confirmationFormat(data)
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
export function logSummaryRegenerated(data: any, category: BusinessCategory = 'general_service'): void {
  console.log('[AI SUMMARY REGENERATED_AFTER_CORRECTION]', {
    ...data,
    category
  })
}

/**
 * Generate summary from extracted data - now category-aware
 */
export function generateSummary(data: any, category: BusinessCategory = 'general_service'): string {
  const config = CATEGORY_INTAKE_CONFIG[category]
  return config.confirmationFormat(data)
}
