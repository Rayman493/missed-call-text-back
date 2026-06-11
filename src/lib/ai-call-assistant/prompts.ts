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
  | 'pet_grooming'        // pet grooming services
  | 'lessons_tutoring'    // lessons, tutoring
  | 'medical_dental'      // medical, dental practices
  | 'legal_consulting'    // legal, consulting services
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
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "Where is the service location?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: "Where is the service location?",
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.address) parts.push(`Address: ${data.address}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  plumbing_hvac: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "Where is the service location?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: "Where is the service location?",
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.address) parts.push(`Address: ${data.address}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  cleaning: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "What type of cleaning do you need, and where is it?",
      "Can you tell me a little more about that?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: "What type of cleaning do you need, and where is it?",
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.address) parts.push(`Address: ${data.address}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  landscaping: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "Where is the service location?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: "Where is the service location?",
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.address) parts.push(`Address: ${data.address}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  real_estate: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "Where is the property location?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: "Where is the property location?",
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Interest: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.address) parts.push(`Property: ${data.address}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  travel_agent: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "When are you looking to travel?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Destination: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.travelers) parts.push(`Travelers: ${data.travelers}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  salon_appointment: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "When would you like to come in?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Appointment: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.preferred_time) parts.push(`Preferred time: ${data.preferred_time}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  pet_grooming: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "What kind of pet is it, and what service do they need?",
      "Can you tell me a little more about that?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  lessons_tutoring: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Who are the lessons for, and what level are they at?",
      "Can you tell me a little more about that?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Service: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  medical_dental: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "What kind of appointment or issue are you calling about?",
      "Can you tell me a little more about that?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Appointment: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  legal_consulting: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "What would you like to discuss?",
      "Can you tell me a little more about that?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: "What's the best time to call you back?",
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Topic: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  },
  
  general_service: {
    greeting: "Hi, this is the assistant. I can get your request over to the team. What can I help with?",
    reasonQuestion: "What can I help with?",
    followUpQuestions: [
      "Can you tell me a little more about that?",
      "Is there anything else I should know?"
    ],
    urgencyQuestion: "Is this urgent or time-sensitive?",
    locationQuestion: null,
    callbackTimeQuestion: null,
    callbackNumberQuestion: "What's the best callback number?",
    confirmationFormat: (data) => {
      const parts = []
      if (data.caller_name) parts.push(`Name: ${data.caller_name}`)
      if (data.reason_for_call) parts.push(`Reason: ${data.reason_for_call}`)
      if (data.urgency) parts.push(`Urgency: ${data.urgency}`)
      if (data.callback_number) parts.push(`Callback: ${data.callback_number}`)
      return parts.join(', ')
    }
  }
}

/**
 * Detect business category from business name or description
 */
export function detectBusinessCategory(businessName: string, businessDescription?: string): BusinessCategory {
  const lowerName = businessName.toLowerCase()
  const lowerDesc = (businessDescription || '').toLowerCase()
  
  // Pet grooming keywords
  if (lowerName.includes('pet') || lowerName.includes('groom') || lowerName.includes('dog') || lowerName.includes('cat') ||
      lowerName.includes('veterinary') || lowerName.includes('vet') || lowerName.includes('animal') ||
      lowerDesc.includes('pet') || lowerDesc.includes('groom') || lowerDesc.includes('dog') || lowerDesc.includes('cat')) {
    return 'pet_grooming'
  }
  
  // Lessons/tutoring keywords
  if (lowerName.includes('lesson') || lowerName.includes('tutor') || lowerName.includes('teach') || lowerName.includes('education') ||
      lowerName.includes('music') || lowerName.includes('piano') || lowerName.includes('guitar') || lowerName.includes('dance') ||
      lowerDesc.includes('lesson') || lowerDesc.includes('tutor') || lowerDesc.includes('teach') || lowerDesc.includes('education')) {
    return 'lessons_tutoring'
  }
  
  // Medical/dental keywords
  if (lowerName.includes('medical') || lowerName.includes('dental') || lowerName.includes('dentist') || lowerName.includes('doctor') ||
      lowerName.includes('clinic') || lowerName.includes('health') || lowerName.includes('physician') ||
      lowerDesc.includes('medical') || lowerDesc.includes('dental') || lowerDesc.includes('dentist') || lowerDesc.includes('doctor')) {
    return 'medical_dental'
  }
  
  // Legal/consulting keywords
  if (lowerName.includes('legal') || lowerName.includes('law') || lowerName.includes('attorney') || lowerName.includes('lawyer') ||
      lowerName.includes('consult') || lowerName.includes('consulting') || lowerName.includes('firm') ||
      lowerDesc.includes('legal') || lowerDesc.includes('law') || lowerDesc.includes('attorney') || lowerDesc.includes('lawyer')) {
    return 'legal_consulting'
  }
  
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
2. Start by asking what they need help with (reason for calling)
3. Ask for their name naturally if not already provided
4. Collect the following information in a natural conversation:
   - Reason for calling (ask naturally: "${config.reasonQuestion}")
   - Urgency level (ask naturally: "${config.urgencyQuestion}")
   - Callback number (ask naturally: "${config.callbackNumberQuestion}")
   ${config.locationQuestion ? `- Location/address (ask naturally: "${config.locationQuestion}")` : ''}
   ${config.callbackTimeQuestion ? `- Best callback time (ask naturally: "${config.callbackTimeQuestion}")` : ''}
5. Ask relevant follow-up questions naturally based on the caller's responses
6. Read back a concise summary of what you captured (only include fields that were actually provided)
7. Ask for final confirmation: "Did I get that right?"
8. If caller confirms (yes, correct, that's right, etc.):
   - Thank the caller
   - End the call
9. If caller corrects something:
   - Update the corrected field
   - Regenerate summary
   - Ask confirmation again
10. Only complete intake after caller confirms the information is correct

Important guidelines:
- Be friendly, concise, calm, and professional
- Keep responses brief (1-2 sentences)
- Do not make up information you don't have
- If the caller is unclear, ask for clarification in English
- Do not promise anything beyond taking a message
- Always get final confirmation before ending the call
- If caller provides corrections, acknowledge them and ask confirmation again
- Adapt your questions naturally based on the caller's responses
- Don't sound robotic - ask follow-up questions naturally when appropriate
- Extract any fields mentioned opportunistically from caller responses
- Do not ask redundant questions if the caller already provided the information
- Aim to finish the call in 60-90 seconds
- Ask one question at a time
- Avoid long filler
- If caller says "just have them call me", capture callback number/time and end gracefully

Greeting: "${config.greeting}"

Confirmation question: "Did I get that right?"

Closing (after confirmation): "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."`
}

/**
 * Intake questions in order - now adaptive (reason before name)
 */
export function getIntakeQuestions(category: BusinessCategory = 'general_service') {
  const config = CATEGORY_INTAKE_CONFIG[category]
  
  const questions = [
    {
      field: 'reason',
      question: config.reasonQuestion,
      prompt: "Ask for the reason for the call first"
    },
    {
      field: 'name',
      question: "Can I get your name?",
      prompt: "Ask for the caller's name if not already provided"
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
 * Generate confirmation question with summary - now category-aware and excludes placeholders
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
  return `Did I get that right? ${summary}`
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
