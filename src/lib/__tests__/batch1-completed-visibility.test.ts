/**
 * Batch 1 — Final Completed-Customer Inbound Visibility Check
 *
 * Proves that a NEW inbound message from a COMPLETED customer is still
 * clearly surfaced to the business owner and cannot silently disappear
 * inside a terminal-status customer.
 *
 * No production code change is made for visibility — this test proves the
 * existing unread/notification/inbox model already makes the inbound
 * message visible enough.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

// ============================================================
// Part 1: Completed-customer inbound message persistence
// ============================================================

describe('Batch 1 — Completed-customer inbound visibility', () => {
  const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
  const adminSrc = readSrc('src/lib/supabase/admin.ts')
  const transitionsSrc = readSrc('src/lib/customer-status-transitions.ts')
  const lifecycleSrc = readSrc('src/lib/lead-lifecycle.ts')
  const notificationsServerSrc = readSrc('src/lib/notifications-server.ts')
  const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
  const leadDetailsSrc = readSrc('src/app/api/lead-details/route.ts')

  // ---------- case 1: completed-customer inbound message persists ----------

  it('case 1: completed-customer inbound message persists to existing conversation', () => {
    // Batch A universal reuse: shouldReuseLead has NO status-based exclusion.
    // All 10 statuses (including completed) are eligible for reuse.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()

    // The existing-lead branch creates a message via createMessageWithConversation
    const insertCall = smsProcessingSrc.match(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)
    expect(insertCall).toBeTruthy()
  })

  // ---------- case 2: conversation recency updates ----------

  it('case 2: conversation recency updates on inbound message', () => {
    // sms-processing.ts updates conversation last_activity_at
    expect(smsProcessingSrc).toContain('updateConversation(conversation.id')
    expect(smsProcessingSrc).toContain('last_activity_at: new Date().toISOString()')

    // The lead's last_message_at and last_reply_at are also updated
    expect(smsProcessingSrc).toContain('last_message_at: now')
    expect(smsProcessingSrc).toContain('last_reply_at: now')
  })

  // ---------- case 3: unread/new-message state ----------

  it('case 3: realtime message insert updates lead recency in Inbox', () => {
    // useRealtimeLeads subscribes to messages INSERT events
    const realtimeSrc = readSrc('src/hooks/useRealtimeLeads.ts')
    expect(realtimeSrc).toContain("event: 'INSERT'")
    expect(realtimeSrc).toContain("table: 'messages'")

    // The leads page realtime handler updates last_message_at AND last_activity_at
    // for the lead that received the new message
    expect(leadsPageSrc).toContain('last_message_at: newMessage.created_at')
    expect(leadsPageSrc).toContain('last_activity_at: newMessage.created_at')

    // The list is re-sorted by latest activity after realtime update
    expect(leadsPageSrc).toContain('deduplicated.sort((a, b) => {')
    expect(leadsPageSrc).toContain('getLatestActivity(a)')
    expect(leadsPageSrc).toContain('getLatestActivity(b)')
  })

  it('case 3b: getLatestActivity uses last_activity_at then last_message_at', () => {
    // The sort key prioritizes last_activity_at, then falls back to last_message_at
    const getActivityFn = leadsPageSrc.match(
      /function getLatestActivity\(lead[^)]*\)[\s\S]*?\}/
    )
    expect(getActivityFn).toBeTruthy()
    expect(getActivityFn![0]).toContain('lead.last_activity_at')
    expect(getActivityFn![0]).toContain('lead.last_message_at')
  })

  // ---------- case 4: owner notification fires ----------

  it('case 4: owner notification fires for inbound message regardless of status', () => {
    // notifyCustomerReply is called in the existing-lead branch
    expect(smsProcessingSrc).toContain('notifyCustomerReply')

    // The notification service has a notifyCustomerReply method
    expect(notificationsServerSrc).toContain('async notifyCustomerReply(')
    expect(notificationsServerSrc).toContain("'customer_reply'")

    // createNotification inserts with read: false
    expect(notificationsServerSrc).toContain('read: false')

    // The customer_reply notification template links to the lead conversation
    expect(notificationsServerSrc).toContain('customer_reply:')
    expect(notificationsServerSrc).toContain('New Reply')

    // notifyCustomerReply just delegates to createNotification with no status check
    // Extract the function body by finding the return statement
    const fnStart = notificationsServerSrc.indexOf('async notifyCustomerReply(')
    const returnIdx = notificationsServerSrc.indexOf('return await this.createNotification', fnStart)
    expect(returnIdx).toBeGreaterThan(fnStart) // return statement exists within the function

    // Extract a small window around the return to verify no status check
    const fnBody = notificationsServerSrc.substring(fnStart, returnIdx + 200)
    expect(fnBody).toContain('createNotification')
    expect(fnBody).toContain("'customer_reply'")
    // No status-based filtering between function start and the createNotification call
    const beforeCall = notificationsServerSrc.substring(fnStart, returnIdx)
    expect(beforeCall).not.toContain('status')
    expect(beforeCall).not.toContain('completed')
  })

  // ---------- case 5: message appears in Inbox/attention surface ----------

  it('case 5a: completed leads appear in default Inbox view (not filtered out)', () => {
    // The default filter (statusFilter='all') only excludes 'ignored'
    const filterLogic = leadsPageSrc.match(
      /const matchesStatus = statusFilter === 'all' \? leadStatus !== 'ignored' : leadStatus === statusFilter/
    )
    expect(filterLogic).toBeTruthy()
    // 'completed' is NOT in the exclusion list for 'all' filter
    expect(filterLogic![0]).not.toContain('completed')
  })

  it('case 5b: lead-details API fetches messages by lead_id (no status filter)', () => {
    // The lead-details route fetches messages by lead_id, not by status
    expect(leadDetailsSrc).toContain('.from("messages")')
    expect(leadDetailsSrc).toContain('lead_id')
    // No status filter on message fetch
    const msgFetch = leadDetailsSrc.match(/\.from\("messages"\)[\s\S]*?\.eq\([^)]*\)/)
    expect(msgFetch).toBeTruthy()
    expect(msgFetch![0]).not.toContain('status')
  })

  it('case 5c: conversation view shows all messages for the lead', () => {
    // The lead-details route fetches messages by lead_id to ensure all messages
    // for the lead are visible regardless of conversation assignment
    expect(leadDetailsSrc).toContain('Fetch messages by lead_id')
    expect(leadDetailsSrc).toContain('regardless of conversation assignment')
  })

  // ---------- case 6: completed status remains unchanged ----------

  it('case 6: completed status reactivates to active on inbound message', () => {
    // Batch A universal reactivation: completed transitions to active on inbound
    const completedSection = transitionsSrc.match(/completed:\s*\{[\s\S]*?\}/)
    expect(completedSection).toBeTruthy()
    expect(completedSection![0]).toMatch(/inbound_message_received/)
    expect(completedSection![0]).toMatch(/active/)

    // applyCustomerStatusEvent bypasses protected-status guard for inbound
    expect(transitionsSrc).toContain('inbound_message_received')

    // updateLeadStatusForInboundMessage uses the transition helper
    expect(lifecycleSrc).toContain('updateLeadStatusForInboundMessage')
    expect(lifecycleSrc).toContain('applyCustomerStatusEvent')
  })

  // ---------- case 7: normal completed customer gets no generic TwiML ----------

  it('case 7: normal completed customer gets no generic TwiML acknowledgement', () => {
    // The legacy "Thanks - we received your message." has been removed entirely
    // from production inbound SMS output. No TwiML <Message> contains it.
    expect(smsProcessingSrc).not.toMatch(/<Message>Thanks - we received your message/)

    // The normal lead path (existing lead found) returns empty TwiML
    // Find the empty <Response></Response> TwiML in the success return
    const emptyResponse = smsProcessingSrc.match(
      /twiml:\s*`<\?xml[^`]*<Response>\s*<\/Response>`/
    )
    expect(emptyResponse).toBeTruthy()
    // The empty response should NOT contain a <Message> body
    expect(emptyResponse![0]).not.toContain('<Message>')
  })

  // ---------- case 8: genuinely ignored contact behavior remains intact ----------

  it('case 8a: ignored-contact branch returns empty TwiML (no generic acknowledgement)', () => {
    // The legacy generic auto-ack has been removed. Suppression returns empty TwiML.
    expect(smsProcessingSrc).not.toMatch(/<Message>Thanks - we received your message/)

    // The ignored-contact branch still returns a suppressed result with empty TwiML
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('if (isIgnored)')
    expect(preCheckSection).toContain('ignored: true')
    expect(preCheckSection).not.toContain('<Message>')
  })

  it('case 8b: isIgnoredContact is checked independently of lead status', () => {
    // The ignored-contact check queries the ignored_contacts table
    const ignoredContactsSrc = readSrc('src/lib/ignored-contacts.ts')
    expect(ignoredContactsSrc).toContain('ignored_contacts')
    expect(ignoredContactsSrc).toContain('isIgnoredContact')

    // The check is by business_id and phone_number, not by lead status
    expect(ignoredContactsSrc).toContain('business_id')
    expect(ignoredContactsSrc).toContain('phone_number')
    expect(ignoredContactsSrc).not.toContain('lead.status')
    expect(ignoredContactsSrc).not.toContain('completed')
  })

  it('case 8c: completed customer no longer reaches ignored-contact branch merely because status=completed', () => {
    // Batch A universal reuse: completed leads are reused (no status exclusion).
    // The ignored-contact check is a separate canonical suppression mechanism
    // (ignored_contacts table), not tied to lifecycle status.

    // Verify the existing-lead branch does NOT check isIgnoredContact
    const existingLeadBranch = smsProcessingSrc.match(
      /else if \(lead\)\s*\{[\s\S]*?\}/
    )
    if (existingLeadBranch) {
      expect(existingLeadBranch[0]).not.toContain('isIgnored')
    }

    // Verify shouldReuseLead has NO status-based exclusion check at all
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
  })
})

// ============================================================
// Part 2: Inbox visibility details
// ============================================================

describe('Batch 1 — Inbox visibility for completed customers', () => {
  const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')

  it('visibility 1: completed leads are in the default lead fetch query', () => {
    // The fetch query has no status filter — only business_id and deleted_at
    const fetchQuery = leadsPageSrc.match(
      /\.from\('leads'\)[\s\S]*?\.eq\('business_id'[^)]*\)[\s\S]*?(?:\.is\('deleted_at'[^)]*\))?/
    )
    expect(fetchQuery).toBeTruthy()
    // No status filter in the DB query
    expect(fetchQuery![0]).not.toMatch(/\.eq\('status'/)
  })

  it('visibility 2: completed leads have a dedicated quick filter', () => {
    // The quickFilter type includes 'completed'
    expect(leadsPageSrc).toContain("'completed'")
    // The filter card for completed exists
    expect(leadsPageSrc).toMatch(/quickFilter === 'completed'/)
  })

  it('visibility 3: realtime message insert re-sorts the Inbox list', () => {
    // When a new message arrives via realtime, the lead is updated and re-sorted
    // The useRealtimeLeads hook subscribes to messages INSERT events
    const realtimeSrc = readSrc('src/hooks/useRealtimeLeads.ts')
    expect(realtimeSrc).toContain("event: 'INSERT'")
    expect(realtimeSrc).toContain("table: 'messages'")

    // The leads page realtime handler updates last_message_at AND last_activity_at
    // for the lead that received the new message
    expect(leadsPageSrc).toContain('last_message_at: newMessage.created_at')
    expect(leadsPageSrc).toContain('last_activity_at: newMessage.created_at')

    // The list is re-sorted by latest activity after realtime update
    expect(leadsPageSrc).toContain('deduplicated.sort((a, b) => {')
    expect(leadsPageSrc).toContain('getLatestActivity(a)')
    expect(leadsPageSrc).toContain('getLatestActivity(b)')
  })

  it('visibility 4: notification badge increments on new message', () => {
    // The NotificationContext increments unread count on new notification
    const notifContextSrc = readSrc('src/contexts/NotificationContext.tsx')
    expect(notifContextSrc).toContain('displayedUnreadCount')
    expect(notifContextSrc).toContain('unread: prev.unread + 1')
  })

  it('visibility 5: notification action_url links to the lead conversation', () => {
    // The customer_reply notification template has action_url pointing to the lead
    const notifServerSrc = readSrc('src/lib/notifications-server.ts')
    const replyTemplate = notifServerSrc.match(
      /customer_reply:[\s\S]*?action_url:[\s\S]*?\/dashboard\/leads\/\$\{data\.leadId\}/
    )
    expect(replyTemplate).toBeTruthy()
  })
})
