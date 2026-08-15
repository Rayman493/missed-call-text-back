import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { isEligibleForProvisioning } from '@/lib/subscription'
import { scheduleTwilioRelease, cancelTwilioRelease } from '@/lib/twilio-reclamation'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-manual-access')
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
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!isAdmin(user.id)) {
      console.log('[MANUAL ACCESS] Unauthorized access attempt', { userId: user.id })
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, action, expiresAt, reason, note, confirmBusinessId } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    if (!action || !['grant', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'action must be grant or revoke' }, { status: 400 })
    }

    // EXPLICIT CONFIRMATION CHECK: Require business ID confirmation for grant action
    if (action === 'grant') {
      if (!confirmBusinessId || confirmBusinessId !== businessId) {
        console.error('[MANUAL ACCESS] CONFIRMATION_CHECK: Business ID confirmation failed for grant', {
          expected: businessId,
          received: confirmBusinessId
        })
        return NextResponse.json({
          error: 'Business ID confirmation required',
          details: {
            businessId,
            message: 'Please confirm the business ID to grant manual access'
          }
        }, { status: 400 })
      }
      console.log('[MANUAL ACCESS] CONFIRMATION_CHECK: Business ID confirmed for grant', businessId)
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch current business state for audit logging
    const { data: currentBusiness, error: fetchError } = await serviceSupabase
      .from('businesses')
      .select('id, name, manual_access_enabled, manual_access_granted_by, manual_access_expires_at')
      .eq('id', businessId)
      .single()

    if (fetchError || !currentBusiness) {
      console.error('[MANUAL ACCESS] Failed to fetch business for audit:', fetchError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const beforeState = {
      manual_access_enabled: currentBusiness.manual_access_enabled,
      manual_access_granted_by: currentBusiness.manual_access_granted_by,
      manual_access_expires_at: currentBusiness.manual_access_expires_at,
    }

    if (action === 'grant') {
      // If expiresAt is provided, set it to end-of-day to avoid timezone confusion
      // Example: Admin selects 2026-06-05, store as 2026-06-05T23:59:59.999Z
      let processedExpiresAt = null
      if (expiresAt) {
        const date = new Date(expiresAt)
        // Set to end of day (23:59:59.999)
        date.setHours(23, 59, 59, 999)
        processedExpiresAt = date.toISOString()
      }

      const updateData: any = {
        manual_access_enabled: true,
        manual_access_granted_at: new Date().toISOString(),
        manual_access_granted_by: user.id,
        manual_access_reason: reason || null,
        manual_access_note: note || null,
        manual_access_expires_at: processedExpiresAt
      }

      const { data, error } = await serviceSupabase
        .from('businesses')
        .update(updateData)
        .eq('id', businessId)
        .select()
        .single()

      if (error) {
        console.error('[MANUAL ACCESS] Grant error:', error)
        return NextResponse.json({ error: 'Failed to grant manual access' }, { status: 500 })
      }

      console.log('[MANUAL ACCESS] Access granted', {
        businessId,
        grantedBy: user.id,
        reason,
        expiresAt: updateData.manual_access_expires_at
      })

      // Audit logging (non-blocking)
      logAdminAction({
        actingAdminUserId: user.id,
        actingAdminEmail: getUserEmail(user),
        action: 'grant_manual_access',
        targetBusinessId: businessId,
        resourceIdentifiers: { business_name: currentBusiness.name },
        beforeState,
        afterState: {
          manual_access_enabled: true,
          manual_access_granted_by: user.id,
          manual_access_expires_at: processedExpiresAt,
        },
        metadata: { reason, note },
      })

      // Cancel any scheduled Twilio release since access is being restored
      await cancelTwilioRelease(businessId)

      // Check if business is eligible for provisioning after manual access grant
      console.log('[MANUAL ACCESS PROVISIONING] Checking eligibility after manual access grant')
      const isEligible = isEligibleForProvisioning(data)
      
      if (isEligible) {
        console.log('[MANUAL ACCESS PROVISIONING] Eligible - Triggering provisioning')
        
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/business/trigger-provisioning`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-secret': process.env.PROVISIONING_ADMIN_SECRET || ''
            },
            body: JSON.stringify({
              business_id: businessId
            })
          })
          
          if (response.ok) {
            console.log('[MANUAL ACCESS PROVISIONING] ✓ Provisioning triggered successfully')
          } else {
            const errorText = await response.text()
            console.error('[MANUAL ACCESS PROVISIONING] ✗ Failed to trigger provisioning:', errorText)
          }
        } catch (provisioningError) {
          console.error('[MANUAL ACCESS PROVISIONING] ✗ Error triggering provisioning:', provisioningError)
        }
      } else {
        console.log('[MANUAL ACCESS PROVISIONING] Not eligible - skipping provisioning trigger')
      }

      return NextResponse.json({
        success: true,
        message: 'Manual access granted',
        business: data
      })
    } else if (action === 'revoke') {
      const { data, error } = await serviceSupabase
        .from('businesses')
        .update({
          manual_access_enabled: false,
          manual_access_expires_at: null,
          manual_access_reason: null,
          manual_access_note: null,
          manual_access_granted_at: null,
          manual_access_granted_by: null
        })
        .eq('id', businessId)
        .select()
        .single()

      if (error) {
        console.error('[MANUAL ACCESS] Revoke error:', error)
        return NextResponse.json({ error: 'Failed to revoke manual access' }, { status: 500 })
      }

      console.log('[MANUAL ACCESS] Access revoked', {
        businessId,
        revokedBy: user.id
      })

      // Audit logging (non-blocking)
      logAdminAction({
        actingAdminUserId: user.id,
        actingAdminEmail: getUserEmail(user),
        action: 'revoke_manual_access',
        targetBusinessId: businessId,
        resourceIdentifiers: { business_name: currentBusiness.name },
        beforeState,
        afterState: {
          manual_access_enabled: false,
          manual_access_granted_by: null,
          manual_access_expires_at: null,
        },
      })

      // Schedule Twilio release since access is being revoked
      await scheduleTwilioRelease(businessId, 'manual_access_revoked')

      return NextResponse.json({
        success: true,
        message: 'Manual access revoked',
        business: data
      })
    }
  } catch (error: any) {
    console.error('[MANUAL ACCESS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
