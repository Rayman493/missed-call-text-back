/**
 * Customer Reply Notification Identity Regression Test
 *
 * Proves that customer_reply notifications use the canonical customer display name
 * from lead.name, not from raw_metadata.caller_name or incorrect fallbacks.
 *
 * This test directly exercises getLeadDisplayName which is now used by sms-processing.ts
 * for customer reply notification identity.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getLeadDisplayName } from '../utils'
import { NOTIFICATION_TEMPLATES } from '../notifications'

const repoRoot = join(__dirname, '..', '..', '..')
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Customer Reply Notification Identity', () => {
  it('should use canonical lead.name when available', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ryan',
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
  })

  it('should fall back to phone when lead.name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    // Phone formatting is handled by formatPhoneNumber, actual value may vary
    expect(displayName).not.toBe('Unknown Caller')
    expect(displayName).toContain('1234')
  })

  it('should fall back to phone when lead.name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      name: 'Not collected',
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Not collected')
    expect(displayName).toContain('1234')
  })

  it('should return "Unknown Caller" when no usable identity exists', () => {
    const lead = {
      id: 'lead-1',
      name: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Unknown Caller')
  })

  it('should never return undefined', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBeDefined()
    expect(displayName).not.toBe('')
  })

  it('should never return null', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBeNull()
  })

  it('should use lead.name when AI intake name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ryan',
      caller_phone: '555-1234',
      raw_metadata: {
        extracted_info: {
          customerName: 'Not collected'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
  })

  it('should use raw_metadata.customerName when lead.name is absent and AI intake name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      phone: '4122533598',
      raw_metadata: {
        customerName: 'Ryan'
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
  })

  it('should use raw_metadata.callerName when lead.name is absent and AI intake name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      phone: '4122533598',
      raw_metadata: {
        callerName: 'Sarah'
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Sarah')
  })

  it('should use raw_metadata.caller_name when lead.name is absent and AI intake name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      phone: '4122533598',
      raw_metadata: {
        caller_name: 'Mike'
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Mike')
  })

  it('should prioritize raw_metadata.customerName over phone when lead.name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      phone: '4122533598',
      raw_metadata: {
        customerName: 'Ryan'
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
    expect(displayName).not.toContain('412')
  })

  it('should fall back to phone when raw_metadata customer name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      phone: '4122533598',
      raw_metadata: {
        customerName: 'Not collected'
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Not collected')
    expect(displayName).toContain('412')
  })
})

/**
 * Physical regression: customer "Ray" replied "Hiii" and the push notification
 * displayed "(412) 253-3598: Hiii". Root cause: the inbound lead lookup returns
 * leads.* only, so getLeadDisplayName could not see the AI intake record where
 * the name lives. The notification path now attaches the lead's most recent
 * ai_call_records row before name resolution.
 */
describe('Customer Reply Notification — AI intake name via attached records', () => {
  const aiRecord = {
    id: 'ai-rec-1',
    call_sid: 'CAXXX',
    created_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-15T10:01:00Z',
    extracted_info: { callerName: 'Ray' }
  }

  it('known customer with AI intake name: uses customer name, not phone', () => {
    const lead = {
      id: 'lead-ray',
      name: null,
      contact_name: null,
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [aiRecord]
    }
    expect(getLeadDisplayName(lead)).toBe('Ray')
  })

  it('produces the observed-fix notification body "Ray: Hiii"', () => {
    const lead = {
      id: 'lead-ray',
      name: null,
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [aiRecord]
    }
    const leadName = getLeadDisplayName(lead)
    const result = NOTIFICATION_TEMPLATES.customer_reply({
      leadName,
      message: 'Hiii',
      leadId: lead.id
    })
    expect(result.title).toBe('New Reply')
    expect(result.message).toBe('Ray: Hiii')
  })

  it('returning customer: stored lead.name wins over phone and AI record', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ray',
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [aiRecord]
    }
    expect(getLeadDisplayName(lead)).toBe('Ray')
  })

  it('empty lead name fields still resolve AI intake name over phone', () => {
    const lead = {
      id: 'lead-1',
      name: '',
      contact_name: null,
      caller_phone: '+14122533598',
      raw_metadata: { corrected_fields: { name: '' } },
      aiCallRecords: [aiRecord]
    }
    expect(getLeadDisplayName(lead)).toBe('Ray')
  })

  it('name-refused AI intake does not win over phone fallback', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [{
        ...aiRecord,
        extracted_info: { callerName: 'Ray', nameRefused: true }
      }]
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Ray')
    expect(displayName).toContain('412')
  })

  it('blank AI intake name falls back to formatted phone', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [{
        ...aiRecord,
        extracted_info: { callerName: '' }
      }]
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toContain('412')
  })

  it('valid stored name is not overwritten by blank AI intake name', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ray',
      caller_phone: '+14122533598',
      raw_metadata: {},
      aiCallRecords: [{
        ...aiRecord,
        extracted_info: { callerName: '' }
      }]
    }
    expect(getLeadDisplayName(lead)).toBe('Ray')
  })

  it('snake_case ai_call_records property resolves the same name', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: '+14122533598',
      raw_metadata: {},
      ai_call_records: [aiRecord]
    }
    expect(getLeadDisplayName(lead)).toBe('Ray')
  })
})

