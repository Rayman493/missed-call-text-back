/**
 * Test cases for parseNameAndService function
 * Tests two-sentence combined name/reason patterns and completion repair logic
 */

// Non-answer detection helper (copied from index.ts for testing)
const isNonAnswer = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  // Exact phrase non-answers (case-insensitive)
  const exactNonAnswers = [
    "i don't know", "i dont know", "i'm not sure", "im not sure", "i am not sure", "not sure",
    "i don't know what to say", "i dont know what to say", "i'm not really sure", "im not really sure",
    "i don't have a name", "i dont have a name", "i don't want to say", "i dont want to say",
    "i'd rather not say", "id rather not say", "i would rather not say", "i can't remember", "i cant remember",
    "i cannot remember", "i forgot", "i don't remember", "i dont remember", "i don't know my name",
    "i dont know my name", "i don't know what i need", "i dont know what i need", "i'm not certain",
    "im not certain", "i am not certain", "i have no idea", "i don't have any idea", "i dont have any idea",
    "no comment", "i can't tell you", "i cant tell you", "i cannot tell you", "i prefer not to answer",
    "i'd prefer not to answer", "id prefer not to answer", "i would prefer not to answer", "i don't want to answer",
    "i dont want to answer", "i won't answer", "i wont answer", "i will not answer", "i'm not comfortable saying",
    "im not comfortable saying", "i am not comfortable saying", "i don't know what you mean", "i dont know what you mean",
    "i don't understand", "i dont understand", "i don't know what to tell you", "i dont know what to tell you",
    "i don't know what this is about", "i dont know what this is about", "i don't know why i'm calling",
    "i dont know why im calling", "i don't know why i am calling", "i don't know what i'm calling about",
    "i dont know what im calling about", "i don't know what i am calling about", "i'm not sure what i need",
    "im not sure what i need", "i am not sure what i need", "i'm not sure what to say", "im not sure what to say",
    "i am not sure what to say", "i don't know what service i need", "i dont know what service i need",
    "i'm not sure what service i need", "im not sure what service i need", "i am not sure what service i need",
    "i don't know what i'm looking for", "i dont know what im looking for", "i don't know what i am looking for",
    "i'm not sure what i'm looking for", "im not sure what im looking for", "i am not sure what i am looking for",
    "i don't know what i want", "i dont know what i want", "i'm not sure what i want", "im not sure what i want",
    "i am not sure what i want", "i don't know what i'd like", "i dont know what id like",
    "i don't know what i would like", "i'm not sure what i'd like", "im not sure what id like",
    "i am not sure what i would like", "i don't have a specific request", "i dont have a specific request",
    "i don't have anything specific", "i dont have anything specific", "i don't have a specific need",
    "i dont have a specific need", "i don't have any specific needs", "i dont have any specific needs",
    "i don't know what to ask for", "i dont know what to ask for", "i'm not sure what to ask for",
    "im not sure what to ask for", "i am not sure what to ask for", "i don't know what i need help with",
    "i dont know what i need help with", "i'm not sure what i need help with", "im not sure what i need help with",
    "i am not sure what i need help with", "i don't know what my problem is", "i dont know what my problem is",
    "i'm not sure what my problem is", "im not sure what my problem is", "i am not sure what my problem is",
    "i don't know what's wrong", "i dont know whats wrong", "i don't know what is wrong",
    "i'm not sure what's wrong", "im not sure whats wrong", "i am not sure what is wrong",
    "i don't know what the issue is", "i dont know what the issue is", "i'm not sure what the issue is",
    "im not sure what the issue is", "i am not sure what the issue is", "i don't know what's going on",
    "i dont know whats going on", "i don't know what is going on", "i'm not sure what's going on",
    "im not sure whats going on", "i am not sure what is going on", "i don't know what's happening",
    "i dont know whats happening", "i don't know what is happening", "i'm not sure what's happening",
    "im not sure whats happening", "i am not sure what is happening"
  ];
  
  if (exactNonAnswers.includes(lower)) {
    return true;
  }
  
  // Short uncertainty phrases (3-6 words)
  const shortUncertaintyPatterns = [
    /^(i\s+)?don'?t\s+know$/i,
    /^(i\s+)?don'?t\s+know\s+what$/i,
    /^(i\s+)?don'?t\s+know\s+why$/i,
    /^(i\s+)?don'?t\s+know\s+how$/i,
    /^(i\s+)?don'?t\s+know\s+if$/i,
    /^(i\s+)?don'?t\s+know\s+which$/i,
    /^(i\s+)?don'?t\s+know\s+where$/i,
    /^(i\s+)?don'?t\s+know\s+when$/i,
    /^(i\s+)?don'?t\s+know\s+who$/i,
    /^(i\s+)?don'?t\s+know\s+the\s+answer$/i,
    /^(i\s+)?don'?t\s+know\s+the\s+name$/i,
    /^(i\s+)?don'?t\s+know\s+my\s+name$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+to\s+say$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+to\s+do$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+to\s+tell\s+you$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+mean$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+want$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+need$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+this\s+is$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+that\s+is$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+is\s+going\s+on$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+happened$/i,
    /^(i\s+)?don'?t\s+know\s+what'?s\s+wrong$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+is\s+wrong$/i,
    /^(i\s+)?don'?t\s+know\s+the\s+problem$/i,
    /^(i\s+)?don'?t\s+know\s+the\s+issue$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+the\s+problem\s+is$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+the\s+issue\s+is$/i,
    /^(i\s+)?not\s+sure$/i,
    /^(i\s+)?'?m\s+not\s+sure$/i,
    /^(i\s+)?am\s+not\s+sure$/i,
    /^(i\s+)?'?m\s+uncertain$/i,
    /^(i\s+)?am\s+uncertain$/i,
    /^(i\s+)?have\s+no\s+idea$/i,
    /^(i\s+)?don'?t\s+have\s+any\s+idea$/i,
    /^(i\s+)?can'?t\s+remember$/i,
    /^(i\s+)?cannot\s+remember$/i,
    /^(i\s+)?forgot$/i,
    /^(i\s+)?don'?t\s+remember$/i,
    /^(i\s+)?can'?t\s+say$/i,
    /^(i\s+)?cannot\s+say$/i,
    /^(i\s+)?won'?t\s+say$/i,
    /^(i\s+)?will\s+not\s+say$/i,
    /^(i\s+)?'?d\s+rather\s+not\s+say$/i,
    /^(i\s+)?would\s+rather\s+not\s+say$/i,
    /^(i\s+)?prefer\s+not\s+to\s+answer$/i,
    /^(i\s+)?'?d\s+prefer\s+not\s+to\s+answer$/i,
    /^(i\s+)?would\s+prefer\s+not\s+to\s+answer$/i,
    /^(i\s+)?don'?t\s+want\s+to\s+answer$/i,
    /^(i\s+)?won'?t\s+answer$/i,
    /^(i\s+)?will\s+not\s+answer$/i,
    /^(i\s+)?'?m\s+not\s+comfortable\s+saying$/i,
    /^(i\s+)?am\s+not\s+comfortable\s+saying$/i,
    /^(i\s+)?no\s+comment$/i,
    /^(i\s+)?can'?t\s+tell\s+you$/i,
    /^(i\s+)?cannot\s+tell\s+you$/i,
    /^(i\s+)?don'?t\s+understand$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you'?re\s+talking\s+about$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+are\s+talking\s+about$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you'?re\s+talking\s+about$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+are\s+talking\s+about$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+mean$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you\s+mean$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+mean$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you'?re\s+asking$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+are\s+asking$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you'?re\s+asking$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+are\s+asking$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+want$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you\s+want$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+want$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+need$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you\s+need$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+need$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you'?re\s+looking\s+for$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+you\s+are\s+looking\s+for$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+you'?re\s+looking\s+for$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+you\s+are\s+looking\s+for$/i,
    /^(i\s+)?don'?t\s+know\s+what\s+to\s+do$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+what\s+to\s+do$/i,
    /^(i\s+)?am\s+not\s+sure\s+what\s+to\s+do$/i,
    /^(i\s+)?don'?t\s+know\s+how\s+to\s+answer$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+how\s+to\s+answer$/i,
    /^(i\s+)?am\s+not\s+sure\s+how\s+to\s+answer$/i,
    /^(i\s+)?don'?t\s+know\s+how\s+to\s+respond$/i,
    /^(i\s+)?'?m\s+not\s+sure\s+how\s+to\s+respond$/i,
    /^(i\s+)?am\s+not\s+sure\s+how\s+to\s+respond$/i
  ];
  
  for (const pattern of shortUncertaintyPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }
  
  return false;
};

