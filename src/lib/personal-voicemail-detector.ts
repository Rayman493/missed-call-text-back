/**
 * Personal Voicemail Detection Helper
 * 
 * This helper determines whether a call belongs to the Personal Voicemail pipeline
 * or the normal AI Intake pipeline. All webhooks should use this canonical detector
 * before processing any call.
 * 
 * Personal Voicemail calls are completely independent of:
 * - AI intake
 * - Leads
 * - Conversations
 * - SMS
 * - Follow-ups
 * - Analytics
 * - Customer metrics
 * 
 * They only interact with the personal_voicemails table.
 */

export interface PersonalVoicemailDetection {
  isPersonalVoicemail: boolean;
  businessId?: string;
  callerPhone?: string;
}

/**
 * Detect if a call is a Personal Voicemail call by checking URL parameters
 * 
 * @param url - The request URL to check for personal voicemail parameters
 * @returns Detection result with pipeline information
 */
export function detectPersonalVoicemailFromUrl(url: string | URL): PersonalVoicemailDetection {
  const urlObj = typeof url === 'string' ? new URL(url) : url;
  
  const businessId = urlObj.searchParams.get('businessId');
  const callerPhone = urlObj.searchParams.get('callerPhone');
  
  // Personal voicemail calls have both parameters
  if (businessId && callerPhone) {
    return {
      isPersonalVoicemail: true,
      businessId,
      callerPhone
    };
  }
  
  return {
    isPersonalVoicemail: false
  };
}

/**
 * Detect if a call is a Personal Voicemail call from a Request object
 * 
 * @param request - Next.js Request object
 * @returns Detection result with pipeline information
 */
export function detectPersonalVoicemailFromRequest(request: Request): PersonalVoicemailDetection {
  return detectPersonalVoicemailFromUrl(request.url);
}

/**
 * Check if a call is a Personal Voicemail call (convenience function)
 * 
 * @param url - The request URL to check
 * @returns true if this is a personal voicemail call
 */
export function isPersonalVoicemailCall(url: string | URL): boolean {
  return detectPersonalVoicemailFromUrl(url).isPersonalVoicemail;
}

/**
 * Check if a call is a Personal Voicemail call from Request (convenience function)
 * 
 * @param request - Next.js Request object
 * @returns true if this is a personal voicemail call
 */
export function isPersonalVoicemailRequest(request: Request): boolean {
  return isPersonalVoicemailCall(request.url);
}
