/**
 * Business Service Types
 * Alphabetized list of service types for ReplyFlow's target SMB market
 * Used by both onboarding and settings pages to ensure consistency
 */
export const BUSINESS_SERVICE_TYPES = [
  'Appliance Repair',
  'Auto Repair',
  'Carpet Cleaning',
  'Cleaning Service',
  'Concrete / Masonry',
  'Consulting',
  'Dog Grooming',
  'Electrical',
  'Financial Services',
  'Flooring',
  'General Contractor',
  'Handyman',
  'HVAC',
  'Home Inspection',
  'Insurance',
  'Junk Removal',
  'Landscaping / Lawn Care',
  'Lessons / Instruction',
  'Locksmith',
  'Moving Company',
  'Painting',
  'Pest Control',
  'Photography',
  'Plumbing',
  'Pool Service',
  'Pressure Washing',
  'Property Management',
  'Real Estate',
  'Remodeling / Renovation',
  'Roofing',
  'Security Systems',
  'Solar Installation',
  'Towing',
  'Tree Service',
  'Window Cleaning',
  'Other',
] as const

export type BusinessServiceType = typeof BUSINESS_SERVICE_TYPES[number]

/**
 * AI Intake Templates
 * Deterministic templates for AI voice intake based on business type
 * Each template defines the structure and flow of questions for different service categories
 */
export const INTAKE_TEMPLATES = [
  'on_site',
  'appointment',
  'lessons',
  'professional',
] as const

export type IntakeTemplate = typeof INTAKE_TEMPLATES[number]

/**
 * Business Type to Intake Template Mapping
 * Maps each business service type to the appropriate AI intake template
 * This mapping is code-owned and deterministic, ensuring consistent behavior across the platform
 */
export const BUSINESS_TYPE_TO_INTAKE_TEMPLATE: Record<BusinessServiceType, IntakeTemplate> = {
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
  'Consulting': 'professional',
  'Financial Services': 'professional',
  'Insurance': 'professional',
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
  businessType: BusinessServiceType,
  overrideTemplate?: IntakeTemplate
): IntakeTemplate {
  // If override is provided, use it
  if (overrideTemplate && INTAKE_TEMPLATES.includes(overrideTemplate)) {
    return overrideTemplate
  }
  
  // Map business type to template, defaulting to on_site for unknown types
  return BUSINESS_TYPE_TO_INTAKE_TEMPLATE[businessType] || 'on_site'
}

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
    ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
    ask_details: "Got it. Can you share any important details the business should know?",
    ask_location_or_context: "Thanks. Just a couple more questions. Where will this take place?",
    ask_timing: "When are you hoping this will be done?",
    ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
  },
  appointment: {
    ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
    ask_details: "Got it. Can you share any important details the business should know?",
    ask_location_or_context: "Thanks. Just a couple more questions. Where will this take place?",
    ask_timing: "When are you hoping this will be done?",
    ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
  },
  lessons: {
    ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
    ask_details: "Got it. Can you share any important details the business should know?",
    ask_location_or_context: "Thanks. Just a couple more questions. Where will this take place?",
    ask_timing: "When are you hoping this will be done?",
    ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
  },
  professional: {
    ask_name_reason: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?",
    ask_details: "Got it. Can you share any important details the business should know?",
    ask_location_or_context: "Thanks. Just a couple more questions. Where will this take place?",
    ask_timing: "When are you hoping this will be done?",
    ask_callback_time: "Perfect. Last question—what's the best time for the business to call you back?",
    complete: "Perfect. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
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
