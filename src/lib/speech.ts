/**
 * Speech helper functions for Twilio TTS optimization
 * Converts business display names into speech-friendly names for voice prompts
 */

/**
 * Common business suffix mappings for speech
 */
const BUSINESS_SUFFIXES: { [key: string]: string } = {
  'LLC': 'L L C',
  'Inc': 'Incorporated',
  'Inc.': 'Incorporated',
  'Co': 'Company',
  'Co.': 'Company',
  'Corp': 'Corporation',
  'Corp.': 'Corporation',
  'Ltd': 'Limited',
  'Ltd.': 'Limited'
}

/**
 * Common acronyms that should be spelled out
 */
const COMMON_ACRONYMS: { [key: string]: string } = {
  'HQ': 'H Q',
  'HVAC': 'H V A C',
  'LLC': 'L L C',
  'USA': 'U S A',
  'API': 'A P I',
  'SEO': 'S E O',
  'AI': 'A I',
  'CEO': 'C E O',
  'CTO': 'C T O',
  'CFO': 'C F O',
  'COO': 'C O O',
  'VP': 'V P',
  'HR': 'H R',
  'PR': 'P R',
  'IT': 'I T',
  'TV': 'T V',
  'WiFi': 'Wi Fi',
  'IoT': 'I O T'
}

/**
 * Converts business display names into speech-friendly names for Twilio TTS
 * 
 * Examples:
 * ReplyFlowHQ -> Reply Flow H Q
 * HVACPros -> H V A C Pros
 * SmithRoofingLLC -> Smith Roofing L L C
 * MikeAndSonsPlumbing -> Mike And Sons Plumbing
 * JoesAutoRepair -> Joes Auto Repair
 * ABC123Services -> A B C 123 Services
 * Best4LessHVAC -> Best 4 Less H V A C
 * 
 * @param name Business name (optional)
 * @returns Speech-friendly business name
 */
export function getSpokenBusinessName(name?: string | null): string {
  // Return default if no name provided
  if (!name || name.trim() === '') {
    return 'this business'
  }

  let spokenName = name.trim()

  // Handle special symbols first
  spokenName = spokenName.replace(/&/g, ' and ')
  spokenName = spokenName.replace(/@/g, ' at ')

  // Add spacing between letters and numbers
  spokenName = spokenName.replace(/([a-zA-Z])(\d)/g, '$1 $2')
  spokenName = spokenName.replace(/(\d)([a-zA-Z])/g, '$1 $2')

  // Split common acronyms into readable letters
  Object.entries(COMMON_ACRONYMS).forEach(([acronym, spoken]) => {
    const regex = new RegExp(`\\b${acronym}\\b`, 'g')
    spokenName = spokenName.replace(regex, spoken)
  })

  // Clean business suffixes for speech
  Object.entries(BUSINESS_SUFFIXES).forEach(([suffix, spoken]) => {
    const regex = new RegExp(`\\b${suffix}\\b`, 'g')
    spokenName = spokenName.replace(regex, spoken)
  })

  // Add spacing between camel case / Pascal case words
  // This handles cases like: ReplyFlowHQ -> Reply Flow H Q
  spokenName = spokenName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // lowerUpper -> lower Upper
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // UpperUpperLower -> Upper UpperLower
    .replace(/([a-zA-Z])([A-Z][a-z])/g, '$1 $2') // mixedUpperLower -> mixed UpperLower

  // Handle multiple consecutive uppercase letters (acronyms)
  // This catches cases like "ABC" that weren't in our common acronyms list
  spokenName = spokenName.replace(/([A-Z]{2,})(?=[a-z])/g, (match) => {
    return match.split('').join(' ')
  })

  // Normalize extra spaces
  spokenName = spokenName.replace(/\s+/g, ' ').trim()

  // Handle edge case where result might be empty after processing
  if (spokenName === '') {
    return 'this business'
  }

  return spokenName
}

/**
 * Test examples for verification
 * These are commented out but can be used for manual testing
 */
/*
// Test cases:
const testCases = [
  { input: 'ReplyFlowHQ', expected: 'Reply Flow H Q' },
  { input: 'HVACPros', expected: 'H V A C Pros' },
  { input: 'SmithRoofingLLC', expected: 'Smith Roofing L L C' },
  { input: 'MikeAndSonsPlumbing', expected: 'Mike And Sons Plumbing' },
  { input: 'JoesAutoRepair', expected: 'Joes Auto Repair' },
  { input: 'ABC123Services', expected: 'A B C 123 Services' },
  { input: 'Best4LessHVAC', expected: 'Best 4 Less H V A C' },
  { input: 'Smith Roofing', expected: 'Smith Roofing' },
  { input: "Joe's Auto Repair", expected: "Joe's Auto Repair" },
  { input: 'Mike & Sons', expected: 'Mike and Sons' },
  { input: 'TechCorp Inc.', expected: 'Tech Corp Incorporated' },
  { input: '', expected: 'this business' },
  { input: null, expected: 'this business' },
  { input: 'CEO@Company', expected: 'C E O at Company' },
  { input: 'WiFiServices', expected: 'Wi Fi Services' }
]

// Manual test function:
function testGetSpokenBusinessName() {
  testCases.forEach(({ input, expected }) => {
    const result = getSpokenBusinessName(input)
    console.log(`Input: "${input}" -> "${result}" (Expected: "${expected}")`)
    console.log(result === expected ? '✅ PASS' : '❌ FAIL')
    console.log('---')
  })
}

// Uncomment to run tests:
// testGetSpokenBusinessName()
*/
