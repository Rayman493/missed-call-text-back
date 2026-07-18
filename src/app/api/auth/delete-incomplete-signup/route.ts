import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[delete-incomplete-signup] Delete request received')

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[delete-incomplete-signup] No authenticated user found')
      return NextResponse.json(
        { error: 'You must be signed in to delete your account' },
        { status: 401 }
      )
    }

    console.log('[delete-incomplete-signup] User:', user.id, 'Email:', user.email)

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { password } = body

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required to confirm account deletion' },
        { status: 400 }
      )
    }

    // Verify password by attempting sign-in
    if (!user.email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      )
    }

    console.log('[delete-incomplete-signup] Verifying password')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (signInError) {
      console.error('[delete-incomplete-signup] Password verification failed:', signInError.message)
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 403 }
      )
    }

    console.log('[delete-incomplete-signup] Password verified')

    // Find the optional business row for this user. Use maybeSingle so a missing
    // business is treated as "nothing to clean up", not as a server error.
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, subscription_status, user_id, twilio_phone_number_sid, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (businessError) {
      console.error('[delete-incomplete-signup] Error fetching business:', businessError)
      return NextResponse.json(
        { error: 'Could not fetch business record' },
        { status: 500 }
      )
    }

    // Safety check: only allow deletion for incomplete signup users
    if (business && business.subscription_status) {
      const activeStatuses = ['active', 'trialing', 'past_due', 'incomplete', 'beta', 'comped']
      if (activeStatuses.includes(business.subscription_status)) {
        console.error('[delete-incomplete-signup] Cannot delete: user has active subscription status', business.subscription_status)
        return NextResponse.json(
          { error: 'Account cannot be deleted this way because it has an active subscription. Please use the normal account deletion flow.' },
          { status: 403 }
        )
      }
    }

    if (business && business.user_id !== user.id) {
      console.error('[delete-incomplete-signup] Business does not belong to user')
      return NextResponse.json(
        { error: 'Business record does not belong to this user' },
        { status: 403 }
      )
    }

    // Clean up optional provisioned Twilio resources if we have a SID.
    // Defensive: swallow Twilio errors so a missing or already-released number
    // cannot block account deletion.
    if (business?.twilio_phone_number_sid) {
      try {
        const { twilioClient } = await import('@/lib/twilio')
        if (twilioClient) {
          await twilioClient.incomingPhoneNumbers(business.twilio_phone_number_sid).remove()
          console.log('[delete-incomplete-signup] Released Twilio number SID:', business.twilio_phone_number_sid)
        }
      } catch (twilioError: any) {
        console.warn('[delete-incomplete-signup] Twilio cleanup skipped/optional:', twilioError?.message || twilioError)
      }
    }

    // Delete optional Stripe customer/subscription data only where appropriate.
    // For incomplete signups there should be none, but clean up if present.
    if (business?.stripe_customer_id) {
      try {
        const { default: getStripe } = await import('@/lib/stripe')
        const stripe = getStripe()
        if (!stripe) {
          console.warn('[delete-incomplete-signup] Stripe client not available, skipping Stripe cleanup')
        } else {
          if (business.stripe_subscription_id) {
            await stripe.subscriptions.cancel(business.stripe_subscription_id)
            console.log('[delete-incomplete-signup] Cancelled Stripe subscription:', business.stripe_subscription_id)
          }
          await stripe.customers.del(business.stripe_customer_id)
          console.log('[delete-incomplete-signup] Deleted Stripe customer:', business.stripe_customer_id)
        }
      } catch (stripeError: any) {
        console.warn('[delete-incomplete-signup] Stripe cleanup skipped/optional:', stripeError?.message || stripeError)
      }
    }

    // Delete dependent records safely if a business exists.
    if (business) {
      console.log('[delete-incomplete-signup] Cleaning up dependent records for business:', business.id)
      const dependentTables = [
        'conversations',
        'leads',
        'messages',
        'call_events',
        'ai_call_records',
        'follow_up_jobs',
        'personal_voicemails',
        'ignored_contacts',
      ]
      for (const table of dependentTables) {
        try {
          const { error: dependentError } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('business_id', business.id)
          if (dependentError) {
            console.warn(`[delete-incomplete-signup] Could not delete ${table} rows:`, dependentError.message)
          }
        } catch (err: any) {
          console.warn(`[delete-incomplete-signup] ${table} cleanup skipped:`, err?.message || err)
        }
      }
    }

    // Delete business row (if exists). Missing row is treated as already deleted.
    if (business) {
      console.log('[delete-incomplete-signup] Deleting business row:', business.id)
      const { error: deleteBusinessError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .eq('id', business.id)
        .eq('user_id', user.id)

      if (deleteBusinessError) {
        console.error('[delete-incomplete-signup] Error deleting business:', deleteBusinessError)
        return NextResponse.json(
          { error: 'Could not delete business record' },
          { status: 500 }
        )
      }
      console.log('[delete-incomplete-signup] Business row deleted')
    } else {
      console.log('[delete-incomplete-signup] No business row found, skipping business deletion')
    }

    // Delete auth user using an isolated service-role client to avoid any shared
    // singleton state issues. If the user does not exist, treat it as already deleted.
    console.log('[delete-incomplete-signup] Deleting auth user:', user.id)

    const isolatedAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    try {
      const { data: userCheck, error: userCheckError } = await isolatedAdminClient.auth.admin.getUserById(user.id)
      if (userCheckError || !userCheck.user) {
        console.log('[delete-incomplete-signup] Auth user already deleted or not found:', user.id)
        return NextResponse.json({ ok: true, message: 'Account deleted successfully' })
      }
    } catch (checkError: any) {
      console.warn('[delete-incomplete-signup] Could not verify auth user existence before delete:', checkError?.message || checkError)
    }

    const { error: deleteAuthError } = await isolatedAdminClient.auth.admin.deleteUser(user.id)

    if (deleteAuthError) {
      console.error('[delete-incomplete-signup] Error deleting auth user:', deleteAuthError)

      // Best-effort idempotency: if the user cannot be found anymore, we still
      // treat the deletion as successful.
      const stillExists = await isolatedAdminClient.auth.admin.getUserById(user.id)
        .then(r => !!r.data.user)
        .catch(() => false)

      if (!stillExists) {
        console.log('[delete-incomplete-signup] Auth user no longer exists, treating deletion as successful')
        return NextResponse.json({ ok: true, message: 'Account deleted successfully' })
      }

      return NextResponse.json(
        { error: 'Could not delete auth user' },
        { status: 500 }
      )
    }

    console.log('[delete-incomplete-signup] Auth user deleted successfully')

    return NextResponse.json({ ok: true, message: 'Account deleted successfully' })
  } catch (error: any) {
    console.error('[delete-incomplete-signup] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting your account' },
      { status: 500 }
    )
  }
}
