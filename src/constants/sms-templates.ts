// SMS Templates for ReplyFlowHQ
// Centralized template management for different scenarios

export enum SmsTemplateType {
  VOICEMAIL_RECEIVED = 'voicemail_received',
  NO_VOICEMAIL = 'no_voicemail',
  MISSED_CALL_FALLBACK = 'missed_call_fallback',
  PARTIAL_INTAKE = 'partial_intake',
  PARTIAL_INTAKE_WITH_REASON = 'partial_intake_with_reason'
}

type TemplateFunction = (businessName: string, extraParam?: string) => string

export const SMS_TEMPLATES: Record<SmsTemplateType, TemplateFunction> = {
  [SmsTemplateType.VOICEMAIL_RECEIVED]: (businessName: string) => 
    `Hi, this is ${businessName}. Thanks for your message. We've received your voicemail and will get back to you shortly. If you'd like to add anything else, simply reply to this text. Reply STOP to opt out.`,

  [SmsTemplateType.NO_VOICEMAIL]: (businessName: string) => 
    `Hi, this is ${businessName}. Sorry we missed your call. Please reply with how we can help and we'll get back to you shortly. Reply STOP to opt out.`,

  [SmsTemplateType.MISSED_CALL_FALLBACK]: (businessName: string) => 
    `Hi, this is ${businessName}. Sorry we missed you — how can we help? Reply here and we'll get your request over. Reply STOP to opt out.`,

  [SmsTemplateType.PARTIAL_INTAKE]: (businessName: string) => 
    `Hi, this is ${businessName}. We got part of your request. Reply here with any details and the best time to call you back. Reply STOP to opt out.`,

  [SmsTemplateType.PARTIAL_INTAKE_WITH_REASON]: (businessName: string, reason?: string) => 
    reason 
      ? `Hi, this is ${businessName}. We got part of your request about ${reason}. Reply here with any details and the best time to call you back. Reply STOP to opt out.`
      : `Hi, this is ${businessName}. We got part of your request. Reply here with any details and the best time to call you back. Reply STOP to opt out.`
};

// Helper function to get SMS template
export function getSmsTemplate(type: SmsTemplateType, businessName: string, extraParam?: string): string {
  const template = SMS_TEMPLATES[type];
  if (!template) {
    console.warn(`[SMS TEMPLATE] Template not found for type: ${type}, falling back to missed call`);
    return SMS_TEMPLATES[SmsTemplateType.MISSED_CALL_FALLBACK](businessName);
  }
  return template(businessName, extraParam);
}
