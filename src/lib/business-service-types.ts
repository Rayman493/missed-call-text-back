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
  'Dog Grooming',
  'Electrical',
  'Flooring',
  'General Contractor',
  'Handyman',
  'HVAC',
  'Home Inspection',
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
