// SMS Templates for ReplyFlowHQ
// Centralized template management for different scenarios

export enum SmsTemplateType {
  VOICEMAIL_RECEIVED = 'voicemail_received',
  NO_VOICEMAIL = 'no_voicemail',
  MISSED_CALL_FALLBACK = 'missed_call_fallback'
}

export const SMS_TEMPLATES = {
  [SmsTemplateType.VOICEMAIL_RECEIVED]: (businessName: string) => 
    `Hi, this is ${businessName}. Thanks for your message. We've received your voicemail and will get back to you shortly. If you'd like to add anything else, simply reply to this text. Reply STOP to opt out.`,

  [SmsTemplateType.NO_VOICEMAIL]: (businessName: string) => 
    `Hi, this is ${businessName}. Sorry we missed your call. Please reply with how we can help and we'll get back to you shortly. Reply STOP to opt out.`,

  [SmsTemplateType.MISSED_CALL_FALLBACK]: (businessName: string) => 
    `Hi, this is ${businessName}. Sorry we missed your call-how can we help? Reply STOP to opt out.`
};

// Helper function to get SMS template
export function getSmsTemplate(type: SmsTemplateType, businessName: string): string {
  const template = SMS_TEMPLATES[type];
  if (!template) {
    console.warn(`[SMS TEMPLATE] Template not found for type: ${type}, falling back to missed call`);
    return SMS_TEMPLATES[SmsTemplateType.MISSED_CALL_FALLBACK](businessName);
  }
  return template(businessName);
}