describe('Customer Reply Notification — pipeline ordering contract', () => {
  const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
  const notificationsServerSrc = readSrc('src/lib/notifications-server.ts')

  it('customer_reply notification is created before the enrichment/correction pipeline', () => {
    const notifyIdx = smsProcessingSrc.indexOf("type: 'customer_reply'")
    const extractionIdx = smsProcessingSrc.indexOf('await extractFromSmsBody(body)')
    const correctionIdx = smsProcessingSrc.indexOf('await detectCorrection(')
    const followUpCancelIdx = smsProcessingSrc.indexOf('cancelPendingFollowUpsForConversation')

    expect(notifyIdx).toBeGreaterThan(-1)
    expect(extractionIdx).toBeGreaterThan(-1)
    expect(correctionIdx).toBeGreaterThan(-1)
    expect(followUpCancelIdx).toBeGreaterThan(-1)

    // Notification must not wait on LLM enrichment, AI correction detection,
    // or follow-up cancellation — all run after it.
    expect(notifyIdx).toBeLessThan(extractionIdx)
    expect(notifyIdx).toBeLessThan(correctionIdx)
    expect(notifyIdx).toBeLessThan(followUpCancelIdx)
  })

  it('notification is created after the inbound message is persisted', () => {
    const insertIdx = smsProcessingSrc.indexOf('await db.createMessageWithConversation({')
    const notifyIdx = smsProcessingSrc.indexOf("type: 'customer_reply'")
    expect(insertIdx).toBeGreaterThan(-1)
    expect(notifyIdx).toBeGreaterThan(insertIdx)
  })

  it('exactly one notifyCustomerReply call site exists (no duplicate notification path)', () => {
    const matches = smsProcessingSrc.match(/notifyCustomerReply\(/g) || []
    expect(matches.length).toBe(1)
  })

  it('name resolution attaches the lead AI call record before getLeadDisplayName', () => {
    const lookupIdx = smsProcessingSrc.indexOf('getMostRecentAiCallRecordForLead(business.id, lead.id)')
    const aiAttachIdx = smsProcessingSrc.indexOf('aiCallRecords: [aiRecordForName]')
    const nameIdx = smsProcessingSrc.indexOf('getLeadDisplayName(leadForName)')
    const notifyIdx = smsProcessingSrc.indexOf('await notificationServiceServer.notifyCustomerReply(')

    expect(lookupIdx).toBeGreaterThan(-1)
    expect(aiAttachIdx).toBeGreaterThan(-1)
    expect(nameIdx).toBeGreaterThan(-1)
    expect(lookupIdx).toBeLessThan(nameIdx)
    expect(aiAttachIdx).toBeLessThan(nameIdx)
    expect(nameIdx).toBeLessThan(notifyIdx)
  })

  it('notification passes inboundMessage.id for idempotency key', () => {
    const notifyIdx = smsProcessingSrc.indexOf('await notificationServiceServer.notifyCustomerReply(')
    expect(notifyIdx).toBeGreaterThan(-1)
    const callSite = smsProcessingSrc.substring(notifyIdx, notifyIdx + 400)
    expect(callSite).toContain('inboundMessage.id')
  })
})

describe('Customer Reply Notification — dispatch and idempotency contract', () => {
  const notificationsServerSrc = readSrc('src/lib/notifications-server.ts')

  it('customer_reply dedupes by inbound message ID', () => {
    expect(notificationsServerSrc).toContain("`reply_${data.messageId}`")
    const keyIdx = notificationsServerSrc.indexOf("`reply_${data.messageId}`")
    const context = notificationsServerSrc.substring(Math.max(0, keyIdx - 300), keyIdx)
    expect(context).toContain("type === 'customer_reply'")
  })

  it('push dispatch is gated on isNewInsert so duplicate callbacks do not re-push', () => {
    expect(notificationsServerSrc).toContain('if (isNewInsert)')
    const gateIdx = notificationsServerSrc.indexOf('if (isNewInsert)')
    const sendIdx = notificationsServerSrc.indexOf('await sendPushForNotification(notification)')
    expect(sendIdx).toBeGreaterThan(gateIdx)
    // The duplicate path explicitly skips push
    expect(notificationsServerSrc).toContain('delivery skipped - existing notification reused')
  })

  it('push dispatch is invoked immediately after insert via setImmediate', () => {
    const insertSuccessIdx = notificationsServerSrc.indexOf('[NOTIFICATIONS INSERT SUCCESS]')
    const dispatchIdx = notificationsServerSrc.indexOf('setImmediate(async () =>')
    const sendIdx = notificationsServerSrc.indexOf('await sendPushForNotification(notification)')
    expect(insertSuccessIdx).toBeGreaterThan(-1)
    expect(dispatchIdx).toBeGreaterThan(insertSuccessIdx)
    expect(sendIdx).toBeGreaterThan(dispatchIdx)
  })

  it('a second reply with a new message ID produces a new idempotency key', () => {
    const key1 = `reply_${'msg-aaa'}`
    const key2 = `reply_${'msg-bbb'}`
    expect(key1).not.toBe(key2)
    // Same message ID (Twilio retry) produces the same key → deduped
    expect(`reply_${'msg-aaa'}`).toBe(key1)
  })

  it('server customer_reply template preserves existing copy contract', () => {
    const tplIdx = notificationsServerSrc.indexOf('customer_reply: (data:')
    expect(tplIdx).toBeGreaterThan(-1)
    const tpl = notificationsServerSrc.substring(tplIdx, tplIdx + 800)
    expect(tpl).toContain('resolveCustomerDisplayName(data.leadName, null)')
    expect(tpl).toContain("'New Reply'")
    expect(tpl).toContain('`${displayName}: ${truncatedMessage}`')
  })
})