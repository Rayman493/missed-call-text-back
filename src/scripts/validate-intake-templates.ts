/**
 * Validation script for AI intake templates
 * Tests template mapping, structure, and guardrails
 */

import {
  BUSINESS_SERVICE_TYPES,
  INTAKE_TEMPLATES,
  IntakeTemplate,
  getIntakeTemplateForBusinessType,
  AI_INTAKE_TEMPLATES,
  getIntakeStageText,
} from '../lib/business-service-types'

// Test result tracking
let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ ${message}`)
    passed++
  } else {
    console.log(`✗ ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    console.log(`✓ ${message}`)
    passed++
  } else {
    console.log(`✗ ${message}`)
    console.log(`  Expected: ${expected}`)
    console.log(`  Actual: ${actual}`)
    failed++
  }
}

function assertNotIncludes(text: string, forbiddenPhrase: string, message: string): void {
  if (!text.toLowerCase().includes(forbiddenPhrase.toLowerCase())) {
    console.log(`✓ ${message}`)
    passed++
  } else {
    console.log(`✗ ${message}`)
    console.log(`  Text contains forbidden phrase: "${forbiddenPhrase}"`)
    failed++
  }
}

console.log('='.repeat(60))
console.log('AI Intake Template Validation')
console.log('='.repeat(60))
console.log()

// Test 1: getIntakeTemplateForBusinessType mapping
console.log('Testing getIntakeTemplateForBusinessType() mapping:')
console.log('-'.repeat(60))

// On-site businesses
assertEqual(
  getIntakeTemplateForBusinessType('Landscaping / Lawn Care'),
  'on_site',
  'Landscaping / Lawn Care => on_site'
)
assertEqual(
  getIntakeTemplateForBusinessType('Plumbing'),
  'on_site',
  'Plumbing => on_site'
)
assertEqual(
  getIntakeTemplateForBusinessType('HVAC'),
  'on_site',
  'HVAC => on_site'
)
assertEqual(
  getIntakeTemplateForBusinessType('Electrical'),
  'on_site',
  'Electrical => on_site'
)
assertEqual(
  getIntakeTemplateForBusinessType('Roofing'),
  'on_site',
  'Roofing => on_site'
)

// Appointment businesses
assertEqual(
  getIntakeTemplateForBusinessType('Dog Grooming'),
  'appointment',
  'Dog Grooming => appointment'
)

// Lessons businesses
assertEqual(
  getIntakeTemplateForBusinessType('Lessons / Instruction'),
  'lessons',
  'Lessons / Instruction => lessons'
)

// Professional businesses
assertEqual(
  getIntakeTemplateForBusinessType('Real Estate'),
  'professional',
  'Real Estate => professional'
)
assertEqual(
  getIntakeTemplateForBusinessType('Property Management'),
  'professional',
  'Property Management => professional'
)

console.log()

// Test 2: Fallback behavior
console.log('Testing fallback behavior:')
console.log('-'.repeat(60))

assertEqual(
  getIntakeTemplateForBusinessType('Other'),
  'on_site',
  'Unknown business type => on_site'
)

console.log()

// Test 3: Override behavior
console.log('Testing override behavior:')
console.log('-'.repeat(60))

assertEqual(
  getIntakeTemplateForBusinessType('Plumbing', 'lessons'),
  'lessons',
  'Override template wins over business type mapping'
)
assertEqual(
  getIntakeTemplateForBusinessType('Dog Grooming', 'on_site'),
  'on_site',
  'Override can change template to any valid value'
)

console.log()

// Test 4: AI_INTAKE_TEMPLATES structure
console.log('Testing AI_INTAKE_TEMPLATES structure:')
console.log('-'.repeat(60))

const requiredStages = [
  'ask_name_reason',
  'ask_details',
  'ask_location_or_context',
  'ask_timing',
  'ask_callback_time',
  'complete'
]

for (const template of INTAKE_TEMPLATES) {
  const templateConfig = AI_INTAKE_TEMPLATES[template]
  assert(
    templateConfig !== undefined,
    `Template ${template} exists in AI_INTAKE_TEMPLATES`
  )
  
  for (const stage of requiredStages) {
    assert(
      templateConfig !== undefined && templateConfig[stage as keyof typeof templateConfig] !== undefined,
      `Template ${template} has stage ${stage}`
    )
    assert(
      templateConfig !== undefined && templateConfig[stage as keyof typeof templateConfig] !== '',
      `Template ${template} stage ${stage} has non-empty text`
    )
  }
}

console.log()

// Test 5: Complete sentence consistency
console.log('Testing complete sentence consistency:')
console.log('-'.repeat(60))

const completeSentence = AI_INTAKE_TEMPLATES.on_site.complete
for (const template of INTAKE_TEMPLATES) {
  assertEqual(
    AI_INTAKE_TEMPLATES[template].complete,
    completeSentence,
    `Template ${template} has same complete sentence as on_site`
  )
}

console.log()

// Test 6: Guardrail tests - forbidden phrases
console.log('Testing guardrails - forbidden phrases:')
console.log('-'.repeat(60))

const forbiddenPhrases = [
  'phone number',
  'urgency',
  'is this correct',
  'anything else',
]

for (const template of INTAKE_TEMPLATES) {
  const templateConfig = AI_INTAKE_TEMPLATES[template]
  for (const stage of requiredStages) {
    const text = templateConfig[stage as keyof typeof templateConfig]
    for (const phrase of forbiddenPhrases) {
      assertNotIncludes(
        text,
        phrase,
        `Template ${template} stage ${stage} does not contain "${phrase}"`
      )
    }
  }
}

console.log()

// Test 7: getIntakeStageText helper
console.log('Testing getIntakeStageText() helper:')
console.log('-'.repeat(60))

assertEqual(
  getIntakeStageText('on_site', 'ask_name_reason'),
  AI_INTAKE_TEMPLATES.on_site.ask_name_reason,
  'getIntakeStageText returns correct text for on_site'
)
assertEqual(
  getIntakeStageText('appointment', 'ask_details'),
  AI_INTAKE_TEMPLATES.appointment.ask_details,
  'getIntakeStageText returns correct text for appointment'
)
assertEqual(
  getIntakeStageText('lessons' as IntakeTemplate, 'complete'),
  AI_INTAKE_TEMPLATES.lessons.complete,
  'getIntakeStageText returns correct text for lessons'
)

console.log()

// Summary
console.log('='.repeat(60))
console.log('Validation Summary')
console.log('='.repeat(60))
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log()

if (failed === 0) {
  console.log('✓ All tests passed!')
  process.exit(0)
} else {
  console.log('✗ Some tests failed!')
  process.exit(1)
}
