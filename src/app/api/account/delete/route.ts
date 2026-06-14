import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import getStripe from '@/lib/stripe'
import { twilioClient } from '@/lib/twilio'
import { sendOffboardingEmail } from '@/lib/email'

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

interface DeleteResult {
  ok: boolean
  step?: string
  error?: string
  details?: any
  dryRun?: boolean
  summary?: {
    userId: string
    businessId?: string
    tablesDeleted: { [key: string]: number }
    twilioNumberReleased?: string
    authDeletionResult?: string
    stripeResult?: {
      customerId: string | null
      subscriptionId: string | null
      cancellationAttempted: boolean
      cancellationSucceeded: boolean
      error: string | null
      dryRun?: boolean
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for dry-run mode
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    if (dryRun) {
      console.log('[delete-account] DRY RUN MODE - No actual deletions will occur')
    }

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

    // Summary object for logging
    const summary: any = {
      userId: user.id,
      tablesDeleted: {} as { [key: string]: number },
      stripeResult: {
        customerId: null,
        subscriptionId: null,
        cancellationAttempted: false,
        cancellationSucceeded: false,
        error: null,
      },
    }

    // Step 1: Find all businesses for this user (include Stripe + Twilio fields + reservation metadata)
    console.log('[delete-account] Step 1: find businesses')
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, twilio_phone_number, twilio_phone_number_sid, name, trial_ends_at, created_at, user_id, business_phone_number')
      .eq('user_id', user.id)

    if (businessesError) {
      console.error('[delete-account] Step 1 failed:', businessesError)
      return NextResponse.json(
        { ok: false, step: 'fetch_businesses', error: businessesError.message, details: businessesError },
        { status: 500 }
      )
    }

    const businessIds = businesses?.map((b: any) => b.id) || []
    summary.businessId = businessIds[0]

    // Populate Stripe result from first business
    if (businesses && businesses.length > 0) {
      summary.stripeResult.customerId = businesses[0].stripe_customer_id || null
      summary.stripeResult.subscriptionId = businesses[0].stripe_subscription_id || null
    }

    console.log('[delete-account] Found businesses:', businessIds.length, businessIds)

    // Step 2: Cancel any active Stripe subscriptions BEFORE deleting any data
    console.log('[delete-account] Step 2: Cancel Stripe subscriptions (before data deletion)')
    if (!dryRun && businesses && businesses.length > 0) {
      const stripe = getStripe()
      const subsToCancel = (businesses as any[]).filter(
        (b) => b.stripe_subscription_id && ACTIVE_SUB_STATUSES.has(b.subscription_status || '')
      )

      if (subsToCancel.length > 0) {
        console.log('[delete-account] Found active Stripe subscriptions to cancel:', subsToCancel.map((b) => b.stripe_subscription_id))
        
        if (!stripe) {
          console.error('[delete-account] Stripe client unavailable, cannot cancel subscription')
          return NextResponse.json(
            { ok: false, step: 'stripe_init', error: 'Billing service unavailable. Please try again later.' },
            { status: 503 }
          )
        }

        for (const b of subsToCancel) {
          console.log('[delete-account] Attempting to cancel Stripe subscription:', b.stripe_subscription_id)
          summary.stripeResult.cancellationAttempted = true

          try {
            const cancelled = await stripe.subscriptions.cancel(b.stripe_subscription_id)
            console.log('[delete-account] Stripe cancellation result:', {
              subscriptionId: cancelled.id,
              status: cancelled.status,
              customerId: b.stripe_customer_id
            })
            
            if (cancelled.status !== 'canceled') {
              throw new Error(`Stripe returned unexpected status: ${cancelled.status}`)
            }

            // Successful cancellation
            summary.stripeResult.cancellationSucceeded = true
            console.log('[delete-account] Stripe subscription cancelled successfully', {
              customerId: b.stripe_customer_id,
              subscriptionId: b.stripe_subscription_id,
              status: cancelled.status
            })

            // Reflect cancellation in DB before continuing
            const { error: updateError } = await supabaseAdmin
              .from('businesses')
              .update({ subscription_status: 'canceled' })
              .eq('id', b.id)

            if (updateError) {
              console.warn('[delete-account] Failed to update subscription_status in DB after Stripe cancellation:', updateError)
            } else {
              console.log('[delete-account] Updated subscription_status to canceled in DB')
            }
          } catch (cancelErr: any) {
            // Already-cancelled subscriptions sometimes return a 404 / resource_missing
            const code = cancelErr?.code || cancelErr?.raw?.code
            if (code === 'resource_missing') {
              console.warn('[delete-account] Subscription already gone in Stripe, continuing:', b.stripe_subscription_id)
              summary.stripeResult.cancellationSucceeded = true // Already cancelled
            } else {
              summary.stripeResult.cancellationSucceeded = false
              summary.stripeResult.error = cancelErr?.message || String(cancelErr)
              console.error('[delete-account] Stripe cancellation failed', {
                customerId: b.stripe_customer_id,
                subscriptionId: b.stripe_subscription_id,
                error: cancelErr?.message || String(cancelErr),
                code: code
              })
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
        summary.stripeResult.cancellationAttempted = false
        summary.stripeResult.cancellationSucceeded = true // No subscription to cancel is a success
      }
    } else if (dryRun && businesses && businesses.length > 0) {
      // Dry-run mode: just log that cancellation would be attempted
      const subsToCancel = (businesses as any[]).filter(
        (b) => b.stripe_subscription_id && ACTIVE_SUB_STATUSES.has(b.subscription_status || '')
      )
      if (subsToCancel.length > 0) {
        console.log('[delete-account] DRY RUN: Would cancel Stripe subscriptions:', subsToCancel.map((b) => b.stripe_subscription_id))
      }
      summary.stripeResult.dryRun = true
    } else {
      console.log('[delete-account] No businesses or dry-run mode, skipping Stripe cancellation')
    }

    console.log('[delete-account] Step 2 completed: Stripe cancellation handled', {
      cancellationAttempted: summary.stripeResult.cancellationAttempted,
      cancellationSucceeded: summary.stripeResult.cancellationSucceeded,
      error: summary.stripeResult.error
    })

    // Send offboarding email before deletion (with idempotency check)
    if (!dryRun && businesses && businesses.length > 0) {
      const business = businesses[0] // Use first business for email
      const userEmail = user.email
      
      // Check if offboarding email was already sent (idempotency)
      const { data: existingTrialHistory } = await supabaseAdmin
        .from('trial_history')
        .select('offboarding_email_sent, offboarding_email_sent_at')
        .eq('business_id', business.id)
        .single()
      
      const emailAlreadySent = existingTrialHistory?.offboarding_email_sent === true
      
      if (!emailAlreadySent && userEmail) {
        console.log('[delete-account] Sending offboarding email', {
          businessId: business.id,
          businessName: business.name,
          userEmail,
        })
        
        const emailResult = await sendOffboardingEmail({
          businessName: business.name || 'Customer',
          businessPhone: business.twilio_phone_number,
          replyFlowNumber: business.twilio_phone_number, // Same as business phone in this context
          userEmail,
        })
        
        if (emailResult.success) {
          console.log('[delete-account] Offboarding email sent successfully', {
            messageId: emailResult.messageId,
          })
          // Store email sent status in summary for later recording
          summary.offboardingEmailSent = true
          summary.offboardingEmailMessageId = emailResult.messageId
        } else {
          console.warn('[delete-account] Failed to send offboarding email (continuing deletion)', {
            error: emailResult.error,
          })
          summary.offboardingEmailSent = false
          summary.offboardingEmailError = emailResult.error
        }
      } else if (emailAlreadySent) {
        console.log('[delete-account] Offboarding email already sent, skipping', {
          businessId: business.id,
          sentAt: existingTrialHistory?.offboarding_email_sent_at,
        })
        summary.offboardingEmailSent = false
        summary.offboardingEmailSkipped = true
        summary.offboardingEmailSkippedReason = 'already_sent'
      } else {
        console.warn('[delete-account] No user email available, skipping offboarding email')
        summary.offboardingEmailSent = false
        summary.offboardingEmailSkipped = true
        summary.offboardingEmailSkippedReason = 'no_email'
      }
    }

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
      console.log('[delete-account] Found leads:', leadIds.length)

      // Step 3: Delete message_media linked to messages
      if (leadIds.length > 0) {
        console.log('[delete-account] Step 3: delete message_media')
        
        // First get message IDs for these leads
        const { data: messages } = await supabaseAdmin
          .from('messages')
          .select('id')
          .in('lead_id', leadIds)
        
        const messageIds = messages?.map(m => m.id) || []
        
        if (messageIds.length > 0) {
          const { error: messageMediaError, count } = await supabaseAdmin
            .from('message_media')
            .delete()
            .in('message_id', messageIds)
            .select()

          if (messageMediaError) {
            console.error('[delete-account] Step 3 failed:', messageMediaError)
            return NextResponse.json(
              { ok: false, step: 'delete_message_media', error: messageMediaError.message, details: messageMediaError },
              { status: 500 }
            )
          }
          summary.tablesDeleted.message_media = count || 0
          console.log('[delete-account] Step 3 completed: deleted message_media:', count)
        }
      }

      // Step 4: Delete messages linked to leads
      if (leadIds.length > 0) {
        console.log('[delete-account] Step 4: delete messages')
        
        const { error: messagesError, count } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('lead_id', leadIds)
          .select()

        if (messagesError) {
          console.error('[delete-account] Step 4 failed:', messagesError)
          return NextResponse.json(
            { ok: false, step: 'delete_messages', error: messagesError.message, details: messagesError },
            { status: 500 }
          )
        }
        summary.tablesDeleted.messages = count || 0
        console.log('[delete-account] Step 4 completed: deleted messages:', count)
      }

      // Step 5: Delete notifications linked to businesses
      console.log('[delete-account] Step 5: delete notifications')
      
      const { error: notificationsError, count: notificationsCount } = await supabaseAdmin
        .from('notifications')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (notificationsError) {
        console.error('[delete-account] Step 5 failed:', notificationsError)
        return NextResponse.json(
          { ok: false, step: 'delete_notifications', error: notificationsError.message, details: notificationsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.notifications = notificationsCount || 0
      console.log('[delete-account] Step 5 completed: deleted notifications:', notificationsCount)

      // Step 6: Delete follow_up_jobs linked to businesses
      console.log('[delete-account] Step 6: delete follow_up_jobs')
      
      const { error: followUpJobsError, count: followUpJobsCount } = await supabaseAdmin
        .from('follow_up_jobs')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (followUpJobsError) {
        console.error('[delete-account] Step 6 failed:', followUpJobsError)
        return NextResponse.json(
          { ok: false, step: 'delete_follow_up_jobs', error: followUpJobsError.message, details: followUpJobsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.follow_up_jobs = followUpJobsCount || 0
      console.log('[delete-account] Step 6 completed: deleted follow_up_jobs:', followUpJobsCount)

      // Step 7: Delete conversations linked to businesses
      console.log('[delete-account] Step 7: delete conversations')
      
      const { error: conversationsError, count: conversationsCount } = await supabaseAdmin
        .from('conversations')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (conversationsError) {
        console.error('[delete-account] Step 7 failed:', conversationsError)
        return NextResponse.json(
          { ok: false, step: 'delete_conversations', error: conversationsError.message, details: conversationsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.conversations = conversationsCount || 0
      console.log('[delete-account] Step 7 completed: deleted conversations:', conversationsCount)

      // Step 8: Delete ai_call_records linked to businesses
      console.log('[delete-account] Step 8: delete ai_call_records')
      
      const { error: aiCallRecordsError, count: aiCallRecordsCount } = await supabaseAdmin
        .from('ai_call_records')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (aiCallRecordsError) {
        console.error('[delete-account] Step 8 failed:', aiCallRecordsError)
        return NextResponse.json(
          { ok: false, step: 'delete_ai_call_records', error: aiCallRecordsError.message, details: aiCallRecordsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.ai_call_records = aiCallRecordsCount || 0
      console.log('[delete-account] Step 8 completed: deleted ai_call_records:', aiCallRecordsCount)

      // Step 9: Delete ai_call_sessions linked to businesses
      console.log('[delete-account] Step 9: delete ai_call_sessions')
      
      const { error: aiCallSessionsError, count: aiCallSessionsCount } = await supabaseAdmin
        .from('ai_call_sessions')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (aiCallSessionsError) {
        console.error('[delete-account] Step 9 failed:', aiCallSessionsError)
        return NextResponse.json(
          { ok: false, step: 'delete_ai_call_sessions', error: aiCallSessionsError.message, details: aiCallSessionsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.ai_call_sessions = aiCallSessionsCount || 0
      console.log('[delete-account] Step 9 completed: deleted ai_call_sessions:', aiCallSessionsCount)

      // Step 10: Delete ai_call_failures linked to businesses
      console.log('[delete-account] Step 10: delete ai_call_failures')
      
      const { error: aiCallFailuresError, count: aiCallFailuresCount } = await supabaseAdmin
        .from('ai_call_failures')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (aiCallFailuresError) {
        console.error('[delete-account] Step 10 failed:', aiCallFailuresError)
        return NextResponse.json(
          { ok: false, step: 'delete_ai_call_failures', error: aiCallFailuresError.message, details: aiCallFailuresError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.ai_call_failures = aiCallFailuresCount || 0
      console.log('[delete-account] Step 10 completed: deleted ai_call_failures:', aiCallFailuresCount)

      // Step 11: Delete voicemail_recordings linked to businesses
      console.log('[delete-account] Step 11: delete voicemail_recordings')
      
      const { error: voicemailRecordingsError, count: voicemailRecordingsCount } = await supabaseAdmin
        .from('voicemail_recordings')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (voicemailRecordingsError) {
        console.error('[delete-account] Step 11 failed:', voicemailRecordingsError)
        return NextResponse.json(
          { ok: false, step: 'delete_voicemail_recordings', error: voicemailRecordingsError.message, details: voicemailRecordingsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.voicemail_recordings = voicemailRecordingsCount || 0
      console.log('[delete-account] Step 11 completed: deleted voicemail_recordings:', voicemailRecordingsCount)

      // Step 12: Delete calendar_integrations linked to businesses
      console.log('[delete-account] Step 12: delete calendar_integrations')
      
      const { error: calendarIntegrationsError, count: calendarIntegrationsCount } = await supabaseAdmin
        .from('calendar_integrations')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (calendarIntegrationsError) {
        console.error('[delete-account] Step 12 failed:', calendarIntegrationsError)
        return NextResponse.json(
          { ok: false, step: 'delete_calendar_integrations', error: calendarIntegrationsError.message, details: calendarIntegrationsError },
          { status: 500 }
        )
      }
      summary.tablesDeleted.calendar_integrations = calendarIntegrationsCount || 0
      console.log('[delete-account] Step 12 completed: deleted calendar_integrations:', calendarIntegrationsCount)

      // Step 13: Delete follow_ups linked to businesses
      console.log('[delete-account] Step 13: delete follow_ups')
      
      const { error: followUpsError, count: followUpsCount } = await supabaseAdmin
        .from('follow_ups')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (followUpsError) {
        console.error('[delete-account] Step 13 failed:', followUpsError)
        return NextResponse.json(
          { ok: false, step: 'delete_follow_ups', error: 'Failed to delete account data. Please try again or contact support.', details: followUpsError.message },
          { status: 500 }
        )
      }
      summary.tablesDeleted.follow_ups = followUpsCount || 0
      console.log('[delete-account] Step 13 completed: deleted follow_ups:', followUpsCount)

      // Step 14: Delete call_events linked to businesses
      console.log('[delete-account] Step 14: delete call_events')
      
      const { error: callEventsError, count: callEventsCount } = await supabaseAdmin
        .from('call_events')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (callEventsError) {
        console.error('[delete-account] Step 14 failed:', callEventsError)
        return NextResponse.json(
          { ok: false, step: 'delete_call_events', error: 'Failed to delete account data. Please try again or contact support.', details: callEventsError.message },
          { status: 500 }
        )
      }
      summary.tablesDeleted.call_events = callEventsCount || 0
      console.log('[delete-account] Step 14 completed: deleted call_events:', callEventsCount)

      // Step 15: Delete ignored_contacts linked to businesses
      console.log('[delete-account] Step 15: delete ignored_contacts')
      
      const { error: ignoredContactsError, count: ignoredContactsCount } = await supabaseAdmin
        .from('ignored_contacts')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (ignoredContactsError) {
        console.error('[delete-account] Step 15 failed:', ignoredContactsError)
        return NextResponse.json(
          { ok: false, step: 'delete_ignored_contacts', error: 'Failed to delete account data. Please try again or contact support.', details: ignoredContactsError.message },
          { status: 500 }
        )
      }
      summary.tablesDeleted.ignored_contacts = ignoredContactsCount || 0
      console.log('[delete-account] Step 15 completed: deleted ignored_contacts:', ignoredContactsCount)

      // Step 16: Delete stripe_webhook_events linked to businesses (if table exists)
      console.log('[delete-account] Step 16: delete stripe_webhook_events')
      
      const { error: stripeWebhookEventsError, count: stripeWebhookEventsCount } = await supabaseAdmin
        .from('stripe_webhook_events')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (stripeWebhookEventsError) {
        console.error('[delete-account] Step 16 failed:', stripeWebhookEventsError)
        // Don't fail if this table doesn't exist or fails
        console.warn('[delete-account] stripe_webhook_events deletion failed, continuing:', stripeWebhookEventsError)
      } else {
        summary.tablesDeleted.stripe_webhook_events = stripeWebhookEventsCount || 0
        console.log('[delete-account] Step 16 completed: deleted stripe_webhook_events:', stripeWebhookEventsCount)
      }

      // Step 17: Reserve Twilio numbers for 30-day grace period
      console.log('[delete-account] Step 17: reserve twilio_numbers for 30-day grace period')

      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      for (const business of businesses as any[]) {
        if (business.twilio_phone_number_sid) {
          console.log('[delete-account] Reserving Twilio number for 30-day grace period', {
            businessId: business.id,
            phoneNumber: business.twilio_phone_number,
            sid: business.twilio_phone_number_sid,
          })

          if (!dryRun) {
            // Get current status for logging
            const { data: currentNumber } = await supabaseAdmin
              .from('twilio_numbers')
              .select('phone_number, status, business_id')
              .eq('business_id', business.id)
              .single()

            // Prepare reservation data (schema-safe: only include columns that exist in production)
            const reservationData = {
              status: 'reserved',
              business_id: null, // Clear business_id
              reserved_for_business_id: business.id,
              reserved_at: new Date().toISOString(),
              reserved_expires_at: thirtyDaysFromNow.toISOString(),
              reservation_reason: 'account_deletion',
              reserved_owner_email: user.email,
              reserved_business_phone: business.business_phone_number || business.twilio_phone_number,
              reserved_stripe_customer_id: business.stripe_customer_id,
              reserved_user_id: user.id,
              // Note: detached_at and detached_reason are not included as they don't exist in production schema
            }
            console.log('[delete-account] Reservation data:', reservationData)

            const { error: twilioReserveError, data: reserveData, count: reserveCount } = await supabaseAdmin
              .from('twilio_numbers')
              .update(reservationData)
              .eq('business_id', business.id)

            console.log('[delete-account] Twilio reservation UPDATE result:', {
              error: twilioReserveError,
              data: reserveData,
              count: reserveCount,
            })

            if (twilioReserveError) {
              console.error('[delete-account] Failed to reserve Twilio number in DB:', twilioReserveError)
              return NextResponse.json(
                { ok: false, step: 'reserve_twilio_number', error: 'Failed to reserve Twilio number. Please try again or contact support.', details: twilioReserveError.message },
                { status: 500 }
              )
            }

            // Log the status change
            console.log('[delete-account] Twilio number reserved for 30-day grace period', {
              previous_business_id: business.id,
              phone_number: business.twilio_phone_number,
              old_status: currentNumber?.status || 'unknown',
              new_status: 'reserved',
              reserved_for_business_id: business.id,
              reserved_owner_email: user.email,
              reserved_business_phone: business.business_phone_number || business.twilio_phone_number,
              reserved_stripe_customer_id: business.stripe_customer_id,
              reserved_user_id: user.id,
              reserved_at: new Date().toISOString(),
              reserved_expires_at: thirtyDaysFromNow.toISOString(),
              reservation_reason: 'account_deletion',
            })
          }

          summary.twilioNumberReleased = business.twilio_phone_number
          console.log('[delete-account] Twilio number reserved:', business.twilio_phone_number)
        }
      }
      summary.tablesDeleted.twilio_numbers_released = businesses.filter((b: any) => b.twilio_phone_number_sid).length
      console.log('[delete-account] Step 17 completed: reserved twilio_numbers for 30-day grace period')

      // Step 18: Delete leads linked to businesses
      console.log('[delete-account] Step 18: delete leads')
      
      const { error: leadsDeleteError, count: leadsCount } = await supabaseAdmin
        .from('leads')
        .delete()
        .in('business_id', businessIds)
        .select()

      if (leadsDeleteError) {
        console.error('[delete-account] Step 18 failed:', leadsDeleteError)
        return NextResponse.json(
          { ok: false, step: 'delete_leads', error: 'Failed to delete account data. Please try again or contact support.', details: leadsDeleteError.message },
          { status: 500 }
        )
      }
      summary.tablesDeleted.leads = leadsCount || 0
      console.log('[delete-account] Step 18 completed: deleted leads:', leadsCount)

      // Step 19: Hard-delete businesses and record trial history
      console.log('[delete-account] Step 19: hard-delete businesses and record trial history')
      
      for (const business of businesses as any[]) {
        // Record trial history before deleting
        if (business.stripe_customer_id || business.trial_ends_at) {
          const trialHistoryData = {
            business_id: business.id,
            business_phone_number: business.twilio_phone_number,
            business_email: null,
            business_domain: null,
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
            offboarding_email_sent: summary.offboardingEmailSent || false,
            offboarding_email_sent_at: summary.offboardingEmailSent ? new Date().toISOString() : null,
            offboarding_email_message_id: summary.offboardingEmailMessageId || null,
          }
          
          if (!dryRun) {
            const { error: trialHistoryError } = await supabaseAdmin
              .from('trial_history')
              .insert(trialHistoryData)
            
            if (trialHistoryError) {
              console.error('[delete-account] Failed to record trial history for business:', business.id, trialHistoryError)
            } else {
              console.log('[delete-account] Recorded trial history for business:', business.id)
            }
          }
        }
        
        // Hard-delete the business row
        if (!dryRun) {
          const { error: businessesDeleteError } = await supabaseAdmin
            .from('businesses')
            .delete()
            .eq('id', business.id)

          if (businessesDeleteError) {
            console.error('[delete-account] Step 21 hard-delete failed:', businessesDeleteError)
            return NextResponse.json(
              { ok: false, step: 'delete_businesses', error: 'Failed to delete account data. Please try again or contact support.', details: businessesDeleteError.message },
              { status: 500 }
            )
          }
        }
      }
      summary.tablesDeleted.businesses = businesses.length
      console.log('[delete-account] Step 21 completed: hard-deleted businesses and recorded trial history')
    }

    // Step 22: Delete the Supabase Auth user last
    console.log('[delete-account] Step 22: delete auth user')
    
    if (!dryRun) {
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

      if (deleteUserError) {
        console.error('[delete-account] Step 22 failed:', deleteUserError)
        return NextResponse.json(
          { ok: false, step: 'delete_auth_user', error: 'Failed to delete your account. Please try again or contact support.', details: deleteUserError.message },
          { status: 500 }
        )
      }
      summary.authDeletionResult = 'success'
    } else {
      summary.authDeletionResult = 'skipped (dry run)'
    }

    console.log('[delete-account] Step 22 completed')
    console.log('[ACCOUNT DELETE COMPLETE]', {
      userId: summary.userId,
      businessId: summary.businessId,
      stripeResult: summary.stripeResult,
      twilioNumberReleased: summary.twilioNumberReleased,
      tablesDeleted: summary.tablesDeleted,
      authDeletionResult: summary.authDeletionResult,
    })

    return NextResponse.json({ ok: true, dryRun, summary })
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, step: 'unexpected', error: 'An unexpected error occurred. Please try again or contact support.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
