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

    // STAGE 1: current-user lookup
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[delete-incomplete-signup] No authenticated user found', {
        code: (userError as any)?.code,
        message: (userError as any)?.message
      })
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

    // STAGE 2: password verification
    console.log('[delete-incomplete-signup] Verifying password')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (signInError) {
      console.error('[delete-incomplete-signup] Password verification failed:', {
        code: (signInError as any)?.code,
        message: (signInError as any)?.message
      })
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 403 }
      )
    }

    console.log('[delete-incomplete-signup] Password verified')

    // Find the optional business row for this user. Use maybeSingle so a missing
    // business is treated as "nothing to clean up", not as a server error.
    // STAGE 3: optional business lookup
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, subscription_status, user_id, twilio_phone_number_sid, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (businessError) {
      console.error('[delete-incomplete-signup] Error fetching business:', {
        code: (businessError as any)?.code,
        message: (businessError as any)?.message,
        details: (businessError as any)?.details,
        hint: (businessError as any)?.hint
      })
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
    // STAGE 5: Stripe cleanup (optional)
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
        console.warn('[delete-incomplete-signup] Stripe cleanup skipped/optional:', {
          message: stripeError?.message || String(stripeError),
          code: stripeError?.code
        })
      }
    }

    // STAGE 4: dependent cleanup (only if business exists)
    if (business) {
      console.log('[delete-incomplete-signup] Cleaning up dependent records for business:', business.id)

      // 1) Messages/media are not directly scoped by business_id.
      // messages: conversation_id (and lead_id)
      // message_media: message_id
      try {
        // Fetch conversation IDs for this business
        const { data: conversations } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('business_id', business.id)

        const conversationIds = (conversations || []).map((c: any) => c.id)

        // If we have conversation IDs, delete message_media then messages by conversation
        if (conversationIds.length > 0) {
          // Get message IDs for message_media cleanup
          const { data: conversationMessages } = await supabaseAdmin
            .from('messages')
            .select('id')
            .in('conversation_id', conversationIds)

          const messageIds = (conversationMessages || []).map((m: any) => m.id)

          if (messageIds.length > 0) {
            const { error: mmErr } = await supabaseAdmin
              .from('message_media')
              .delete()
              .in('message_id', messageIds)
            if (mmErr) {
              console.warn('[delete-incomplete-signup] message_media cleanup warning:', mmErr.message)
            }
          }

          const { error: msgByConvErr } = await supabaseAdmin
            .from('messages')
            .delete()
            .in('conversation_id', conversationIds)
          if (msgByConvErr) {
            console.warn('[delete-incomplete-signup] messages (by conversation_id) cleanup warning:', msgByConvErr.message)
          }
        }

        // Also fetch lead IDs and delete any messages scoped only by lead_id (no conversation)
        const { data: leads } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('business_id', business.id)

        const leadIds = (leads || []).map((l: any) => l.id)
        if (leadIds.length > 0) {
          const { error: msgByLeadErr } = await supabaseAdmin
            .from('messages')
            .delete()
            .in('lead_id', leadIds)
          if (msgByLeadErr) {
            console.warn('[delete-incomplete-signup] messages (by lead_id) cleanup warning:', msgByLeadErr.message)
          }
        }

        // Now delete conversations (parents) for this business
        const { error: convErr } = await supabaseAdmin
          .from('conversations')
          .delete()
          .eq('business_id', business.id)
        if (convErr) {
          console.warn('[delete-incomplete-signup] conversations cleanup warning:', convErr.message)
        }
      } catch (err: any) {
        console.warn('[delete-incomplete-signup] Conversation/message cleanup skipped:', err?.message || err)
      }

      // 2) Tables directly scoped by business_id
      const tablesByBusinessId = [
        'follow_up_jobs',
        'notifications',
        'ai_call_records',
        'voicemail_recordings',
        'call_events',
        'ai_call_failures',
        'personal_voicemails',
        'ignored_contacts',
      ] as const

      for (const table of tablesByBusinessId) {
        try {
          const { error: dependentError } = await supabaseAdmin
            .from(table as string)
            .delete()
            .eq('business_id', business.id)
          if (dependentError) {
            console.warn(`[delete-incomplete-signup] Could not delete ${table} rows:`, dependentError.message)
          }
        } catch (err: any) {
          console.warn(`[delete-incomplete-signup] ${table} cleanup skipped:`, err?.message || err)
        }
      }

      // 3) Finally delete leads for this business
      try {
        const { error: leadsErr } = await supabaseAdmin
          .from('leads')
          .delete()
          .eq('business_id', business.id)
        if (leadsErr) {
          console.warn('[delete-incomplete-signup] leads cleanup warning:', leadsErr.message)
        }
      } catch (err: any) {
        console.warn('[delete-incomplete-signup] leads cleanup skipped:', err?.message || err)
      }
    }

    // STAGE 7: business deletion (if exists)
    if (business) {
      console.log('[delete-incomplete-signup] Deleting business row:', business.id)
      const { error: deleteBusinessError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .eq('id', business.id)
        .eq('user_id', user.id)

      if (deleteBusinessError) {
        console.error('[delete-incomplete-signup] Error deleting business:', {
          code: (deleteBusinessError as any)?.code,
          message: (deleteBusinessError as any)?.message,
          details: (deleteBusinessError as any)?.details,
          hint: (deleteBusinessError as any)?.hint
        })
        return NextResponse.json(
          { error: 'Could not delete business record' },
          { status: 500 }
        )
      }
      console.log('[delete-incomplete-signup] Business row deleted')
    } else {
      console.log('[delete-incomplete-signup] No business row found; skipping resource cleanup and business deletion')
    }

    // STAGE 8: auth admin user deletion
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
        console.log('[delete-incomplete-signup] Auth user already deleted or not found:', {
          userId: user.id,
          code: (userCheckError as any)?.code,
          message: (userCheckError as any)?.message
        })
        return NextResponse.json({ ok: true, message: 'Account deleted successfully' })
      }
    } catch (checkError: any) {
      console.warn('[delete-incomplete-signup] Could not verify auth user existence before delete:', {
        message: checkError?.message || String(checkError)
      })
    }

    const { error: deleteAuthError } = await isolatedAdminClient.auth.admin.deleteUser(user.id)

    if (deleteAuthError) {
      console.error('[delete-incomplete-signup] Error deleting auth user:', {
        code: (deleteAuthError as any)?.code,
        message: (deleteAuthError as any)?.message
      })

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
