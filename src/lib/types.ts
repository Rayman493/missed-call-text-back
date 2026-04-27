export interface Business {
  id: string;
  user_id?: string | null;
  name: string;
  twilio_phone_number: string;
  twilio_messaging_service_sid?: string | null;
  auto_reply_message: string;
  sms_type?: string | null;
  a2p_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  subscription_price_id?: string | null;
  current_period_end?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Lead {
  id: string;
  business_id: string;
  caller_phone: string;
  status: string;
  first_contact_at: string | null;
  last_message_at: string | null;
  last_reply_at: string | null;
  opted_out: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  conversation_id?: string;
  direction: 'inbound' | 'outbound';
  body: string;
  from_phone: string;
  to_phone: string;
  twilio_message_sid?: string | null;
  status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  status_updated_at?: string | null;
  created_at: string;
}

export interface CallEvent {
  id: string;
  business_id: string;
  conversation_id?: string;
  caller_phone: string;
  call_status: string;
  twilio_call_sid: string | null;
  raw_payload: any;
  created_at: string;
}

export interface TwilioVoiceStatusPayload {
  CallSid: string;
  CallStatus: string;
  From: string;
  To: string;
  Direction: string;
  Timestamp: string;
  [key: string]: any;
}

export interface TwilioSmsPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  [key: string]: any;
}

export interface LeadWithMessages extends Lead {
  messages: Message[];
  business: Business;
}

export interface Conversation {
  id: string;
  lead_id: string;
  business_id: string;
  status: 'open' | 'closed' | 'archived';
  source: 'missed_call' | 'sms' | 'manual';
  started_at: string;
  last_activity_at: string;
  summary?: string;
  created_at: string;
}

export interface FollowUp {
  id: string;
  conversation_id: string;
  lead_id: string;
  business_id: string;
  kind: string;
  status: 'pending' | 'sent' | 'cancelled';
  scheduled_for: string;
  message_body: string;
  sent_at?: string;
  created_at: string;
}

export interface CallEventWithBusiness extends CallEvent {
  business: Business;
}
