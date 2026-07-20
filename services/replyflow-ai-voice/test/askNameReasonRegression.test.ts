// Minimal, self-contained regression tests for ask_name_reason name extraction

const cases = [
  {
    desc: "1. Ryan, I need some landscaping work done.",
    input: "Ryan, I need some landscaping work done.",
    expectName: "Ryan",
    expectService: "some landscaping work done",
  },
  {
    desc: "2. My name is Ryan and I need some landscaping work done.",
    input: "My name is Ryan and I need some landscaping work done.",
    expectName: "Ryan",
    expectService: "some landscaping work done",
  },
  {
    desc: "3. Yeah, my name is Ryan, and I need some landscaping work done.",
    input: "Yeah, my name is Ryan, and I need some landscaping work done.",
    expectName: "Ryan",
    expectService: "and I need some landscaping work done",
  },
  {
    desc: "4. Yeah, my name is, uh, Ryan, and I need some landscaping work done.",
    input: "Yeah, my name is, uh, Ryan, and I need some landscaping work done.",
    expectName: "Ryan",
    expectService: "some landscaping work done",
  },
  {
    desc: "5. Uh, my name is Ryan. I need my lawn cut.",
    input: "Uh, my name is Ryan. I need my lawn cut.",
    expectName: "Ryan",
    expectService: "my lawn cut",
  },
  {
    desc: "6. I'm Ryan, and I'm calling because my sink is leaking.",
    input: "I'm Ryan, and I'm calling because my sink is leaking.",
    expectName: "Ryan",
    expectService: "and I'm calling because my sink is leaking",
  },
  {
    desc: "7. This is Ryan. I need someone to look at my roof.",
    input: "This is Ryan. I need someone to look at my roof.",
    expectName: "Ryan",
    expectService: "someone to look at my roof",
  },
  // New cases for exact production transcript and filler variations (no comma)
  {
    desc: "8. Yeah, my name is uh Ryan, and I need some landscaping work done (exact production transcript)",
    input: "Yeah, my name is uh Ryan, and I need some landscaping work done",
    expectName: "Ryan",
    expectService: "and I need some landscaping work done",
  },
  {
    desc: "9. Yeah, my name is, uh, Ryan, and I need some landscaping work done (with comma)",
    input: "Yeah, my name is, uh, Ryan, and I need some landscaping work done",
    expectName: "Ryan",
    expectService: "some landscaping work done",
  },
  {
    desc: "10. My name is um Ryan and I need my lawn cut (no comma)",
    input: "My name is um Ryan and I need my lawn cut",
    expectName: "Ryan",
    expectService: "my lawn cut",
  },
  {
    desc: "11. My name is, um, Ryan and I need my lawn cut (with commas)",
    input: "My name is, um, Ryan and I need my lawn cut",
    expectName: "Ryan",
    expectService: "my lawn cut",
  },
  {
    desc: "12. This is uh Ryan. I need someone to look at my roof (no comma)",
    input: "This is uh Ryan. I need someone to look at my roof",
    expectName: "Ryan",
    expectService: "someone to look at my roof",
  },
  {
    desc: "13. I'm um Ryan, and I'm calling because my sink is leaking (no comma)",
    input: "I'm um Ryan, and I'm calling because my sink is leaking",
    expectName: "Ryan",
    expectService: "and I'm calling because my sink is leaking",
  },
];

const negative = [
  { desc: "N1. my name is (intro-only)", input: "my name is" },
  { desc: "N2. name is (intro-only)", input: "name is" },
  { desc: "N3. I am (intro-only)", input: "I am" },
  { desc: "N4. This is (intro-only)", input: "This is" },
];

function stripFillerPrefix(s: string): string {
  return s.replace(/^(?:yeah|yep|yes|uh|um|well|so|okay|ok|alright|hi|hey)(?=[,\s]|$)[,\s]*/i, '').trim();
}

