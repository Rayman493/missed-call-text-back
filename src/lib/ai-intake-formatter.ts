// Helper function to normalize text for display
export const normalizeText = (text: string | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  let normalized = text.trim();
  
  // Remove conversational filler
  const fillerPatterns = [
    /^um\s+/i,
    /^uh\s+/i,
    /^i said\s+/i,
    /^i need\s+/i,
    /^probably\s+/i,
    /^maybe\s+/i,
    /^\s+|\s+$/g,
  ];
  
  for (const pattern of fillerPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  
  // Remove duplicate punctuation
  normalized = normalized.replace(/([.!?])\1+/g, '$1');
  
  // Capitalize first letter
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  
  // Trim final whitespace
  normalized = normalized.trim();
  
  return normalized || 'Not collected';
};

// Helper function to format AI intake summary (used by SMS and dashboard)
export const formatAiIntakeSummary = (
  intakeData: any,
  callerPhone: string,
  businessName?: string
): string => {
  const customerName = normalizeText(intakeData?.customerName);
  const serviceRequested = normalizeText(intakeData?.serviceRequested);
  const serviceAddress = normalizeText(intakeData?.serviceAddress);
  const desiredCompletionTime = normalizeText(intakeData?.desiredCompletionTime);
  const callbackTime = normalizeText(intakeData?.callbackTime);
  const issueDescription = normalizeText(intakeData?.issueDescription);
  
  const displayName = businessName || 'us';
  
  return `--------------------------------

Thanks for calling ${displayName}!

📋 NEW CUSTOMER REQUEST

👤 Customer
${customerName}

📞 Phone
${callerPhone}

🛠 Service Requested
${serviceRequested}

📍 Service Address
${serviceAddress}

📅 Desired Completion
${desiredCompletionTime}

☎️ Best Callback Time
${callbackTime}

📝 Additional Details
${issueDescription}

Reply to this message if you'd like to update or add any information.

--------------------------------`;
};
