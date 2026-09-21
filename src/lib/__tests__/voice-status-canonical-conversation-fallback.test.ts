/**
 * Regression tests for the voice-status canonical-conversation fallback.
 *
 * Production evidence (physical QA window): a /api/twilio/voice-status
 * callback arrived with leadId + businessId present but aiCallRecord absent
 * and canonicalConversationId null. The route logged
 * "[voice-status] No conversation available for call event" and returned
 * early with reason 'no_conversation', permanently skipping the call_events
 * conversation link and downstream completion work for that callback.
 *
 * Root cause: `canonicalConversationId` was declared `null` and never
 * assigned — the `else if (canonicalConversationId)` fallback branch was
 * dead code. The baseline conversation already exists by then: the
 * /api/twilio/voice route creates the call_events row and stamps
 * conversation_id on it before TwiML is returned (AI baseline via
 * ensureCallIntakeBaseline steps 2/6, update-voicemail via the explicit
 * call_events update). Status callbacks cannot fire before TwiML, so the
 * stamped row is the authoritative reconciliation source.
 *
 * These tests pin:
 *   1. the route initializes canonicalConversationId from the already-fetched
 *      call_events row (structural — prevents regression to a dead variable)
 *   2. conversation selection precedence: ai_call_records.conversation_id
 *      wins, canonical baseline conversation is the fallback, early return
 *      only when truly nothing exists (behavioral model)
 *   3. the raced callback now reconciles instead of losing the call event
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROUTE_PATH = join(
  __dirname,
  '..',
  '..',
  'app',
  'api',
  'twilio',
  'voice-status',
  'route.ts'
)

const routeSource = readFileSync(ROUTE_PATH, 'utf8')

describe('voice-status canonical conversation fallback', () => {
  describe('structural: canonicalConversationId is wired to the baseline call_events row', () => {
    it('fetches call_events.conversation_id before the AI record lookup', () => {
      const fetchIdx = routeSource.indexOf("callEventForRouting")
      const selectIdx = routeSource.indexOf("id, conversation_id, is_update_voicemail")
      expect(fetchIdx).toBeGreaterThan(-1)
      expect(selectIdx).toBeGreaterThan(-1)
      expect(selectIdx).toBeLessThan(
        routeSource.indexOf('let canonicalConversationId')
      )
    })

    it('initializes canonicalConversationId from callEventForRouting.conversation_id', () => {
      // The historical defect was `= null` with no later assignment.
      expect(routeSource).toMatch(
        /let canonicalConversationId:\s*string \| null\s*=\s*callEventForRouting\?\.conversation_id \|\| null/
      )
    })

    it('does not leave canonicalConversationId permanently null', () => {
      // There must be no bare `= null` initializer left for this variable.
      expect(routeSource).not.toMatch(
        /let canonicalConversationId:\s*string \| null\s*=\s*null/
      )
    })

    it('keeps the fallback branch that uses the canonical conversation', () => {
      expect(routeSource).toContain('else if (canonicalConversationId)')
      expect(routeSource).toContain('[VOICE STATUS USING CANONICAL CONVERSATION]')
    })

    it('keeps the no-conversation early return only for the truly-orphaned case', () => {
      expect(routeSource).toContain("reason: 'no_conversation'")
      // Early return must come AFTER the conversation selection block, i.e.
      // only when neither ai_call_records nor the baseline conversation exists.
      const fallbackIdx = routeSource.indexOf('else if (canonicalConversationId)')
      const earlyReturnIdx = routeSource.indexOf("reason: 'no_conversation'")
      expect(fallbackIdx).toBeGreaterThan(-1)
      expect(earlyReturnIdx).toBeGreaterThan(fallbackIdx)
    })
  })

  describe('behavioral: conversation selection precedence', () => {
    // Mirrors the selection block in processVoiceStatusCallback:
    // ai_call_records.conversation_id > canonical baseline > none.
    function selectConversation(opts: {
      aiCallRecord: { conversation_id: string | null } | null
      canonicalConversationId: string | null
    }): { conversationId: string | null; earlyReturn: boolean } {
      const { aiCallRecord, canonicalConversationId } = opts
      if (aiCallRecord && aiCallRecord.conversation_id) {
        return { conversationId: aiCallRecord.conversation_id, earlyReturn: false }
      }
      if (canonicalConversationId) {
        return { conversationId: canonicalConversationId, earlyReturn: false }
      }
      return { conversationId: null, earlyReturn: true }
    }

    it('prefers the AI call record conversation when present', () => {
      const result = selectConversation({
        aiCallRecord: { conversation_id: 'ai-conv' },
        canonicalConversationId: 'baseline-conv',
      })
      expect(result.conversationId).toBe('ai-conv')
      expect(result.earlyReturn).toBe(false)
    })

    it('reconciles via the baseline conversation when the AI record raced ahead', () => {
      // The production anomaly: aiCallRecord=false, canonicalConversationId
      // previously null. With the fallback wired, the baseline conversation
      // stamped on call_events resolves the call event update.
      const result = selectConversation({
        aiCallRecord: null,
        canonicalConversationId: 'baseline-conv',
      })
      expect(result.conversationId).toBe('baseline-conv')
      expect(result.earlyReturn).toBe(false)
    })

    it('falls back to canonical when the AI record exists but lacks a conversation', () => {
      const result = selectConversation({
        aiCallRecord: { conversation_id: null },
        canonicalConversationId: 'baseline-conv',
      })
      expect(result.conversationId).toBe('baseline-conv')
      expect(result.earlyReturn).toBe(false)
    })

    it('early-returns only when no conversation source exists at all', () => {
      const result = selectConversation({
        aiCallRecord: null,
        canonicalConversationId: null,
      })
      expect(result.conversationId).toBeNull()
      expect(result.earlyReturn).toBe(true)
    })

    it('does not fabricate a conversation for non-AI calls with no baseline', () => {
      // Voicemail-path calls have no ai_call_records row and no stamped
      // baseline conversation; voicemail/recording-status callbacks own
      // their persistence. The route must not invent a placeholder.
      const result = selectConversation({
        aiCallRecord: null,
        canonicalConversationId: null,
      })
      expect(result.earlyReturn).toBe(true)
    })
  })
})
