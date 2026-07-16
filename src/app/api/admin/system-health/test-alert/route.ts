import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { alertManager } from '@/lib/alerting'

export const dynamic = 'force-dynamic'

// Dedicated test condition ID - clearly marked as test-only
const TEST_CONDITION_ID = 'manual_test_alert'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'trigger'

    if (action === 'resolve') {
      // Resolve the test condition
      await alertManager.markResolved(TEST_CONDITION_ID)
      
      return NextResponse.json({
        success: true,
        action: 'resolve',
        conditionId: TEST_CONDITION_ID,
        message: 'Test alert condition marked as resolved'
      })
    }

    if (action === 'trigger') {
      // Trigger the test alert using the real AlertManager
      const testCondition = {
        id: TEST_CONDITION_ID,
        name: 'Operational Monitoring Test',
        severity: 'degraded' as const,
        description: 'This is a manual test of ReplyFlow\'s operational alert pipeline. No production service is currently failing.',
        check: async () => true, // Always return true to trigger the alert
      }

      // Check current alert state before triggering
      const alertStates = await alertManager.getAlertStates()
      const currentState = alertStates[TEST_CONDITION_ID]

      // Trigger the alert (this will go through the real claim RPC)
      await alertManager.checkAndAlert(testCondition, 'Manual test alert triggered by admin')

      // Check the state after triggering
      const newAlertStates = await alertManager.getAlertStates()
      const newState = newAlertStates[TEST_CONDITION_ID]

      // Determine if this was a new claim or cooldown
      const wasClaimed = newState?.alertCount !== currentState?.alertCount

      return NextResponse.json({
        success: true,
        action: 'trigger',
        conditionId: TEST_CONDITION_ID,
        sent: wasClaimed,
        claimed: wasClaimed,
        reason: wasClaimed ? 'Alert claimed and email sent' : 'Alert in cooldown, email not sent',
        alertCount: newState?.alertCount || 0,
        lastAlertedAt: newState?.lastAlertedAt
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Test Alert] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
