import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import getStripe from '@/lib/stripe'

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

export async function POST(request: NextRequest) {
  try {
    // Check required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[delete-account] Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      )
    }

    // Authenticate user using server-side client with RLS
    const supabase = createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[delete-account] Authentication failed:', authError)
      return NextResponse.json(
        { ok: false, step: 'auth', error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('[delete-account] Authenticated user:', user.id)

    // Step 1: Find all businesses for this user (include Stripe + Twilio fields)
    console.log('[delete-account] Step 1: find businesses')
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, twilio_phone_number, twilio_phone_number_sid, name, trial_ends_at, created_at')
      .eq('user_id', user.id)

    if (businessesError) {
      console.error('[delete-account] Step 1 failed:', businessesError)
      return NextResponse.json(
        { ok: false, step: 'fetch_businesses', error: businessesError.message, details: businessesError },
        { status: 500 }
      )
    }

    const businessIds = businesses?.map((b: any) => b.id) || []

    // Step 1.5: Cancel any active Stripe subscriptions BEFORE deleting data.
    // If cancellation fails, abort the deletion so the user is never soft-locked.
    if (businesses && businesses.length > 0) {
      const stripe = getStripe()
      const subsToCancel = (businesses as any[]).filter(
        (b) => b.stripe_subscription_id && ACTIVE_SUB_STATUSES.has(b.subscription_status || '')
      )

      if (subsToCancel.length > 0) {
        if (!stripe) {
          console.error('[delete-account] Stripe client unavailable, cannot cancel subscription')
          return NextResponse.json(
            { ok: false, step: 'stripe_init', error: 'Billing service unavailable. Please try again later.' },
            { status: 503 }
          )
        }

        for (const b of subsToCancel) {
          console.log('[delete-account] Cancelling Stripe subscription:', b.stripe_subscription_id)
          try {
            const cancelled = await stripe.subscriptions.cancel(b.stripe_subscription_id)
            console.log('[delete-account] Stripe cancellation result:', {
              id: cancelled.id,
              status: cancelled.status,
            })
            if (cancelled.status !== 'canceled') {
              throw new Error(`Stripe returned unexpected status: ${cancelled.status}`)
            }
            // Reflect cancellation in DB before continuing
            await supabaseAdmin
              .from('businesses')
              .update({ subscription_status: 'canceled' })
              .eq('id', b.id)
          } catch (cancelErr: any) {
            // Already-cancelled subscriptions sometimes return a 404 / resource_missing
            const code = cancelErr?.code || cancelErr?.raw?.code
            if (code === 'resource_missing') {
              console.warn('[delete-account] Subscription already gone in Stripe, continuing:', b.stripe_subscription_id)
            } else {
              console.error('[delete-account] Stripe cancellation failed:', cancelErr)
              return NextResponse.json(
                {
                  ok: false,
                  step: 'stripe_cancel',
                  error: 'Failed to cancel your subscription. Your account was not deleted. Please try again or contact support.',
                  details: cancelErr?.message || String(cancelErr),
                },
                { status: 502 }
              )
            }
          }
        }
      } else {
        console.log('[delete-account] No active Stripe subscriptions to cancel')
      }

      // Step 1.6: Twilio number release - log only for now (full release not implemented yet)
      for (const b of businesses as any[]) {
        if (b.twilio_phone_number_sid) {
          console.log('[delete-account] TODO: release Twilio number', {
            businessId: b.id,
            phoneNumber: b.twilio_phone_number,
            sid: b.twilio_phone_number_sid,
          })
        }
      }
    }
    console.log('[delete-account] businesses:', businesses)
    console.log('[delete-account] businessIds:', businessIds)

    if (businessIds.length === 0) {
      console.log('[delete-account] No businesses found, skipping data deletion')
    } else {
      // Step 2: Find all leads for these businesses
      console.log('[delete-account] Step 2: find leads')
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('business_id', businessIds)

      if (leadsError) {
        console.error('[delete-account] Step 2 failed:', leadsError)
        return NextResponse.json(
          { ok: false, step: 'fetch_leads', error: leadsError.message, details: leadsError },
          { status: 500 }
        )
      }

      const leadIds = leads?.map(l => l.id) || []
      console.log('[delete-account] leadIds:', leadIds)

      // Step 3: Delete messages linked to leads
      if (leadIds.length > 0) {
        console.log('[delete-account] Step 3: delete messages')
        const { error: messagesError } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('lead_id', leadIds)

        if (messagesError) {
          console.error('[delete-account] Step 3 failed:', messagesError)
          return NextResponse.json(
            { ok: false, step: 'delete_messages', error: messagesError.message, details: messagesError },
            { status: 500 }
          )
        }
        console.log('[delete-account] Step 3 completed: deleted messages')
      } else {
        console.log('[delete-account] Step 3 skipped: no leads to delete messages for')
      }

      // Step 4: Delete follow_up_jobs linked to businesses
      console.log('[delete-account] Step 4: delete follow_up_jobs')
      const { error: followUpJobsError } = await supabaseAdmin
        .from('follow_up_jobs')
        .delete()
        .in('business_id', businessIds)

      if (followUpJobsError) {
        console.error('[delete-account] Step 4 failed:', followUpJobsError)
        return NextResponse.json(
          { ok: false, step: 'delete_follow_up_jobs', error: followUpJobsError.message, details: followUpJobsError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 4 completed: deleted follow_up_jobs')

      // Step 5: Delete conversations linked to businesses
      console.log('[delete-account] Step 5: delete conversations')
      const { error: conversationsError } = await supabaseAdmin
        .from('conversations')
        .delete()
        .in('business_id', businessIds)

      if (conversationsError) {
        console.error('[delete-account] Step 5 failed:', conversationsError)
        return NextResponse.json(
          { ok: false, step: 'delete_conversations', error: conversationsError.message, details: conversationsError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 5 completed: deleted conversations')

      // Step 6: Delete follow_ups linked to businesses
      console.log('[delete-account] Step 6: delete follow_ups')
      const { error: followUpsError } = await supabaseAdmin
        .from('follow_ups')
        .delete()
        .in('business_id', businessIds)

      if (followUpsError) {
        console.error('[delete-account] Step 6 failed:', followUpsError)
        return NextResponse.json(
          { ok: false, step: 'delete_follow_ups', error: 'Failed to delete account data. Please try again or contact support.', details: followUpsError.message },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 6 completed: deleted follow_ups')

      // Step 7: Delete call_events linked to businesses
      console.log('[delete-account] Step 7: delete call_events')
      const { error: callEventsError } = await supabaseAdmin
        .from('call_events')
        .delete()
        .in('business_id', businessIds)

      if (callEventsError) {
        console.error('[delete-account] Step 7 failed:', callEventsError)
        return NextResponse.json(
          { ok: false, step: 'delete_call_events', error: 'Failed to delete account data. Please try again or contact support.', details: callEventsError.message },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 7 completed: deleted call_events')

      // Step 8: Delete ignored_contacts linked to businesses
      console.log('[delete-account] Step 8: delete ignored_contacts')
      const { error: ignoredContactsError } = await supabaseAdmin
        .from('ignored_contacts')
        .delete()
        .in('business_id', businessIds)

      if (ignoredContactsError) {
        console.error('[delete-account] Step 8 failed:', ignoredContactsError)
        return NextResponse.json(
          { ok: false, step: 'delete_ignored_contacts', error: 'Failed to delete account data. Please try again or contact support.', details: ignoredContactsError.message },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 8 completed: deleted ignored_contacts')

      // Step 9: Delete twilio_numbers linked to businesses
      console.log('[delete-account] Step 9: delete twilio_numbers')
      const { error: twilioNumbersError } = await supabaseAdmin
        .from('twilio_numbers')
        .delete()
        .in('business_id', businessIds)

      if (twilioNumbersError) {
        console.error('[delete-account] Step 9 failed:', twilioNumbersError)
        return NextResponse.json(
          { ok: false, step: 'delete_twilio_numbers', error: 'Failed to delete account data. Please try again or contact support.', details: twilioNumbersError.message },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 9 completed: deleted twilio_numbers')

      // Step 10: Delete leads linked to businesses
      console.log('[delete-account] Step 10: delete leads')
      const { error: leadsDeleteError } = await supabaseAdmin
        .from('leads')
        .delete()
        .in('business_id', businessIds)

      if (leadsDeleteError) {
        console.error('[delete-account] Step 10 failed:', leadsDeleteError)
        return NextResponse.json(
          { ok: false, step: 'delete_leads', error: 'Failed to delete account data. Please try again or contact support.', details: leadsDeleteError.message },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 10 completed: deleted leads')

      // Step 11: Soft-delete businesses and record trial history
      console.log('[delete-account] Step 11: soft-delete businesses and record trial history')
      
      for (const business of businesses as any[]) {
        // Record trial history before soft-deleting
        if (business.stripe_customer_id || business.trial_ends_at) {
          const trialHistoryData = {
            business_id: business.id,
            business_phone_number: business.twilio_phone_number,
            business_email: null, // business_email column doesn't exist in schema
            business_domain: null, // derived from business_email which doesn't exist
            stripe_customer_id: business.stripe_customer_id,
            stripe_subscription_id: business.stripe_subscription_id,
            trial_started_at: business.created_at,
            trial_ended_at: business.trial_ends_at,
            trial_status: business.subscription_status === 'trialing' ? 'canceled' : 
                          business.subscription_status === 'active' ? 'converted' : 
                          business.subscription_status === 'inactive' ? 'completed' : 'canceled',
            subscription_status: business.subscription_status,
            user_id: user.id,
            account_deleted_at: new Date().toISOString(),
            account_deleted_by: 'self',
            deletion_reason: 'user_request',
          }
          
          const { error: trialHistoryError } = await supabaseAdmin
            .from('trial_history')
            .insert(trialHistoryData)
          
          if (trialHistoryError) {
            console.error('[delete-account] Failed to record trial history for business:', business.id, trialHistoryError)
            // Don't fail the deletion if trial history recording fails, but log it
          } else {
            console.log('[delete-account] Recorded trial history for business:', business.id)
          }
        }
        
        // Soft-delete the business (preserve data for abuse prevention)
        const { error: businessesSoftDeleteError } = await supabaseAdmin
          .from('businesses')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: 'self',
            deletion_reason: 'user_request',
          })
          .eq('id', business.id)

        if (businessesSoftDeleteError) {
          console.error('[delete-account] Step 11 soft-delete failed:', businessesSoftDeleteError)
          return NextResponse.json(
            { ok: false, step: 'soft_delete_businesses', error: 'Failed to delete account data. Please try again or contact support.', details: businessesSoftDeleteError.message },
            { status: 500 }
          )
        }
      }
      console.log('[delete-account] Step 11 completed: soft-deleted businesses and recorded trial history')
    }

    // Step 12: Delete the Supabase Auth user last
    console.log('[delete-account] Step 12: delete auth user')
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      console.error('[delete-account] Step 12 failed:', deleteUserError)
      return NextResponse.json(
        { ok: false, step: 'delete_auth_user', error: 'Failed to delete your account. Please try again or contact support.', details: deleteUserError.message },
        { status: 500 }
      )
    }

    console.log('[delete-account] Step 12 completed: deleted auth user')
    console.log('[delete-account] Successfully deleted user and all data')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, step: 'unexpected', error: 'An unexpected error occurred. Please try again or contact support.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
