/**
 * Lead timing utilities for calculating last contacted and last response times
 */

import { formatRelativeTime } from './utils';

export interface LeadTimingInfo {
  lastContacted?: string;
  lastResponse?: string;
  lastContactedRaw?: string;
  lastResponseRaw?: string;
}

export function calculateLeadTiming(lead: any): LeadTimingInfo {
  const result: LeadTimingInfo = {};
  
  if (!lead.messages || lead.messages.length === 0) {
    // No messages, use first_contact_at as last contacted
    if (lead.first_contact_at) {
      result.lastContacted = formatRelativeTime(lead.first_contact_at);
      result.lastContactedRaw = lead.first_contact_at;
    }
    return result;
  }
  
  // Sort messages by date (newest first)
  const sortedMessages = [...lead.messages].sort((a: any, b: any) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Find last inbound message (customer contacting us)
  const lastInbound = sortedMessages.find((m: any) => m.direction === 'inbound');
  if (lastInbound) {
    result.lastContacted = formatRelativeTime(lastInbound.created_at);
    result.lastContactedRaw = lastInbound.created_at;
  } else if (lead.first_contact_at) {
    // Fallback to first_contact_at if no inbound messages
    result.lastContacted = formatRelativeTime(lead.first_contact_at);
    result.lastContactedRaw = lead.first_contact_at;
  }
  
  // Find last outbound message (our response)
  const lastOutbound = sortedMessages.find((m: any) => m.direction === 'outbound');
  if (lastOutbound) {
    result.lastResponse = formatRelativeTime(lastOutbound.created_at);
    result.lastResponseRaw = lastOutbound.created_at;
  }
  
  return result;
}

export function getCustomerInfoForCopy(lead: any): string {
  const parts: string[] = [];
  
  if (lead.contact_name) {
    parts.push(`Name: ${lead.contact_name}`);
  }
  
  if (lead.caller_phone && lead.caller_phone !== '+10000000000') {
    parts.push(`Phone: ${lead.caller_phone}`);
  }
  
  if (lead.company_name) {
    parts.push(`Company: ${lead.company_name}`);
  }
  
  if (lead.reason_for_call) {
    parts.push(`Reason: ${lead.reason_for_call}`);
  }
  
  if (lead.urgency) {
    parts.push(`Urgency: ${lead.urgency}`);
  }
  
  return parts.join('\n');
}

export function getAISummaryForCopy(lead: any): string {
  if (lead.ai_summary) {
    return lead.ai_summary;
  }
  
  // Fallback to reason for call if no AI summary
  if (lead.reason_for_call) {
    return lead.reason_for_call;
  }
  
  // Fallback to latest message content
  if (lead.messages && lead.messages.length > 0) {
    const sortedMessages = [...lead.messages].sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latestMessage = sortedMessages[0];
    if (latestMessage && latestMessage.body) {
      return latestMessage.body;
    }
  }
  
  return 'No summary available';
}