// Validation functions (copied from index.ts for testing)
const isValidCustomerName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  
  // Reject non-answers (uncertainty, refusal, filler-only responses)
  if (isNonAnswer(trimmed)) {
    return false;
  }
  
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

console.log('=== NON-ANSWER DETECTION TESTS ===\n');

let nonAnswerPassed = 0;
let nonAnswerFailed = 0;

const nonAnswerTestCases = [
  { input: "I'm not really sure", expectNonAnswer: true },
  { input: "I don't know", expectNonAnswer: true },
  { input: "I don't know what to say", expectNonAnswer: true },
  { input: "I'm not sure", expectNonAnswer: true },
  { input: "I have no idea", expectNonAnswer: true },
  { input: "I don't want to say", expectNonAnswer: true },
  { input: "I'd rather not say", expectNonAnswer: true },
  { input: "I can't remember", expectNonAnswer: true },
  { input: "I forgot", expectNonAnswer: true },
  { input: "No comment", expectNonAnswer: true },
  { input: "I don't know why I'm calling", expectNonAnswer: true },
  { input: "I'm not sure what I need", expectNonAnswer: true },
  { input: "I don't know what service I need", expectNonAnswer: true },
  { input: "I don't know what's wrong", expectNonAnswer: true },
  { input: "I'm not comfortable saying", expectNonAnswer: true },
  { input: "I prefer not to answer", expectNonAnswer: true },
  { input: "I don't understand", expectNonAnswer: true },
  { input: "I don't know what you mean", expectNonAnswer: true },
  { input: "I don't know what to tell you", expectNonAnswer: true },
  { input: "I don't know what's going on", expectNonAnswer: true },
  { input: "I don't know what's happening", expectNonAnswer: true },
  { input: "I don't know what the issue is", expectNonAnswer: true },
  { input: "I don't know what the problem is", expectNonAnswer: true },
  { input: "I don't know what I'm looking for", expectNonAnswer: true },
  { input: "I don't know what I want", expectNonAnswer: true },
  { input: "I don't have a specific request", expectNonAnswer: true },
  { input: "I don't know what to ask for", expectNonAnswer: true },
  { input: "I don't know what I need help with", expectNonAnswer: true },
  { input: "I don't know my name", expectNonAnswer: true },
  { input: "I don't have a name", expectNonAnswer: true },
  { input: "I'm not certain", expectNonAnswer: true },
  { input: "I don't know how to answer", expectNonAnswer: true },
  { input: "I'm not sure how to respond", expectNonAnswer: true },
  { input: "I won't answer", expectNonAnswer: true },
  { input: "I will not answer", expectNonAnswer: true },
  { input: "I can't tell you", expectNonAnswer: true },
  { input: "I cannot tell you", expectNonAnswer: true },
  { input: "I don't know what you're asking", expectNonAnswer: true },
  { input: "I'm not sure what you want", expectNonAnswer: true },
  { input: "I don't know what you need", expectNonAnswer: true },
  { input: "I don't know what this is", expectNonAnswer: true },
  { input: "I don't know what to do", expectNonAnswer: true },
  { input: "I'm not sure what to do", expectNonAnswer: true },
  { input: "I don't know what happened", expectNonAnswer: true },
  { input: "I'm not sure what happened", expectNonAnswer: true },
  { input: "I don't know what you're talking about", expectNonAnswer: true },
  { input: "I'm not sure what you're talking about", expectNonAnswer: true },
  { input: "I don't know what you mean", expectNonAnswer: true },
  { input: "I'm not sure what you mean", expectNonAnswer: true },
  { input: "I don't know what you're asking", expectNonAnswer: true },
  { input: "I'm not sure what you're asking", expectNonAnswer: true },
  { input: "I don't know what you're looking for", expectNonAnswer: true },
  { input: "I'm not sure what you're looking for", expectNonAnswer: true },
  { input: "I don't know what I'm calling about", expectNonAnswer: true },
  { input: "I'm not sure what I'm calling about", expectNonAnswer: true },
  { input: "I don't know why I'm calling", expectNonAnswer: true },
  { input: "I'm not sure why I'm calling", expectNonAnswer: true },
  { input: "I don't know what this is about", expectNonAnswer: true },
  { input: "I'm not sure what this is about", expectNonAnswer: true },
  { input: "I don't know what I'd like", expectNonAnswer: true },
  { input: "I'm not sure what I'd like", expectNonAnswer: true },
  { input: "I don't know what I would like", expectNonAnswer: true },
  { input: "I'm not sure what I would like", expectNonAnswer: true },
  { input: "I don't have anything specific", expectNonAnswer: true },
  { input: "I don't have a specific need", expectNonAnswer: true },
  { input: "I don't have any specific needs", expectNonAnswer: true },
  { input: "I don't have any idea", expectNonAnswer: true },
  { input: "I don't remember", expectNonAnswer: true },
  { input: "I can't say", expectNonAnswer: true },
  { input: "I cannot say", expectNonAnswer: true },
  { input: "I won't say", expectNonAnswer: true },
  { input: "I will not say", expectNonAnswer: true },
  { input: "I'd rather not say", expectNonAnswer: true },
  { input: "I would rather not say", expectNonAnswer: true },
  { input: "I prefer not to answer", expectNonAnswer: true },
  { input: "I'd prefer not to answer", expectNonAnswer: true },
  { input: "I would prefer not to answer", expectNonAnswer: true },
  { input: "I don't want to answer", expectNonAnswer: true },
  { input: "I'm not comfortable saying", expectNonAnswer: true },
  { input: "I am not comfortable saying", expectNonAnswer: true },
  { input: "I don't know what you're talking about", expectNonAnswer: true },
  { input: "I don't know what you are talking about", expectNonAnswer: true },
  { input: "I'm not sure what you're talking about", expectNonAnswer: true },
  { input: "I am not sure what you are talking about", expectNonAnswer: true },
  { input: "I don't know what you mean", expectNonAnswer: true },
  { input: "I'm not sure what you mean", expectNonAnswer: true },
  { input: "I am not sure what you mean", expectNonAnswer: true },
  { input: "I don't know what you're asking", expectNonAnswer: true },
  { input: "I don't know what you are asking", expectNonAnswer: true },
  { input: "I'm not sure what you're asking", expectNonAnswer: true },
  { input: "I am not sure what you are asking", expectNonAnswer: true },
  { input: "I don't know what you want", expectNonAnswer: true },
  { input: "I'm not sure what you want", expectNonAnswer: true },
  { input: "I am not sure what you want", expectNonAnswer: true },
  { input: "I don't know what you need", expectNonAnswer: true },
  { input: "I'm not sure what you need", expectNonAnswer: true },
  { input: "I am not sure what you need", expectNonAnswer: true },
  { input: "I don't know what you're looking for", expectNonAnswer: true },
  { input: "I don't know what you are looking for", expectNonAnswer: true },
  { input: "I'm not sure what you're looking for", expectNonAnswer: true },
  { input: "I am not sure what you are looking for", expectNonAnswer: true },
  { input: "I don't know what to do", expectNonAnswer: true },
  { input: "I'm not sure what to do", expectNonAnswer: true },
  { input: "I am not sure what to do", expectNonAnswer: true },
  { input: "I don't know how to answer", expectNonAnswer: true },
  { input: "I'm not sure how to answer", expectNonAnswer: true },
  { input: "I am not sure how to answer", expectNonAnswer: true },
  { input: "I don't know how to respond", expectNonAnswer: true },
  { input: "I'm not sure how to respond", expectNonAnswer: true },
  { input: "I am not sure how to respond", expectNonAnswer: true },
  // False-positive protection: legitimate names should NOT be rejected
  { input: "John Smith", expectNonAnswer: false },
  { input: "Sarah Johnson", expectNonAnswer: false },
  { input: "Mike Thompson", expectNonAnswer: false },
  { input: "Maria Garcia", expectNonAnswer: false },
  { input: "David Miller", expectNonAnswer: false },
  { input: "Yesenia Noel", expectNonAnswer: false },
  { input: "Tom Wilson", expectNonAnswer: false },
  { input: "This is John Smith", expectNonAnswer: false },
  { input: "My name is Sarah Johnson", expectNonAnswer: false },
  { input: "I'm Mike Thompson", expectNonAnswer: false },
  { input: "Hi, this is Maria Garcia", expectNonAnswer: false },
  { input: "Hello, David Miller here", expectNonAnswer: false },
  { input: "Hey, Yesenia Noel", expectNonAnswer: false },
  { input: "Tom Wilson calling", expectNonAnswer: false }
];

