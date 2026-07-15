/**
 * Test cases for parseNameAndService function
 * Tests two-sentence combined name/reason patterns and completion repair logic
 */

// Validation functions (copied from index.ts for testing)
const isValidCustomerName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length > 50) return false;
  const servicePhrases = [
    "i'm calling because",
    "i am calling because",
    "i need",
    "calling about",
    "looking for",
    "i want to",
    "i would like"
  ];
  const lowerName = trimmed.toLowerCase();
  if (servicePhrases.some(phrase => lowerName.includes(phrase))) return false;
  if (lowerName.includes("leaking") || lowerName.includes("stopped working") || lowerName.includes("clogged")) return false;
  return true;
};

const isValidServiceRequested = (service: string): boolean => {
  if (!service || typeof service !== 'string') return false;
  const trimmed = service.trim();
  const nameIntroPatterns = [
    /^hi, this is .+$/i,
    /^this is .+$/i,
    /^my name is .+$/i,
    /^my name's .+$/i,
    /^i'm .+$/i,
    /^i am .+$/i
  ];
  if (nameIntroPatterns.some(pattern => pattern.test(trimmed))) return false;
  return true;
};

// parseNameAndService function (simplified version for testing)
const parseNameAndService = (text: string, existingService?: string): { customerName: string; serviceRequested: string } => {
  if (!text || typeof text !== 'string') {
    return { customerName: '', serviceRequested: existingService ?? '' };
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // NEW: Filler prefix normalization - strip harmless conversational fillers at start
  // Allowed fillers: yeah, yep, yes, uh, um, well, so, okay, ok, alright, hi, hey
  // Allow short filler combinations like "uh yeah", "well yeah", "yeah so"
  // Handle optional trailing punctuation: comma, period, dash
  // IMPORTANT: Use lookahead to ensure filler is followed by comma, space, or end of string (not part of a word)
  const normalizeFillerPrefix = (input: string): string => {
    const fillerPattern = /^(?:(?:yeah|yep|yes|uh|um|well|so|okay|ok|alright|hi|hey)(?=[,\s]|$)[,\s]*){1,2}/i;
    return input.replace(fillerPattern, '').trim();
  };

  const parseText = normalizeFillerPrefix(trimmed);

  // Split on sentence boundaries for two-sentence patterns
  const sentenceSplitPatterns = [/\.\s+/i, /\.\n/i, /\n/i];
  let sentences: string[] = [parseText];
  for (const pattern of sentenceSplitPatterns) {
    if (pattern.test(parseText)) {
      sentences = parseText.split(pattern).map(s => s.trim()).filter(s => s.length > 0);
      break;
    }
  }

  // If we have multiple sentences, first sentence likely contains name, second contains reason
  if (sentences.length > 1) {
    const firstSentence = sentences[0];
    const secondSentence = sentences.slice(1).join(' ');
    
    // Extract name from first sentence
    let name = '';
    const namePatterns = [
      /(?:hi|hello|hey)[,\s]*(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i,
      /(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i,
      /^([a-z\s]+?)(?:\.|$)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = firstSentence.match(pattern);
      if (match && match[1]) {
        name = match[1].trim();
        break;
      }
    }

    // Extract service from second sentence
    let service = existingService ?? '';
    if (!service) {
      const servicePatterns = [
        /(?:i'm calling because|i am calling because|calling about|looking for|i need|i want to|i would like)\s+(.+)/i,
        /(.+)/i
      ];
      
      for (const pattern of servicePatterns) {
        const match = secondSentence.match(pattern);
        if (match && match[1]) {
          service = match[1].trim();
          break;
        }
      }
    }

    return { customerName: name, serviceRequested: service };
  }

  // NEW: Comma-separated pattern handling for natural responses
  // Pattern: "Sarah Johnson, my air conditioner stopped working."
  // Safety: Left side must look like a plausible human name, not a service/problem statement
  const commaIndex = parseText.indexOf(',');
  if (commaIndex > 0 && commaIndex < parseText.length - 1) {
    const leftSide = parseText.slice(0, commaIndex).trim();
    const rightSide = parseText.slice(commaIndex + 1).trim();
    
    // Safety check: Left side must look like a plausible name
    const looksLikeName = (candidate: string): boolean => {
      const trimmedCandidate = candidate.trim();
      const lowerCandidate = trimmedCandidate.toLowerCase();
      
      // Must be short (2-4 words typical for names)
      const wordCount = trimmedCandidate.split(/\s+/).length;
      if (wordCount < 2 || wordCount > 4) return false;
      
      // Must be primarily alphabetic (allow apostrophes, hyphens, spaces)
      const alphaRatio = (trimmedCandidate.match(/[a-z]/gi) || []).length / trimmedCandidate.length;
      if (alphaRatio < 0.7) return false;
      
      // Must NOT contain service/problem language
      const servicePhrases = [
        "i need", "i'm calling", "i am calling", "calling about",
        "my sink", "my air conditioner", "my kitchen", "my bathroom",
        "the pipe", "the toilet", "the faucet", "the water",
        "looking for", "looking to", "need someone", "want to",
        "would like", "leaking", "clogged", "stopped working",
        "broken", "not working", "issue", "problem"
      ];
      if (servicePhrases.some(phrase => lowerCandidate.includes(phrase))) return false;
      
      // Must NOT begin with common service phrases
      const invalidStarts = [
        "i need", "i'm", "i am", "calling", "looking", "need",
        "my sink", "my air", "my kitchen", "my bathroom", "my toilet",
        "the pipe", "the toilet", "the faucet", "the water"
      ];
      if (invalidStarts.some(start => lowerCandidate.startsWith(start))) return false;
      
      return true;
    };
    
    // Safety check: Right side must look like a plausible service (not a name introduction)
    const looksLikeService = (candidate: string): boolean => {
      const trimmedCandidate = candidate.trim();
      const lowerCandidate = trimmedCandidate.toLowerCase();
      
      // Must NOT be a name introduction
      const nameIntroPatterns = [
        /^hi, this is .+$/i,
        /^this is .+$/i,
        /^my name is .+$/i,
        /^my name's .+$/i,
        /^i'm .+$/i,
        /^i am .+$/i
      ];
      if (nameIntroPatterns.some(pattern => pattern.test(trimmedCandidate))) return false;
      
      return true;
    };
    
    // If both sides pass safety checks, use the comma-separated split
    if (looksLikeName(leftSide) && looksLikeService(rightSide)) {
      const nameCandidate = leftSide;
      const serviceCandidate = rightSide.replace(/[.,;]\s*$/, '');
      
      if (nameCandidate && serviceCandidate) {
        return { customerName: nameCandidate, serviceRequested: serviceCandidate };
      }
    }
  }

  // Single sentence fallback
  let name = '';
  let service = existingService ?? '';

  const namePatterns = [
    /(?:hi|hello|hey)[,\s]*(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i,
    /(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i
  ];

  for (const pattern of namePatterns) {
    const match = parseText.match(pattern);
    if (match && match[1]) {
      name = match[1].trim();
      break;
    }
  }

  const servicePatterns = [
    /(?:i'm calling because|i am calling because|calling about|looking for|i need|i want to|i would like)\s+(.+)/i
  ];

  for (const pattern of servicePatterns) {
    const match = parseText.match(pattern);
    if (match && match[1] && !service) {
      service = match[1].trim();
      break;
    }
  }

  // Fallback: if no service matched and no name was found, check if text contains service phrases
  // This handles cases like "Yeah, my kitchen sink is leaking." after filler normalization
  // But NOT pure problem statements like "My kitchen sink is leaking, and it is getting worse."
  if (!service && !name) {
    const servicePhrases = [
      "i need", "i want", "i'd like", "i would like", "i'm calling", "i am calling",
      "calling about", "looking for", "looking to", "need someone", "trying to"
    ];
    const hasServicePhrase = servicePhrases.some(phrase => parseText.toLowerCase().includes(phrase));
    if (hasServicePhrase) {
      service = parseText;
    }
  }

  return { customerName: name, serviceRequested: service };
};

// Test cases
const testCases = [
  {
    description: "Two-sentence pattern: Hi, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    input: "Hi, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    expectedName: "Mike Thompson",
    expectedService: "my kitchen sink has been leaking."
  },
  {
    description: "Two-sentence pattern: This is John Smith. I need a plumber.",
    input: "This is John Smith. I need a plumber.",
    expectedName: "John Smith",
    expectedService: "a plumber."
  },
  {
    description: "Two-sentence pattern: My name is Sarah Johnson. Calling about a broken water heater.",
    input: "My name is Sarah Johnson. Calling about a broken water heater.",
    expectedName: "Sarah Johnson",
    expectedService: "a broken water heater."
  },
  {
    description: "Single sentence with name only: Hi, this is Tom Wilson.",
    input: "Hi, this is Tom Wilson.",
    expectedName: "Tom Wilson",
    expectedService: "",
    expectNameValid: true,
    expectServiceValid: false
  },
  {
    description: "Single sentence with service only: I need help with a clogged drain.",
    input: "I need help with a clogged drain.",
    expectedName: "",
    expectedService: "help with a clogged drain.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "Two-sentence with existing service preserved",
    input: "Hi, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    existingService: "existing service",
    expectedName: "Mike Thompson",
    expectedService: "existing service"
  },
  // Comma-separated pattern tests
  {
    description: "Comma-separated: Sarah Johnson, my air conditioner stopped working.",
    input: "Sarah Johnson, my air conditioner stopped working.",
    expectedName: "Sarah Johnson",
    expectedService: "my air conditioner stopped working"
  },
  {
    description: "Comma-separated: Mike Thompson, my kitchen sink is leaking.",
    input: "Mike Thompson, my kitchen sink is leaking.",
    expectedName: "Mike Thompson",
    expectedService: "my kitchen sink is leaking"
  },
  {
    description: "Comma-separated: John Smith, I need an estimate for a new deck.",
    input: "John Smith, I need an estimate for a new deck.",
    expectedName: "John Smith",
    expectedService: "I need an estimate for a new deck"
  },
  {
    description: "Comma-separated: Maria Garcia, calling about getting my house cleaned.",
    input: "Maria Garcia, calling about getting my house cleaned.",
    expectedName: "Maria Garcia",
    expectedService: "calling about getting my house cleaned"
  },
  {
    description: "Comma-separated: Yesenia Noel, my sink is clogged.",
    input: "Yesenia Noel, my sink is clogged.",
    expectedName: "Yesenia Noel",
    expectedService: "my sink is clogged"
  },
  // Filler prefix regression tests
  {
    description: "Filler prefix: Yeah, this is David Miller. I'm calling because my garage door has been acting weird and now won't open all the way.",
    input: "Yeah, this is David Miller. I'm calling because my garage door has been acting weird and now won't open all the way.",
    expectedName: "David Miller",
    expectedService: "my garage door has been acting weird and now won't open all the way."
  },
  {
    description: "Filler prefix: Uh, this is John Smith. I need a plumber.",
    input: "Uh, this is John Smith. I need a plumber.",
    expectedName: "John Smith",
    expectedService: "a plumber."
  },
  {
    description: "Filler prefix: Well, my name is Sarah Johnson. Calling about a broken water heater.",
    input: "Well, my name is Sarah Johnson. Calling about a broken water heater.",
    expectedName: "Sarah Johnson",
    expectedService: "a broken water heater."
  },
  {
    description: "Filler prefix: Hey, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    input: "Hey, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    expectedName: "Mike Thompson",
    expectedService: "my kitchen sink has been leaking."
  },
  {
    description: "Filler prefix: Alright, this is Yesenia Noel. My sink is clogged.",
    input: "Alright, this is Yesenia Noel. My sink is clogged.",
    expectedName: "Yesenia Noel",
    expectedService: "My sink is clogged."
  },
  {
    description: "Filler prefix: Um, this is Tom Wilson. I need help with a clogged drain.",
    input: "Um, this is Tom Wilson. I need help with a clogged drain.",
    expectedName: "Tom Wilson",
    expectedService: "help with a clogged drain."
  },
  {
    description: "Filler prefix: Okay, this is Maria Garcia. Calling about getting my house cleaned.",
    input: "Okay, this is Maria Garcia. Calling about getting my house cleaned.",
    expectedName: "Maria Garcia",
    expectedService: "getting my house cleaned."
  },
  {
    description: "Filler prefix: So, this is David Miller. I'm calling because my garage door has been acting weird.",
    input: "So, this is David Miller. I'm calling because my garage door has been acting weird.",
    expectedName: "David Miller",
    expectedService: "my garage door has been acting weird."
  },
  {
    description: "Filler prefix: Uh yeah, this is John Smith. I need a plumber.",
    input: "Uh yeah, this is John Smith. I need a plumber.",
    expectedName: "John Smith",
    expectedService: "a plumber."
  },
  {
    description: "Filler prefix: Well yeah, this is Sarah Johnson. Calling about a broken water heater.",
    input: "Well yeah, this is Sarah Johnson. Calling about a broken water heater.",
    expectedName: "Sarah Johnson",
    expectedService: "a broken water heater."
  },
  {
    description: "Filler prefix: Yeah so, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    input: "Yeah so, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    expectedName: "Mike Thompson",
    expectedService: "my kitchen sink has been leaking."
  },
  // False-positive protection tests for filler stripping
  // Key requirement: These must NOT extract a customer name
  {
    description: "False-positive: My kitchen sink is leaking, and it is getting worse.",
    input: "My kitchen sink is leaking, and it is getting worse.",
    expectedName: "",
    expectedService: "", // Service extraction varies, focus on name validation
    expectNameValid: false,
    expectServiceValid: false // Allow empty service
  },
  {
    description: "False-positive: I need a plumber, preferably sometime today.",
    input: "I need a plumber, preferably sometime today.",
    expectedName: "",
    expectedService: "a plumber, preferably sometime today.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive: The pipe under my sink, near the cabinet, is leaking.",
    input: "The pipe under my sink, near the cabinet, is leaking.",
    expectedName: "",
    expectedService: "", // Service extraction varies, focus on name validation
    expectNameValid: false,
    expectServiceValid: false // Allow empty service
  },
  {
    description: "False-positive filler: Yeah, my kitchen sink is leaking.",
    input: "Yeah, my kitchen sink is leaking.",
    expectedName: "",
    expectedService: "", // No explicit service phrase, so no service extraction
    expectNameValid: false,
    expectServiceValid: false
  },
  {
    description: "False-positive filler: Uh, I need a plumber.",
    input: "Uh, I need a plumber.",
    expectedName: "",
    expectedService: "a plumber.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: Well, my air conditioner stopped working.",
    input: "Well, my air conditioner stopped working.",
    expectedName: "",
    expectedService: "", // No explicit service phrase, so no service extraction
    expectNameValid: false,
    expectServiceValid: false
  },
  {
    description: "False-positive filler: Hey, calling about a broken water heater.",
    input: "Hey, calling about a broken water heater.",
    expectedName: "",
    expectedService: "a broken water heater.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: Alright, my sink is clogged.",
    input: "Alright, my sink is clogged.",
    expectedName: "",
    expectedService: "", // No explicit service phrase, so no service extraction
    expectNameValid: false,
    expectServiceValid: false
  },
  {
    description: "False-positive filler: Um, I need help with a clogged drain.",
    input: "Um, I need help with a clogged drain.",
    expectedName: "",
    expectedService: "help with a clogged drain.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: Okay, looking for a plumber.",
    input: "Okay, looking for a plumber.",
    expectedName: "",
    expectedService: "a plumber.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: So, I need someone to fix my garage door.",
    input: "So, I need someone to fix my garage door.",
    expectedName: "",
    expectedService: "someone to fix my garage door.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: Uh yeah, my kitchen sink is leaking.",
    input: "Uh yeah, my kitchen sink is leaking.",
    expectedName: "",
    expectedService: "", // No explicit service phrase, so no service extraction
    expectNameValid: false,
    expectServiceValid: false
  },
  {
    description: "False-positive filler: Well yeah, I need a plumber.",
    input: "Well yeah, I need a plumber.",
    expectedName: "",
    expectedService: "a plumber.",
    expectNameValid: false,
    expectServiceValid: true
  },
  {
    description: "False-positive filler: Yeah so, my air conditioner stopped working.",
    input: "Yeah so, my air conditioner stopped working.",
    expectedName: "",
    expectedService: "", // No explicit service phrase, so no service extraction
    expectNameValid: false,
    expectServiceValid: false
  }
];

console.log('=== PARSE NAME AND SERVICE TEST CASES ===\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = parseNameAndService(testCase.input, testCase.existingService);
  const nameMatch = result.customerName === testCase.expectedName;
  const serviceMatch = result.serviceRequested === testCase.expectedService;
  const nameValid = isValidCustomerName(result.customerName);
  const serviceValid = isValidServiceRequested(result.serviceRequested);
  
  const expectNameValid = testCase.expectNameValid !== undefined ? testCase.expectNameValid : true;
  const expectServiceValid = testCase.expectServiceValid !== undefined ? testCase.expectServiceValid : true;
  
  if (nameMatch && serviceMatch && nameValid === expectNameValid && serviceValid === expectServiceValid) {
    console.log(`✓ PASS: ${testCase.description}`);
    console.log(`  Name: "${result.customerName}" (valid: ${nameValid})`);
    console.log(`  Service: "${result.serviceRequested}" (valid: ${serviceValid})\n`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${testCase.description}`);
    console.log(`  Expected name: "${testCase.expectedName}", got: "${result.customerName}" (valid: ${nameValid}, expected valid: ${expectNameValid})`);
    console.log(`  Expected service: "${testCase.expectedService}", got: "${result.serviceRequested}" (valid: ${serviceValid}, expected valid: ${expectServiceValid})\n`);
    failed++;
  }
}

console.log('=== TEST SUMMARY ===');
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

// Test completion repair logic
console.log('\n=== COMPLETION REPAIR TEST ===\n');

const repairTestCases = [
  {
    description: "Repair with preserved raw transcript",
    rawFirstStageTranscript: "Hi, this is Mike Thompson. I'm calling because my kitchen sink has been leaking.",
    intakeCustomerName: "",
    intakeServiceRequested: "",
    expectedName: "Mike Thompson",
    expectedService: "my kitchen sink has been leaking."
  },
  {
    description: "Repair with invalid intake values falls back to raw transcript",
    rawFirstStageTranscript: "This is John Smith. I need a plumber.",
    intakeCustomerName: "Hi, this is John Smith. I need a plumber.",
    intakeServiceRequested: "",
    expectedName: "John Smith",
    expectedService: "a plumber."
  },
  {
    description: "Repair with no raw transcript uses intake values",
    rawFirstStageTranscript: null,
    intakeCustomerName: "My name is Sarah Johnson",
    intakeServiceRequested: "Calling about a broken water heater",
    expectedName: "Sarah Johnson",
    expectedService: "Calling about a broken water heater"
  },
  // Comma-separated repair tests
  {
    description: "Repair with comma-separated raw transcript",
    rawFirstStageTranscript: "Sarah Johnson, my air conditioner stopped working.",
    intakeCustomerName: "",
    intakeServiceRequested: "",
    expectedName: "Sarah Johnson",
    expectedService: "my air conditioner stopped working"
  },
  // Filler prefix repair test
  {
    description: "Repair with filler prefix raw transcript",
    rawFirstStageTranscript: "Yeah, this is David Miller. I'm calling because my garage door has been acting weird and now won't open all the way.",
    intakeCustomerName: "",
    intakeServiceRequested: "",
    expectedName: "David Miller",
    expectedService: "my garage door has been acting weird and now won't open all the way."
  }
];

for (const testCase of repairTestCases) {
  const repairSource = testCase.rawFirstStageTranscript || testCase.intakeCustomerName || '';
  const result = parseNameAndService(repairSource, testCase.intakeServiceRequested || undefined);
  const nameMatch = result.customerName === testCase.expectedName;
  const serviceMatch = result.serviceRequested === testCase.expectedService;
  
  if (nameMatch && serviceMatch) {
    console.log(`✓ PASS: ${testCase.description}`);
    console.log(`  Repair source: "${repairSource}"`);
    console.log(`  Name: "${result.customerName}"`);
    console.log(`  Service: "${result.serviceRequested}"\n`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${testCase.description}`);
    console.log(`  Repair source: "${repairSource}"`);
    console.log(`  Expected name: "${testCase.expectedName}", got: "${result.customerName}"`);
    console.log(`  Expected service: "${testCase.expectedService}", got: "${result.serviceRequested}"\n`);
    failed++;
  }
}

console.log('=== FINAL TEST SUMMARY ===');
console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
