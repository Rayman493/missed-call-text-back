/**
 * AI Intake Templates for ReplyFlow AI Voice Service
 * Deterministic templates for AI voice intake based on business type
 * Each template defines the structure and flow of questions for different service categories
 */

/**
 * AI Intake Templates
 * Deterministic templates for AI voice intake based on business type
 */
export const INTAKE_TEMPLATES = [
  'on_site',
  'appointment',
  'lessons',
  'professional',
] as const

export type IntakeTemplate = typeof INTAKE_TEMPLATES[number]

/**
 * AI Intake Template Stages
 * Stages in the scripted AI intake flow
 */
export type IntakeStage = 
  | 'ask_name_reason'
  | 'ask_details'
  | 'ask_location_or_context'
  | 'ask_timing'
  | 'ask_callback_time'
  | 'complete'

/**
 * AI Intake Template Config
 * Deterministic scripted text for each stage of the AI intake flow
 * The AI must remain scripted - no dynamic question generation allowed
 */
export const AI_INTAKE_TEMPLATES: Record<IntakeTemplate, Record<IntakeStage, string>> = {
  on_site: {
    ask_name_reason: "Hi, I'm the assistant for the business. Can you please tell me your name and what you're calling about?",
    ask_details: "Got it. Can you share any important details about the work you need?",
    ask_location_or_context: "Thanks. What address or location is this for?",
    ask_timing: "When would you like this work completed?",
    ask_callback_time: "What is the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
  },
  appointment: {
    ask_name_reason: "Hi, I'm the assistant for the business. Can you tell me your name and what service you're interested in?",
    ask_details: "Can you share any important details the business should know?",
    ask_location_or_context: "Will this be at the business location, or do you need mobile service?",
    ask_timing: "When would you like to schedule this appointment?",
    ask_callback_time: "What is the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
  },
  lessons: {
    ask_name_reason: "Hi, I'm the assistant for the business. Can you tell me your name and what type of lessons or coaching you're interested in?",
    ask_details: "Can you share a little more about what you're looking for?",
    ask_location_or_context: "Would you prefer in-person lessons, online lessons, or either?",
    ask_timing: "What days or times generally work best for you?",
    ask_callback_time: "What is the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
  },
  professional: {
    ask_name_reason: "Hi, I'm the assistant for the business. Can you tell me your name and what you'd like help with?",
    ask_details: "Can you share any important details about your situation?",
    ask_location_or_context: "Are you looking for a new consultation, ongoing assistance, or something else?",
    ask_timing: "When would you like to speak with the business?",
    ask_callback_time: "What is the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business and they will get back to you soon. Have a great day."
  }
}

/**
 * Get the scripted text for a specific stage and template
 * @param template - The intake template
 * @param stage - The intake stage
 * @returns The scripted text for that stage
 */
export function getIntakeStageText(template: IntakeTemplate, stage: IntakeStage): string {
  return AI_INTAKE_TEMPLATES[template]?.[stage] || AI_INTAKE_TEMPLATES.on_site[stage]
}

/**
 * Business Type to Intake Template Mapping
 * Maps each business service type to the appropriate AI intake template
 */
export const BUSINESS_TYPE_TO_INTAKE_TEMPLATE: Record<string, IntakeTemplate> = {
  // On-site service businesses (travel to customer location)
  'Appliance Repair': 'on_site',
  'Auto Repair': 'on_site',
  'Carpet Cleaning': 'on_site',
  'Cleaning Service': 'on_site',
  'Concrete / Masonry': 'on_site',
  'Electrical': 'on_site',
  'Flooring': 'on_site',
  'General Contractor': 'on_site',
  'Handyman': 'on_site',
  'HVAC': 'on_site',
  'Home Inspection': 'on_site',
  'Junk Removal': 'on_site',
  'Landscaping / Lawn Care': 'on_site',
  'Locksmith': 'on_site',
  'Moving Company': 'on_site',
  'Painting': 'on_site',
  'Pest Control': 'on_site',
  'Plumbing': 'on_site',
  'Pool Service': 'on_site',
  'Pressure Washing': 'on_site',
  'Remodeling / Renovation': 'on_site',
  'Roofing': 'on_site',
  'Security Systems': 'on_site',
  'Solar Installation': 'on_site',
  'Tree Service': 'on_site',
  'Window Cleaning': 'on_site',
  
  // Appointment-based services (scheduled visits)
  'Dog Grooming': 'appointment',
  
  // Lessons/Instruction (educational services)
  'Lessons / Instruction': 'lessons',
  
  // Professional services (office-based or advisory)
  'Property Management': 'professional',
  'Real Estate': 'professional',
  'Photography': 'professional',
  'Towing': 'on_site',
  
  // Default to on_site for unknown types
  'Other': 'on_site',
}

/**
 * Get the appropriate intake template for a given business type
 * @param businessType - The business service type
 * @param overrideTemplate - Optional override to force a specific template
 * @returns The intake template to use
 */
export function getIntakeTemplateForBusinessType(
  businessType: string,
  overrideTemplate?: IntakeTemplate
): IntakeTemplate {
  // If override is provided, use it
  if (overrideTemplate && INTAKE_TEMPLATES.includes(overrideTemplate)) {
    return overrideTemplate
  }
  
  // Map business type to template, defaulting to on_site for unknown types
  return BUSINESS_TYPE_TO_INTAKE_TEMPLATE[businessType] || 'on_site'
}
