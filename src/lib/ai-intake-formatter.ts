// Helper function to normalize text for display
// Removes conversational filler while preserving customer meaning
export const normalizeText = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  let normalized = text.trim();
  
  // Remove conversational filler patterns
  const fillerPatterns = [
    // Hesitation fillers
    /^um\s+/i,
    /^uh\s+/i,
    /^um,\s*/i,
    /^uh,\s*/i,
    /^...?\s*/i,
    
    // Name prefixes
    /^yeah\s+(my name is\s+)/i,
    /^my name is\s+/i,
    /^i'm\s+/i,
    /^i am\s+/i,
    /^it's\s+/i,
    /^this is\s+/i,
    /^yeah\s+i'm\s+/i,
    /^yeah\s+i am\s+/i,
    /^yeah\s+it's\s+/i,
    /^yeah\s+this is\s+/i,
    
    // Reason/intent prefixes
    /^i need\s+/i,
    /^i'd like\s+/i,
    /^i want\s+/i,
    /^i'm calling because\s+/i,
    /^the reason is\s+/i,
    /^i'm calling for\s+/i,
    /^i'm here for\s+/i,
    /^i'm looking for\s+/i,
    /^i need someone to\s+/i,
    /^i need a\s+/i,
    /^i need an?\s+/i,
    
    // Address/location prefixes
    /^my address is\s+/i,
    /^i live at\s+/i,
    /^we're located at\s+/i,
    /^it's at\s+/i,
    /^we're at\s+/i,
    /^the address is\s+/i,
    /^located at\s+/i,
    
    // General conversational fillers
    /^i said\s+/i,
    /^probably\s+/i,
    /^maybe\s+/i,
    /^basically\s+/i,
    /^actually\s+/i,
    /^well\s+/i,
    /^so\s+/i,
    /^and\s+/i,
    /^but\s+/i,
    /^just\s+/i,
    /^like\s+/i,
    /^yeah\s+/i,
    /^yes\s+/i,
    /^no\s+/i,
    /^ok\s+/i,
    /^okay\s+/i,
    /^alright\s+/i,
    /^sure\s+/i,
    /^thanks\s+/i,
    /^thank you\s+/i,
    /^please\s+/i,
    
    // Edge cases with punctuation
    /^um,\s*/i,
    /^uh,\s*/i,
    /^yeah,\s*/i,
    /^well,\s*/i,
    /^so,\s*/i,
    /^\.\.\.?\s*/i,
    
    // Trim whitespace from patterns
    /^\s+|\s+$/g,
  ];
  
  for (const pattern of fillerPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  
  // Remove duplicate punctuation
  normalized = normalized.replace(/([.!?])\1+/g, '$1');
  
  // Remove trailing punctuation for cleaner display (except for abbreviations)
  if (/^[^.!?]*[.!?]$/.test(normalized) && 
      !/\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|Ave|Blvd|Rd|Ln|Pt|etc|e\.g|i\.e)\.$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  
  // Capitalize first letter
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  
  // Trim final whitespace
  normalized = normalized.trim();
  
  return normalized || 'Not collected';
};

// Helper function to format AI intake summary (used by SMS and dashboard)
// Accepts both Simple Mode field names and canonical field names interchangeably.
export const formatAiIntakeSummary = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string
): string => {
  // Read Simple Mode field names first, fall back to canonical aliases
  const customerName = normalizeText(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceRequested = normalizeText(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling
  );
  const serviceAddress = normalizeText(
    intakeData?.serviceAddress ?? intakeData?.addressOrLocation
  );
  const desiredCompletionTime = normalizeText(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeText(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  const issueDescription = normalizeText(
    intakeData?.issueDescription ?? intakeData?.importantDetails
  );

  const displayName = businessName || 'us';
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';

  return `Thanks for calling ${displayName}!

${prefix}📋 NEW CUSTOMER REQUEST

👤 Customer
${customerName}

📞 Phone
${callerPhone}

🛠️ Service Requested
${serviceRequested}

📍 Service Address
${serviceAddress}

📅 Desired Completion
${desiredCompletionTime}

☎️ Best Callback Time
${callbackTime}

📝 Additional Details
${issueDescription}

Reply to this message if you'd like to update or add any information.`;
};
