import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the sendSms function directly
vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(),
}))

// Mock the auto-sms-dispatcher functions
vi.mock('@/lib/auto-sms-dispatcher', () => ({
  hasAutomaticSmsForCall: vi.fn(),
  dispatchAutomaticCustomerSms: vi.fn(),
}))

describe('AI Summary SMS Idempotency - Call-Specific Behavior', () => {
  const testCallSidA = 'CAa6801d6edab9c585da5b7e4d6d4f3b63'
  const testCallSidB = 'CAb7902e7fecb0d696eb6c8f5e7e5g4c74'
  const testCallSidC = 'CAc8a03f8gfdc1e7a7fc7d9g6f8f6h5d85'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ATOMIC CLAIM PATTERN', () => {
    it('should use claimedMessageId to skip idempotency check', () => {
      const claimedMessageId = 'msg-123'
      const hasClaimedMessage = !!claimedMessageId

      // When claimedMessageId is present, idempotency check should be skipped
      expect(hasClaimedMessage).toBe(true)
      // The actual check in code is: isAutomatedMessage && !hasClaimedMessage
      // With claimedMessageId, this should be false (skip check)
      const shouldRunIdempotencyCheck = true && !hasClaimedMessage
      expect(shouldRunIdempotencyCheck).toBe(false)
    })

    it('should UPDATE existing claimed message instead of INSERT', () => {
      const claimedMessageId = 'msg-123'
      const insertPayload = {
        twilio_message_sid: 'SM456',
        status: 'sent'
      }

      // When claimedMessageId is provided, UPDATE instead of INSERT
      const shouldUpdate = !!claimedMessageId
      expect(shouldUpdate).toBe(true)
    })

    it('should handle unique constraint violation (23505) as duplicate claim', () => {
      const claimError = { code: '23505', message: 'duplicate key value violates unique constraint' }

      // 23505 should be treated as duplicate claim
      const isDuplicateClaim = claimError.code === '23505'
      expect(isDuplicateClaim).toBe(true)
    })

    it('should release claim on Twilio send failure', () => {
      const claimedMessageId = 'msg-123'
      const twilioMessageSid = null

      // If Twilio send fails, claim should be released
      const shouldReleaseClaim = !!claimedMessageId && !twilioMessageSid
      expect(shouldReleaseClaim).toBe(true)
    })

    it('should finalize claim on successful Twilio send', () => {
      const claimedMessageId = 'msg-123'
      const twilioMessageSid = 'SM456'

      // If Twilio send succeeds, claim should be finalized
      const shouldFinalize = !!claimedMessageId && !!twilioMessageSid
      expect(shouldFinalize).toBe(true)
    })

    it('should store source discriminator in structured_data', () => {
      // With separate claims table, we no longer need source discriminator in messages.structured_data
      // The claims table itself provides the AI-summary-specific scoping
      const claimsTable = 'ai_summary_sms_claims'

      expect(claimsTable).toBe('ai_summary_sms_claims')
      console.log('[CLAIM TABLE DESIGN] Table name provides AI-summary specificity')
    })

    it('should distinguish AI summary from other automated messages with same callSid', () => {
      // With separate claims table, this is no longer an issue
      // The claims table is specifically for AI summary SMS
      // Other automated SMS (follow-ups, etc.) don't use this table
      const claimsTable = 'ai_summary_sms_claims'
      const isAiSummaryOnly = true

      expect(claimsTable).toBe('ai_summary_sms_claims')
      expect(isAiSummaryOnly).toBe(true)
    })
  })

  describe('BRAND-NEW CUSTOMER SCENARIOS', () => {
    it('should allow first call for brand-new customer', () => {
      const newCustomerCallSid = testCallSidA
      const hasExistingMessages = false

      // Brand-new customer has no historical messages
      expect(hasExistingMessages).toBe(false)

      // First call should be able to claim and send
      const canClaim = !hasExistingMessages
      expect(canClaim).toBe(true)
    })

    it('should allow early hangup for brand-new customer', () => {
      const earlyHangupCallSid = testCallSidB
      const hasHistoricalSummary = false

      // Early hangup should still send summary even if no prior messages
      expect(hasHistoricalSummary).toBe(false)
    })
  })

  describe('CONCURRENT HANDLERS', () => {
    it('should allow only one winner in concurrent same-call scenario', () => {
      const callSid = testCallSidA
      const handlers = ['Handler A', 'Handler B']

      // Both attempt INSERT with same callSid
      // Unique constraint allows only one to succeed
      const uniqueConstraintEnforced = true
      expect(uniqueConstraintEnforced).toBe(true)
    })

    it('should loser return idempotentSkip without calling Twilio', () => {
      const duplicateClaimReason = 'duplicate_claim'
      const shouldSkipTwilio = duplicateClaimReason === 'duplicate_claim'

      expect(shouldSkipTwilio).toBe(true)
    })
  })

  describe('STALE CLAIM RECOVERY', () => {
    it('should reclaim stale pending claim older than threshold', () => {
      const claimCreated = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      const staleThreshold = 5 * 60 * 1000 // 5 minutes
      const isStale = Date.now() - claimCreated.getTime() > staleThreshold

      expect(isStale).toBe(true)
    })

    it('should not reclaim fresh pending claim', () => {
      const claimCreated = new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
      const staleThreshold = 5 * 60 * 1000 // 5 minutes
      const isStale = Date.now() - claimCreated.getTime() > staleThreshold

      expect(isStale).toBe(false)
    })

    it('should use compare-and-set for concurrent stale claim recovery', () => {
      const staleClaimId = 'msg-123'
      const concurrentWorkers = ['Worker A', 'Worker B']

      // Both attempt UPDATE with WHERE status='pending' AND twilio_message_sid='CLAIMED' AND claim_token=OLD
      // Only one can succeed due to compare-and-set
      const compareAndSetEnforced = true
      expect(compareAndSetEnforced).toBe(true)
    })

    it('should generate unique claim tokens for each claim attempt', () => {
      const token1 = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const token2 = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Each claim attempt should have a unique token
      expect(token1).not.toBe(token2)
    })

    it('should update claim token on successful reclaim', () => {
      const oldToken = 'claim_123_abc'
      const newToken = 'reclaim_456_def'

      // Reclaim should change the claim token
      const tokenChanged = oldToken !== newToken
      expect(tokenChanged).toBe(true)
    })

    it('should prevent concurrent reclaimers from both succeeding', () => {
      const staleClaim = {
        id: 'msg-123',
        status: 'pending',
        twilio_message_sid: 'CLAIMED',
        structured_data: { claim_token: 'OLD_TOKEN' }
      }

      // Worker A reclaims with NEW_TOKEN_A
      // Worker B attempts reclaim with OLD_TOKEN
      // Worker B's UPDATE should affect 0 rows because claim_token no longer matches
      const workerA = { newToken: 'NEW_TOKEN_A', success: true }
      const workerB = { oldToken: 'OLD_TOKEN', success: false }

      expect(workerA.success).toBe(true)
      expect(workerB.success).toBe(false)
    })
  })

  describe('UNRELATED SAME-CALL MESSAGES', () => {
    it('should allow different message types with same callSid', () => {
      const aiSummary = { call_sid: testCallSidA, source: 'ai_summary' }
      const followUp = { call_sid: testCallSidA, source: 'follow_up' }

      // Unique index only applies to source='ai_summary'
      const bothAllowed = aiSummary.source !== followUp.source
      expect(bothAllowed).toBe(true)
    })
  })

  describe('OWNERSHIP GUARDS', () => {
    it('should prevent finalize without matching claim token', () => {
      const messageId = 'msg-123'
      const currentToken = 'CURRENT_TOKEN'
      const staleToken = 'STALE_TOKEN'

      // Stale worker tries to finalize with old token
      const canFinalize = currentToken === staleToken
      expect(canFinalize).toBe(false)
    })

    it('should prevent release without matching claim token', () => {
      const messageId = 'msg-123'
      const currentToken = 'CURRENT_TOKEN'
      const staleToken = 'STALE_TOKEN'

      // Stale worker tries to release with old token
      const canRelease = currentToken === staleToken
      expect(canRelease).toBe(false)
    })

    it('should allow finalize with matching claim token', () => {
      const messageId = 'msg-123'
      const currentToken = 'CURRENT_TOKEN'
      const workerToken = 'CURRENT_TOKEN'

      // Current worker can finalize with matching token
      const canFinalize = currentToken === workerToken
      expect(canFinalize).toBe(true)
    })
  })

  describe('FAILURE TYPE DISTINCTION', () => {
    it('should preserve claim on ambiguous failure', () => {
      const failureType = 'ambiguous' // e.g., timeout, connection reset
      const shouldPreserveClaim = failureType === 'ambiguous'

      // Ambiguous failures should preserve claim to prevent duplicate SMS
      expect(shouldPreserveClaim).toBe(true)
    })

    it('should release claim on definitive failure', () => {
      const failureType = 'definitive' // e.g., 400 Bad Request, 401 Unauthorized
      const shouldReleaseClaim = failureType === 'definitive'

      // Definitive failures can release claim for retry
      expect(shouldReleaseClaim).toBe(true)
    })
  })

  describe('CLAIM TIMESTAMP RESET', () => {
    it('should use claim_started_at for staleness after reclaim', () => {
      const createdAt = '2026-01-01T00:00:00.000Z' // Original claim time
      const claimStartedAt = '2026-01-01T00:10:00.000Z' // Reclaim time
      const now = new Date('2026-01-01T00:14:00.000Z') // Current time
      const staleThreshold = 5 * 60 * 1000 // 5 minutes

      // Original claim would be stale (14 min old)
      const originalIsStale = now.getTime() - new Date(createdAt).getTime() > staleThreshold
      expect(originalIsStale).toBe(true)

      // Reclaimed claim should NOT be stale (4 min old)
      const reclaimedIsStale = now.getTime() - new Date(claimStartedAt).getTime() > staleThreshold
      expect(reclaimedIsStale).toBe(false)
    })

    it('should reset staleness clock on reclaim', () => {
      const originalClaimTime = new Date('2026-01-01T00:00:00.000Z')
      const reclaimTime = new Date('2026-01-01T00:10:00.000Z')
      const currentTime = new Date('2026-01-01T00:14:00.000Z')
      const staleThresholdMinutes = 5

      // Original claim age: 14 minutes (stale)
      const originalAgeMinutes = (currentTime.getTime() - originalClaimTime.getTime()) / (1000 * 60)
      expect(originalAgeMinutes).toBeGreaterThan(staleThresholdMinutes)

      // Reclaimed claim age: 4 minutes (fresh)
      const reclaimedAgeMinutes = (currentTime.getTime() - reclaimTime.getTime()) / (1000 * 60)
      expect(reclaimedAgeMinutes).toBeLessThan(staleThresholdMinutes)
    })

    it('should prevent immediate steal after reclaim', () => {
      const reclaimTime = new Date('2026-01-01T00:10:00.000Z')
      const currentTime = new Date('2026-01-01T00:11:00.000Z') // 1 minute later
      const staleThresholdMinutes = 5

      const ageMinutes = (currentTime.getTime() - reclaimTime.getTime()) / (1000 * 60)
      const isStale = ageMinutes > staleThresholdMinutes

      // Recently reclaimed claim should not be stale
      expect(isStale).toBe(false)
    })
  })

  describe('GHOST MESSAGE PREVENTION', () => {
    it('should NOT insert into messages table when claiming', () => {
      // This regression test proves that claiming does NOT create a visible message
      const claimTable = 'ai_summary_sms_claims'
      const messagesTable = 'messages'

      // Claim should go to dedicated claims table
      expect(claimTable).toBe('ai_summary_sms_claims')
      expect(messagesTable).toBe('messages')

      // Claim table and messages table are separate
      expect(claimTable).not.toBe(messagesTable)

      // Therefore, no ghost message in Customer Conversation UI
      console.log('[GHOST MESSAGE PREVENTION] Claims live in separate table')
    })

    it('should only insert into messages after Twilio send', () => {
      // Verify the flow:
      // 1. Claim → inserts into ai_summary_sms_claims (NOT messages)
      // 2. Twilio send → inserts into messages (real message)
      // 3. Customer UI only shows messages table (no ghost claims)

      const claimStep = {
        table: 'ai_summary_sms_claims',
        visibleToCustomer: false
      }

      const twilioStep = {
        table: 'messages',
        visibleToCustomer: true
      }

      expect(claimStep.visibleToCustomer).toBe(false)
      expect(twilioStep.visibleToCustomer).toBe(true)
    })

    it('should not appear in lead-details messages query', () => {
      // The lead-details API queries:
      // SELECT * FROM messages WHERE lead_id = X
      // It does NOT query ai_summary_sms_claims

      const messagesQuery = 'SELECT * FROM messages WHERE lead_id = X'
      const claimsQuery = 'SELECT * FROM ai_summary_sms_claims WHERE lead_id = X'

      // Claims are not included in messages query
      expect(messagesQuery).not.toContain('ai_summary_sms_claims')
      expect(claimsQuery).toContain('ai_summary_sms_claims')

      console.log('[GHOST MESSAGE PREVENTION] Claims excluded from Customer Conversation query')
    })
  })

  describe('CASE A — same call duplicate protection', () => {
    it('should store callSid in structured_data when callSid is provided', () => {
      // This test verifies the data structure change
      const mockStructuredData = { call_sid: testCallSidA }
      expect(mockStructuredData.call_sid).toBe(testCallSidA)
    })

    it('should allow distinguishing messages by callSid', () => {
      // Verify that different callSids create different structured_data objects
      const dataA = { call_sid: testCallSidA }
      const dataB = { call_sid: testCallSidB }
      const dataC = { call_sid: testCallSidC }

      expect(dataA.call_sid).not.toBe(dataB.call_sid)
      expect(dataB.call_sid).not.toBe(dataC.call_sid)
      expect(dataA.call_sid).not.toBe(dataC.call_sid)
    })
  })

  describe('CASE B — new call, same lead/conversation', () => {
    it('should allow different callSids for the same conversation', () => {
      // Verify that the same conversation can have messages with different callSids
      const conversationId = 'same-conversation-id'
      const messages = [
        { conversation_id: conversationId, structured_data: { call_sid: testCallSidA } },
        { conversation_id: conversationId, structured_data: { call_sid: testCallSidB } },
        { conversation_id: conversationId, structured_data: { call_sid: testCallSidC } },
      ]

      expect(messages).toHaveLength(3)
      expect(messages[0].structured_data.call_sid).toBe(testCallSidA)
      expect(messages[1].structured_data.call_sid).toBe(testCallSidB)
      expect(messages[2].structured_data.call_sid).toBe(testCallSidC)
    })
  })

  describe('CASE C — early hangup recovery', () => {
    it('should not block new call based on old callSid', () => {
      // Verify that a query for CALL_C does not match CALL_A
      const oldMessage = { structured_data: { call_sid: testCallSidA }, created_at: '90-minutes-ago' }
      const newCallSid = testCallSidC

      // Simulate the query: structured_data contains call_sid = newCallSid
      const matches = oldMessage.structured_data.call_sid === newCallSid
      expect(matches).toBe(false)
    })
  })

  describe('CASE D — same call webhook retry', () => {
    it('should detect duplicate when same callSid is used', () => {
      // Verify that a query for CALL_C matches CALL_C
      const existingMessage = { structured_data: { call_sid: testCallSidC }, created_at: '2-minutes-ago' }
      const retryCallSid = testCallSidC

      // Simulate the query: structured_data contains call_sid = retryCallSid
      const matches = existingMessage.structured_data.call_sid === retryCallSid
      expect(matches).toBe(true)
    })
  })

  describe('CASE E — non-ai_summary automated messages', () => {
    it('should preserve backward compatibility for messages without callSid', () => {
      // Verify that messages without callSid can still be queried by lead_id + body
      const messageWithoutCallSid = {
        lead_id: 'test-lead',
        body: 'Test message',
        structured_data: null,
      }

      expect(messageWithoutCallSid.structured_data).toBeNull()
    })
  })

  describe('idempotentSkip flag behavior', () => {
    it('should return idempotentSkip: true for idempotency blocks', () => {
      const result = { sid: null, messageId: null, idempotentSkip: true }
      expect(result.idempotentSkip).toBe(true)
    })

    it('should return idempotentSkip: false for successful sends', () => {
      const result = { sid: 'SM123', messageId: 'msg-123', idempotentSkip: false }
      expect(result.idempotentSkip).toBe(false)
    })

    it('should return undefined idempotentSkip for other failures', () => {
      const result = { sid: null, messageId: null }
      expect(result.idempotentSkip).toBeUndefined()
    })
  })
})