function stripNameIntro(s: string): string {
  // Strip intro phrase first, then strip any leading fillers that follow
  return s
    .replace(/^(?:my name is|my name's|name is|i am|i'm|this is|it is|it's)[\s,]*/i, '')
    .replace(/^(?:uh|um|yeah|well|actually)[\s,]+/i, '')
    .trim();
}

function stripServicePrefix(s: string): string {
  return s
    .replace(/^(?:i want to|i would like to|i'd like to|i need to|i need|i'm looking to|i am looking to|looking to|calling about|i'm calling about|i am calling about|need someone to|to get my|get my)\s+/i, '')
    .trim();
}

function isValidCustomerName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  
  // Reject generic introductory scaffolding that is not a name (same as production)
  const introScaffolding = /^(?:my name is|name is|i am|i'm|this is)\b/i;
  if (introScaffolding.test(trimmed)) {
    return false;
  }
  
  return trimmed.length > 0 && trimmed.length <= 50;
}

function parseNameAndServiceLike(text: string): { name: string; service: string } {
  if (!text) return { name: '', service: '' };
  const trimmed = text.trim();
  let customerName = trimmed;
  let serviceRequested = '';

  // Strip conversational fillers (same as production)
  const normalizedInput = stripFillerPrefix(trimmed);
  const parseText = normalizedInput;

  // Helper: normalize name candidate (same as production)
  const normalizeNameCandidate = (s: string): string => {
    let normalized = stripNameIntro(s)
      .replace(/\s+(?:and\s+)?(?:i\s+(?:need|want|would like|am looking for|am looking to)|i'm\s+(?:looking for|looking to|trying to)|calling about)\b.*$/i, '')
      .replace(/[.,;:]\s*$/i, '')
      .trim();
    normalized = stripNameIntro(normalized);
    return normalized;
  };

  // Two-sentence pattern (same as production)
  const sentences = parseText.split(/\.\s+/).filter(s => s.trim());
  if (sentences.length >= 2) {
    const firstSentence = sentences[0].trim();
    const secondSentence = sentences.slice(1).join('. ').trim();

    const nameIntroPatterns = [
      /^(?:hi|hello|hey)[,\s]+(?:this is|my name is|my name's|name is|i am|i'm)[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+)$/i,
      /^(?:this is|my name is|my name's|name is|i am|i'm)[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+)$/i,
      /^([a-z][a-z' -]{1,40}?)\s+here$/i,
    ];

    let nameFromFirstSentence: string | null = null;
    for (const pattern of nameIntroPatterns) {
      const match = firstSentence.match(pattern);
      if (match) {
        nameFromFirstSentence = normalizeNameCandidate(match[1].trim());
        break;
      }
    }

    const servicePatterns = [
      /(?:i'm calling because|i am calling because|calling because)\s+(.+)/i,
      /(?:i'm calling about|i am calling about|calling about)\s+(.+)/i,
      /(?:i need|i want|i'd like|i would like)\s+(.+)/i,
      /(?:looking for|looking to|need someone to)\s+(.+)/i,
    ];

    let serviceFromSecondSentence: string | null = null;
    for (const pattern of servicePatterns) {
      const match = secondSentence.match(pattern);
      if (match) {
        serviceFromSecondSentence = stripServicePrefix(match[1].trim()).replace(/[.,;]\s*$/, '');
        break;
      }
    }

    if (nameFromFirstSentence && serviceFromSecondSentence) {
      customerName = nameFromFirstSentence;
      serviceRequested = serviceFromSecondSentence;
      return { name: customerName, service: serviceRequested };
    }
  }

  // Comma-separated pattern (same as production, simplified safety checks)
  const commaIndex = parseText.indexOf(',');
  if (commaIndex > 0 && commaIndex < parseText.length - 1) {
    const leftSide = parseText.slice(0, commaIndex).trim();
    const rightSide = parseText.slice(commaIndex + 1).trim();

    // Simplified safety check: left side must not contain service phrases
    const servicePhrases = [
      "i need", "i'm calling", "i am calling", "calling about",
      "my sink", "my air conditioner", "my kitchen", "my bathroom",
      "the pipe", "the toilet", "the faucet", "the water",
      "looking for", "looking to", "need someone", "want to",
      "would like", "leaking", "clogged", "stopped working",
      "broken", "not working", "issue", "problem"
    ];
    const lowerLeft = leftSide.toLowerCase();
    const leftIsService = servicePhrases.some(phrase => lowerLeft.includes(phrase));

    if (!leftIsService) {
      const nameCandidate = normalizeNameCandidate(leftSide);
      const serviceCandidate = stripServicePrefix(rightSide).replace(/[.,;]\s*$/, '');

      if (nameCandidate && serviceCandidate) {
        customerName = nameCandidate;
        serviceRequested = serviceCandidate;
        return { name: customerName, service: serviceRequested };
      }
    }
  }

  // Combined patterns (same as production)
  const combinedPatterns = [
    /(?:name is|my name is|my name's)\s+(.+?)\s*(?:\.|,|;|\band\s+i\s+(?:need|want|would like|am looking|would like)|\band\s+i'm\s+(?:looking|trying)|\band\b|$)\s*(?:i\s+(?:need|want|would like|am looking|would like)|i'm\s+(?:looking|trying))\s+(?:to\s+)?(.+)/i,
    /(?:i'm|i am)\s+(.+?)\s*(?:\.|,|;|\band\s+i\s+(?:need|want|would like|am looking|would like)|\band\s+i'm\s+(?:looking|trying)|\band\b|$)\s*(?:i\s+(?:need|want|would like|am looking|would like)|i'm\s+(?:looking|trying))\s+(?:to\s+)?(.+)/i,
    /(?:this is)\s+(.+?)\s*(?:\.|,|;|\band\s+i\s+(?:need|want|would like|am looking|would like)|\band\s+i'm\s+(?:looking|trying)|\band\b|$)\s*(?:i\s+(?:need|want|would like|am looking|would like)|i'm\s+(?:looking|trying))\s+(?:to\s+)?(.+)/i,
  ];

  for (const pattern of combinedPatterns) {
    const match = parseText.match(pattern);
    if (match) {
      const namePart = normalizeNameCandidate(match[1].trim());
      const servicePart = stripServicePrefix(match[2].trim()).replace(/[.,;]\s*$/, '');
      if (namePart) customerName = namePart;
      if (servicePart) serviceRequested = servicePart;
      if (namePart && servicePart) return { name: customerName, service: serviceRequested };
    }
  }

  // Name patterns (same as production, with updated comma/filler handling)
  const namePatterns = [
    /^(?:hi|hello|hey)[,\s]+my name is[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^my name is[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^my name's[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^name is[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^i am[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^i'm[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^this is[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^it is[\s,]*(?:(?:uh|um|yeah|well|actually)[\s,]*)*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^([a-z][a-z' -]{1,40}?)\s+here(?:\.|,|;|\band\b|$)/i,
    /^([a-z][a-z' -]{1,40}?)\.(?:\s|$)/i,
  ];

  let nameMatch: RegExpMatchArray | null = null;
  for (const pattern of namePatterns) {
    nameMatch = parseText.match(pattern);
    if (nameMatch) break;
  }

  let remainingText = parseText;
  if (nameMatch) {
    const namePart = normalizeNameCandidate(nameMatch[1].trim());
    if (namePart) {
      customerName = namePart;
      const matchIndex = parseText.indexOf(nameMatch[0]);
      if (matchIndex >= 0) {
        remainingText = parseText.slice(matchIndex + nameMatch[0].length).trim();
      }
    }
  }

  // Service patterns (same as production)
  const servicePatterns = [
    /(?:i want to|i need to|i'd like to|i would like to|i'm looking to|i am looking to)\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /(?:i need|i want)\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /(?:i'm calling about|i am calling about|calling about)\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /(?:looking for|looking to get|trying to get|need someone to)\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /(?:to get my|get my)\s+(.+?)(?:\.|,|;|\band\b|$)/i,
  ];

  let serviceMatch: RegExpMatchArray | null = null;
  for (const pattern of servicePatterns) {
    serviceMatch = remainingText.match(pattern);
    if (serviceMatch) break;
  }

  if (nameMatch) {
    const namePart = normalizeNameCandidate(nameMatch[1].trim());
    if (namePart) customerName = namePart;
  }
  if (serviceMatch) {
    const servicePart = stripServicePrefix(serviceMatch[1].trim()).replace(/[.,;]\s*$/, '');
    if (servicePart) serviceRequested = servicePart;
  }

  // Apply validation guard (same as production)
  if (!isValidCustomerName(customerName)) {
    customerName = '';
  }

  return { name: customerName, service: serviceRequested };
}

let pass = 0, fail = 0;
for (const c of cases) {
  const { name, service } = parseNameAndServiceLike(c.input);
  const ok = name === c.expectName && service === c.expectService;
  if (ok) {
    console.log(`PASS: ${c.desc}`);
  } else {
    console.log(`FAIL: ${c.desc}`);
    console.log(`  name: expected "${c.expectName}", got "${name}"`);
    console.log(`  service: expected "${c.expectService}", got "${service}"`);
  }
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;
}

for (const n of negative) {
  const { name } = parseNameAndServiceLike(n.input);
  const ok = name === '';
  if (ok) {
    console.log(`PASS: ${n.desc}`);
  } else {
    console.log(`FAIL: ${n.desc}`);
    console.log(`  name should be empty, got "${name}"`);
  }
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;
}

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