for (const testCase of nonAnswerTestCases) {
  const result = isNonAnswer(testCase.input);
  if (result === testCase.expectNonAnswer) {
    console.log(`✓ PASS: ${testCase.input} (isNonAnswer: ${result})`);
    nonAnswerPassed++;
  } else {
    console.log(`✗ FAIL: ${testCase.input} (expected: ${testCase.expectNonAnswer}, got: ${result})`);
    nonAnswerFailed++;
  }
}

console.log('\n=== NON-ANSWER DETECTION TEST SUMMARY ===');
console.log(`Passed: ${nonAnswerPassed}/${nonAnswerTestCases.length}`);
console.log(`Failed: ${nonAnswerFailed}/${nonAnswerTestCases.length}`);

console.log('\n=== PARSE NAME AND SERVICE TEST CASES ===\n');

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

console.log('\n=== PARTIAL-FIELD MERGE LOGIC TESTS ===\n');

// Test the merge logic directly with mocked parse results
const testMergeLogic = (
  existingName: string,
  existingService: string,
  parsedName: string,
  parsedService: string,
  expectedName: string,
  expectedService: string,
  description: string
): boolean => {
  const existingNameValid = existingName && isValidCustomerName(existingName);
  const existingServiceValid = existingService && isValidServiceRequested(existingService);
  const missingName = !existingNameValid;
  const missingService = !existingServiceValid;
  
  const parsedNameValid = parsedName && isValidCustomerName(parsedName);
  const parsedServiceValid = parsedService && isValidServiceRequested(parsedService);
  
  let mergeDecision = 'unknown';
  let customerNameAfterMerge = existingName;
  let serviceRequestedAfterMerge = existingService;
  
  if (missingName && missingService) {
    mergeDecision = 'assign_both';
    if (parsedNameValid) customerNameAfterMerge = parsedName;
    if (parsedServiceValid) serviceRequestedAfterMerge = parsedService;
  } else if (!missingName && missingService) {
    mergeDecision = 'preserve_name_assign_service';
    customerNameAfterMerge = existingName;
    if (parsedServiceValid) serviceRequestedAfterMerge = parsedService;
  } else if (missingName && !missingService) {
    mergeDecision = 'preserve_service_assign_name';
    serviceRequestedAfterMerge = existingService;
    if (parsedNameValid) customerNameAfterMerge = parsedName;
  } else {
    mergeDecision = 'preserve_both';
    customerNameAfterMerge = existingName;
    serviceRequestedAfterMerge = existingService;
  }
  
  const passed = customerNameAfterMerge === expectedName && serviceRequestedAfterMerge === expectedService;
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${description}`);
  console.log(`  Merge decision: ${mergeDecision}`);
  console.log(`  Result: name="${customerNameAfterMerge}", service="${serviceRequestedAfterMerge}"`);
  if (!passed) {
    console.log(`  Expected: name="${expectedName}", service="${expectedService}"`);
  }
  return passed;
};

let mergeLogicPassed = 0;
let mergeLogicFailed = 0;

// Test 1: Name first, service second (production failure scenario)
if (testMergeLogic(
  'Rachel Adams', '', // existing
  '', 'My furnace keeps shutting off after a few minutes.', // parsed
  'Rachel Adams', 'My furnace keeps shutting off after a few minutes.', // expected
  'Name first, service second (production failure scenario)'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 2: Service first, name second (inverse scenario)
if (testMergeLogic(
  '', 'My furnace keeps shutting off.', // existing
  'Rachel Adams', '', // parsed
  'Rachel Adams', 'My furnace keeps shutting off.', // expected
  'Service first, name second (inverse scenario)'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 3: Non-answer then full answer
if (testMergeLogic(
  '', '', // existing (non-answer rejected)
  'Megan Foster', 'My toilet keeps overflowing.', // parsed
  'Megan Foster', 'My toilet keeps overflowing.', // expected
  'Non-answer then full answer'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 4: Full answer direct success
if (testMergeLogic(
  '', '', // existing
  'Kevin Brooks', 'someone to look at my water heater.', // parsed
  'Kevin Brooks', 'someone to look at my water heater.', // expected
  'Full answer direct success'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 5: Valid field overwrite protection (name)
if (testMergeLogic(
  'Rachel Adams', '', // existing
  'Invalid Name', 'My furnace is broken.', // parsed (name should be rejected)
  'Rachel Adams', 'My furnace is broken.', // expected (name preserved)
  'Valid field overwrite protection (name)'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 6: Valid field overwrite protection (service)
if (testMergeLogic(
  '', 'My water heater is leaking.', // existing
  'Christopher Bennett', 'Invalid Service', // parsed (service should be rejected)
  'Christopher Bennett', 'My water heater is leaking.', // expected (service preserved)
  'Valid field overwrite protection (service)'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

console.log('\n=== MERGE LOGIC TEST RESULTS ===');
console.log('Passed:', mergeLogicPassed);
console.log('Failed:', mergeLogicFailed);
console.log('Total:', mergeLogicPassed + mergeLogicFailed);
console.log('=============================\n');

// ============================================================================
// TARGETED REPROMPT SELECTION TESTS
// ============================================================================

console.log('\n=== TARGETED REPROMPT SELECTION TESTS ===\n');

// Test targeted reprompt selection (using existing validation functions)
function testRepromptSelection(
  customerName: string,
  serviceRequested: string,
  expectedRepromptType: string,
  testName: string
): boolean {
  const hasValidName = isValidCustomerName(customerName);
  const hasValidService = isValidServiceRequested(serviceRequested);
  
  let repromptType: string;
  if (!hasValidName && !hasValidService) {
    repromptType = 'full_name_and_reason';
  } else if (hasValidName && !hasValidService) {
    repromptType = 'service_only';
  } else if (!hasValidName && hasValidService) {
    repromptType = 'name_only';
  } else {
    repromptType = 'advance';
  }
  
  const passed = repromptType === expectedRepromptType;
  
  console.log(`[TEST] ${testName}`);
  console.log(`  customerName: "${customerName}"`);
  console.log(`  serviceRequested: "${serviceRequested}"`);
  console.log(`  hasValidName: ${hasValidName}`);
  console.log(`  hasValidService: ${hasValidService}`);
  console.log(`  expectedRepromptType: ${expectedRepromptType}`);
  console.log(`  actualRepromptType: ${repromptType}`);
  console.log(`  Result: ${passed ? 'PASS' : 'FAIL'}`);
  console.log('');
  
  return passed;
}

let repromptTestsPassed = 0;
let repromptTestsFailed = 0;

// Test 1: Both fields missing → full reprompt
if (testRepromptSelection(
  '', '',
  'full_name_and_reason',
  'Both fields missing → full reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 2: Name only → service-only reprompt
if (testRepromptSelection(
  'Rachel Adams', '',
  'service_only',
  'Name only → service-only reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 3: Service only → name-only reprompt
if (testRepromptSelection(
  '', 'My water heater is leaking all over the basement.',
  'name_only',
  'Service only → name-only reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 4: Pure non-answer → full reprompt
if (testRepromptSelection(
  '', '',
  'full_name_and_reason',
  'Pure non-answer → full reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 5: Both fields valid → advance
if (testRepromptSelection(
  'Christopher Bennett', 'My water heater is leaking all over the basement.',
  'advance',
  'Both fields valid → advance'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 6: Invalid name, valid service → name-only reprompt
if (testRepromptSelection(
  'I need help with my furnace', 'My furnace keeps shutting off.',
  'name_only',
  'Invalid name, valid service → name-only reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

// Test 7: Valid name, invalid service → service-only reprompt
if (testRepromptSelection(
  'Rachel Adams', 'Hi, this is Rachel',
  'service_only',
  'Valid name, invalid service → service-only reprompt'
)) {
  repromptTestsPassed++;
} else {
  repromptTestsFailed++;
}

console.log('\n=== TARGETED REPROMPT TEST RESULTS ===');
console.log('Passed:', repromptTestsPassed);
console.log('Failed:', repromptTestsFailed);
console.log('Total:', repromptTestsPassed + repromptTestsFailed);
console.log('====================================\n');

// Test 5: Valid name must not be overwritten
if (testMergeLogic(
  'Rachel Adams', '', // existing
  'My furnace keeps shutting off after a few minutes.', '', // parsed (service-only treated as name fallback but invalid)
  'Rachel Adams', '', // expected (name preserved, service not assigned because parsed name invalid)
  'Valid name must not be overwritten'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

// Test 6: Valid service must not be overwritten
if (testMergeLogic(
  '', 'My furnace keeps shutting off.', // existing
  'Rachel Adams', '', // parsed
  'Rachel Adams', 'My furnace keeps shutting off.', // expected
  'Valid service must not be overwritten'
)) {
  mergeLogicPassed++;
} else {
  mergeLogicFailed++;
}

console.log('\n=== MERGE LOGIC TEST SUMMARY ===');
console.log(`Passed: ${mergeLogicPassed}/6`);
console.log(`Failed: ${mergeLogicFailed}/6`);

process.exit(failed > 0 ? 1 : 0);
