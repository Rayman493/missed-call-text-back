/**
 * Admin API: Reconcile Twilio Inventory
 * 
 * Read-only reconciliation that compares Twilio owned numbers with the twilio_numbers table.
 * Reports discrepancies without taking any destructive actions.
 * 
 * GET /api/admin/reconcile-twilio-inventory
 * 
 * Requires authenticated ReplyFlow admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { reconcileTwilioInventory } from '@/lib/twilio-provisioning-service'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('[API] Reconcile Twilio Inventory request received')

  // Get user from session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore setAll errors from Server Components
          }
        },
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    console.log('[API] Reconcile Twilio Inventory: Unauthorized (no user)')
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Verify admin access
  if (!isAdmin(user.id)) {
    console.log('[API] Reconcile Twilio Inventory: Forbidden (not admin)', { userId: user.id })
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  console.log('[API] Reconcile Twilio Inventory: Authorized admin', { userId: user.id })
  
  try {
    const result = await reconcileTwilioInventory();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    // Audit logging (non-blocking)
    logAdminAction({
      actingAdminUserId: user.id,
      actingAdminEmail: getUserEmail(user),
      action: 'reconcile_twilio_inventory',
      metadata: {
        orphaned_count: result.numbersInTwilioNotInDb.length,
        discrepant_count: result.numbersInDbNotInTwilio.length,
        system_number_found: !!result.systemNumber,
      },
    })

    return NextResponse.json({
      ok: true,
      numbersInTwilioNotInDb: result.numbersInTwilioNotInDb,
      numbersInDbNotInTwilio: result.numbersInDbNotInTwilio,
      systemNumber: result.systemNumber,
      summary: {
        orphanedCount: result.numbersInTwilioNotInDb.length,
        discrepantCount: result.numbersInDbNotInTwilio.length,
        systemNumberFound: !!result.systemNumber
      }
    });

  } catch (error: any) {
    console.error('[API] Reconcile Twilio Inventory error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}