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

  // Split on sentence boundaries for two-sentence patterns
  const sentenceSplitPatterns = [/\.\s+/i, /\.\n/i, /\n/i];
  let sentences: string[] = [trimmed];
  for (const pattern of sentenceSplitPatterns) {
    if (pattern.test(trimmed)) {
      sentences = trimmed.split(pattern).map(s => s.trim()).filter(s => s.length > 0);
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

  // Single sentence fallback
  let name = '';
  let service = existingService ?? '';

  const namePatterns = [
    /(?:hi|hello|hey)[,\s]*(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i,
    /(?:this is|i am|i'm|my name is|my name's)\s+([a-z\s]+?)(?:\.|$)/i
  ];

  for (const pattern of namePatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      name = match[1].trim();
      break;
    }
  }

  const servicePatterns = [
    /(?:i'm calling because|i am calling because|calling about|looking for|i need|i want to|i would like)\s+(.+)/i
  ];

  for (const pattern of servicePatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1] && !service) {
      service = match[1].trim();
      break;
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
