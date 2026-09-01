import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

// Known ambiguous reason values for validation
const VALID_AMBIGUOUS_REASONS = [
  'unresolved_attempt_found',
  'reconciliation_failed',
  'reconciliation_exception',
  'reconcile_exception',
  'reconcile_abort',
  'reconciliation_http_error',
  'reconciliation_abort',
  'native_unknown_status',
] as const

const VALID_PLATFORMS = ['ios', 'android', 'web'] as const

/**
 * POST /api/terminal/ambiguous-reason
 *
 * Server-side telemetry for Tap to Pay ambiguous state transitions.
 * This endpoint logs diagnostic information to server logs for debugging
 * Android Tap to Pay failures where device-side diagnostics are not accessible.
 *
 * This is OBSERVABILITY ONLY and does not alter payment behavior.
 *
 * Security:
 * - Requires valid Supabase session
 * - Validates user is authenticated
 * - Validates ambiguousReason against known values
 * - Validates platform against known values
 * - Client-provided identifiers (correlationId, sessionId, attemptId, paymentIntentId)
 *   are treated as UNTRUSTED CORRELATION LABELS only
 * - No database or Stripe lookups based on client identifiers
 * - No payment state mutations
 * - No secrets logged
 *
 * Input:
 * {
 *   correlationId?: string (client-provided correlation label)
 *   sessionId?: string (client-provided correlation label)
 *   attemptId?: string (client-provided correlation label)
 *   paymentIntentId?: string (client-provided correlation label)
 *   ambiguousReason: string
 *   platform: 'ios' | 'android' | 'web'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      correlationId,
      sessionId,
      attemptId,
      paymentIntentId,
      ambiguousReason,
      platform,
    } = body

    // Validate required fields
    if (!ambiguousReason || typeof ambiguousReason !== 'string') {
      return NextResponse.json({ error: 'ambiguousReason is required' }, { status: 400 })
    }

    if (!platform || typeof platform !== 'string') {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 })
    }

    // Validate ambiguousReason against known values
    if (!VALID_AMBIGUOUS_REASONS.includes(ambiguousReason as any)) {
      return NextResponse.json({ error: 'Invalid ambiguousReason' }, { status: 400 })
    }

    // Validate platform against known values
    if (!VALID_PLATFORMS.includes(platform as any)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    // Validate string lengths to prevent log injection
    if (correlationId && (typeof correlationId !== 'string' || correlationId.length > 100)) {
      return NextResponse.json({ error: 'Invalid correlationId' }, { status: 400 })
    }

    if (sessionId && (typeof sessionId !== 'string' || sessionId.length > 100)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    if (attemptId && (typeof attemptId !== 'string' || attemptId.length > 100)) {
      return NextResponse.json({ error: 'Invalid attemptId' }, { status: 400 })
    }

    if (paymentIntentId && (typeof paymentIntentId !== 'string' || paymentIntentId.length > 100)) {
      return NextResponse.json({ error: 'Invalid paymentIntentId' }, { status: 400 })
    }

    // Authenticate user
    const authResult = await getAuthenticatedUser(request)
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Log to server console (retrievable from Vercel logs)
    // No sensitive data - only correlation identifiers and diagnostic reason
    console.log('[TTP AMBIGUOUS_REASON]', {
      timestamp: new Date().toISOString(),
      userId: authResult.id,
      correlationId,
      sessionId,
      attemptId,
      paymentIntentId,
      ambiguousReason,
      platform,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TTP AMBIGUOUS_REASON] Failed to log:', error)
    // Don't fail the payment if telemetry fails
    return NextResponse.json({ success: true })
  }
}