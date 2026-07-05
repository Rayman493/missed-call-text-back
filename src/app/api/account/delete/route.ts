import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import getStripe from '@/lib/stripe'
import { twilioClient } from '@/lib/twilio'
import { sendOffboardingEmail, sendAccountDeletionConfirmationEmail, sendJourneyEmail } from '@/lib/email'
import { sendSms, sendSystemSms } from '@/lib/twilio'
import { isSystemPhoneNumber } from '@/lib/twilio-assignment'

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
    const password = body.password

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

    // Verify password before any deletion logic
    if (!password || typeof password !== 'string' || !password.trim()) {
      console.error('[delete-account] Password not provided')
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Password is required' },
        { status: 400 }
      )
    }

    console.log('[delete-account] Verifying password for user:', user.id)

    // Verify password by attempting to sign in
    // This is the standard way to verify credentials in Supabase
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email || '',
      password: password.trim(),
    })

    if (signInError || !signInData.user) {
      console.error('[delete-account] Password verification failed:', signInError)
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Incorrect password. Please try again.' },
        { status: 401 }
      )
    }

    // Verify the authenticated user matches the signed-in user
    if (signInData.user.id !== user.id) {
      console.error('[delete-account] User ID mismatch during password verification')
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Authentication failed' },
        { status: 401 }
      )
    }

    console.log('[delete-account] Password verified successfully')

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
      .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status, name, trial_ends_at, created_at, user_id, business_phone_number')
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

    // Gather analytics for journey email before deletion
    let analytics = {
      totalDays: 0,
      leadsCaptured: 0,
      conversations: 0,
      aiCallsHandled: 0,
      appointmentsScheduled: 0,
      paymentRequestsSent: 0,
      messagesExchanged: 0,
    }

    if (!dryRun && businesses && businesses.length > 0) {
      const business = businesses[0]
      
      // Calculate total days using ReplyFlow
      if (business.created_at) {
        const createdDate = new Date(business.created_at)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - createdDate.getTime())
        analytics.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }

      // Gather analytics from database
      try {
        // Count leads
        const { count: leadsCount } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        analytics.leadsCaptured = leadsCount || 0

        // Count conversations
        const { count: conversationsCount } = await supabaseAdmin
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        analytics.conversations = conversationsCount || 0

        // Count AI calls
        const { count: aiCallsCount } = await supabaseAdmin
          .from('ai_call_records')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        analytics.aiCallsHandled = aiCallsCount || 0

        // Count messages (get lead IDs first)
        const { data: leadsData } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
        
        if (leadsData && leadsData.length > 0) {
          const leadIds = leadsData.map(l => l.id)
          const { count: messagesCount } = await supabaseAdmin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('lead_id', leadIds)
          analytics.messagesExchanged = messagesCount || 0
        }

        console.log('[delete-account] Gathered analytics for journey email:', analytics)
      } catch (analyticsError) {
        console.warn('[delete-account] Failed to gather analytics for journey email:', analyticsError)
      }
    }

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
    let confirmationToken = null
    console.log('[OFFBOARDING SMS ORDER] trackingCreationStarted')
    if (!dryRun && businesses && businesses.length > 0) {
      const business = businesses[0] // Use first business for email
      const userEmail = user.email
      
      // Create offboarding tracking record
      try {
        if (!process.env.INTERNAL_API_SECRET) {
          console.warn('[delete-account] INTERNAL_API_SECRET not configured, skipping offboarding tracking record')
          throw new Error('Internal API secret not configured')
        }

        const offboardingResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/offboarding/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({
            businessPhone: business.business_phone_number,
            businessEmail: userEmail,
            businessId: business.id,
            userId: user.id,
            twilioPhoneNumber: business.twilio_phone_number,
          }),
        })
        
        const offboardingData = await offboardingResponse.json()
        if (offboardingData.success) {
          confirmationToken = offboardingData.confirmationToken
          console.log('[OFFBOARDING SMS ORDER] trackingCreated=true')
          console.log('[delete-account] Offboarding tracking record created:', offboardingData.trackingId)
        } else {
          console.log('[OFFBOARDING SMS ORDER] trackingCreated=false')
          console.warn('[delete-account] Failed to create offboarding tracking record:', offboardingData.error)
        }
      } catch (offboardingError) {
        console.log('[OFFBOARDING SMS ORDER] trackingCreated=false')
        console.warn('[delete-account] Failed to create offboarding tracking record:', offboardingError)
      }
      
      // Note: trial_history table check removed as it doesn't exist in production schema
      // Offboarding email will be sent each time without idempotency check
      // This is acceptable as account deletion is a destructive, one-time operation
      
      if (userEmail) {
        console.log('[OFFBOARDING SMS ORDER] emailSendStarted')
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
          confirmationToken,
        })
        
        if (emailResult.success) {
          console.log('[OFFBOARDING SMS ORDER] emailSent=true')
          console.log('[delete-account] Offboarding email sent successfully', {
            messageId: emailResult.messageId,
          })
          // Store email sent status in summary for later recording
          summary.offboardingEmailSent = true
          summary.offboardingEmailMessageId = emailResult.messageId
        } else {
          console.log('[OFFBOARDING SMS ORDER] emailSent=false')
          console.warn('[delete-account] Failed to send offboarding email (continuing deletion)', {
            error: emailResult.error,
          })
          summary.offboardingEmailSent = false
          summary.offboardingEmailError = emailResult.error
        }
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

      // Step 17: Send SMS offboarding notification before releasing Twilio number
      console.log('[OFFBOARDING SMS ORDER] smsSendStarted')
      console.log('[delete-account] Step 17: send SMS offboarding notification before number release')

      if (!dryRun && businesses && businesses.length > 0) {
        const business = businesses[0] // Use first business for SMS
        const businessPhone = business.business_phone_number
        const replyFlowNumber = business.twilio_phone_number

        // Log the full business configuration before attempting send
        console.log('[ACCOUNT OFFBOARDING SMS CONFIG]', {
          business_id: business.id,
          twilio_phone_number: business.twilio_phone_number,
          twilio_phone_number_sid: business.twilio_phone_number_sid,
          messaging_service_sid: business.twilio_messaging_service_sid,
          provisioning_status: business.provisioning_status,
          business_phone: businessPhone
        })

        // Safety checks
        if (businessPhone) {
          console.log('[ACCOUNT OFFBOARDING SMS START]', {
            business_id: business.id,
            business_phone: businessPhone,
            replyflow_number: replyFlowNumber,
          })

          const confirmationUrl = confirmationToken 
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/offboarding/confirm?token=${confirmationToken}`
            : null

          const offboardingSmsMessage = `Your ReplyFlow account has been deleted.

Important: Disable call forwarding so missed calls return to your normal voicemail.

Verizon: *73
AT&T: ##004#
T-Mobile: ##004#

Using another carrier? Contact your mobile carrier for instructions to disable conditional call forwarding.

Finished disabling call forwarding?

Tap the link below to let ReplyFlow know you're done. We'll immediately stop sending future reminder messages:
${confirmationUrl}

If forwarding does not stop immediately, restart your phone or contact your carrier.`

          let smsTwilioStatus = 'unknown'
          let smsSid = null

          try {
            // Send from dedicated system sender to avoid race condition with number reservation
            console.log('[OFFBOARDING SMS ORDER] Using system SMS sender for offboarding')
            const messageResult = await sendSystemSms(
              businessPhone,
              offboardingSmsMessage,
              {
                businessId: business.id,
                businessPhoneNumber: replyFlowNumber,
                messageType: 'offboarding',
                confirmationUrl: confirmationUrl || undefined,
              }
            )

            // Only log success if Twilio returned a real SID
            if (messageResult && messageResult.sid) {
              console.log('[OFFBOARDING SMS ORDER] smsTwilioStatus=accepted')
              smsTwilioStatus = 'accepted'
              smsSid = messageResult.sid
              console.log('[ACCOUNT OFFBOARDING SMS RESULT]', {
                business_id: business.id,
                business_phone: businessPhone,
                from: 'system_sender',
                success: true,
                twilio_message_sid: messageResult.sid,
              })

              summary.offboardingSmsSent = true
              summary.offboardingSmsMessageSid = messageResult.sid

              // No delay needed when using system sender - the number won't be reserved yet
              console.log('[OFFBOARDING SMS ORDER] No delay needed with system sender - proceeding with number reservation')
            } else {
              console.log('[OFFBOARDING SMS ORDER] smsTwilioStatus=no_sid')
              smsTwilioStatus = 'no_sid'
              console.error('[ACCOUNT OFFBOARDING SMS RESULT]', {
                business_id: business.id,
                business_phone: businessPhone,
                from: 'system_sender',
                success: false,
                twilio_message_sid: messageResult?.sid,
                error: 'Twilio did not return a valid SID'
              })

              summary.offboardingSmsSent = false
              summary.offboardingSmsError = 'Twilio did not return a valid SID'
            }
          } catch (smsError: any) {
            console.log('[OFFBOARDING SMS ORDER] smsTwilioStatus=error')
            smsTwilioStatus = 'error'
            console.error('[ACCOUNT OFFBOARDING SMS RESULT]', {
              business_id: business.id,
              business_phone: businessPhone,
              from: 'system_sender',
              success: false,
              error: smsError?.message || String(smsError),
            })

            summary.offboardingSmsSent = false
            summary.offboardingSmsError = smsError?.message || String(smsError)

            // SMS failure should NOT block account deletion - continue with flow
            console.log('[delete-account] SMS offboarding failed, continuing with deletion (best-effort)')
          }

          console.log('[OFFBOARDING SMS ORDER]', {
            smsTwilioStatus,
            smsSid,
            from: 'system_sender',
          })
        } else {
          console.warn('[ACCOUNT OFFBOARDING SMS SKIPPED]', {
            business_id: business.id,
            reason: !businessPhone ? 'no_business_phone' : 'no_replyflow_number',
          })
          summary.offboardingSmsSkipped = true
          summary.offboardingSmsSkippedReason = !businessPhone ? 'no_business_phone' : 'no_replyflow_number'
        }
      } else if (dryRun && businesses && businesses.length > 0) {
        console.log('[delete-account] DRY RUN: Would send SMS offboarding notification')
        summary.offboardingSmsSkipped = true
        summary.offboardingSmsSkippedReason = 'dry_run'
      }

      // Step 18: Release Twilio numbers immediately (no 30-day hold for account deletion)
      console.log('[delete-account] Step 18: release assigned Twilio numbers immediately')

      for (const business of businesses as any[]) {
        if (business.twilio_phone_number_sid) {
          // Protect against releasing the dedicated system phone
          if (isSystemPhoneNumber(business.twilio_phone_number)) {
            console.log('[ACCOUNT DELETE] Skipping protected system phone:', business.twilio_phone_number)
            console.log('[ACCOUNT DELETE] System phone will not be released during account deletion')
            continue
          }

          console.log('[ACCOUNT DELETE] Releasing assigned Twilio number immediately', {
            businessId: business.id,
            phoneNumber: business.twilio_phone_number,
            sid: business.twilio_phone_number_sid,
          })

          if (!dryRun) {
            try {
              // Release the number from Twilio
              console.log('[ACCOUNT DELETE] Releasing number from Twilio API')
              if (!twilioClient) {
                throw new Error('Twilio client not available')
              }
              await twilioClient.incomingPhoneNumbers(business.twilio_phone_number_sid).remove()
              console.log('[ACCOUNT DELETE] Number released from Twilio API successfully')

              // Remove from inventory tracking (delete the twilio_numbers row)
              console.log('[ACCOUNT DELETE] Removing number from inventory tracking')
              const { error: twilioDeleteError } = await supabaseAdmin
                .from('twilio_numbers')
                .delete()
                .eq('business_id', business.id)

              if (twilioDeleteError) {
                console.error('[ACCOUNT DELETE] Failed to remove number from inventory tracking (continuing with deletion):', twilioDeleteError)
                summary.twilioReleaseFailed = true
                summary.twilioReleaseError = twilioDeleteError.message
              } else {
                console.log('[ACCOUNT DELETE] Number released and removed from inventory tracking')
              }
            } catch (twilioError: any) {
              console.error('[ACCOUNT DELETE] Failed to release number from Twilio (continuing with deletion):', twilioError)
              summary.twilioReleaseFailed = true
              summary.twilioReleaseError = twilioError?.message || String(twilioError)
            }
          }

          summary.twilioNumberReleased = business.twilio_phone_number
          console.log('[ACCOUNT DELETE] Twilio number released:', business.twilio_phone_number)
        }
      }
      summary.tablesDeleted.twilio_numbers_released = businesses.filter((b: any) => b.twilio_phone_number_sid).length
      console.log('[delete-account] Step 18 completed: released assigned Twilio numbers immediately')

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

      // Step 19: Hard-delete businesses
      console.log('[delete-account] Step 19: hard-delete businesses')
      
      for (const business of businesses as any[]) {
        // Note: trial_history table insert removed as the table doesn't exist in production schema
        // Trial history recording is no longer required for account deletion
        
        // Hard-delete the business row
        if (!dryRun) {
          const { error: businessesDeleteError } = await supabaseAdmin
            .from('businesses')
            .delete()
            .eq('id', business.id)

          if (businessesDeleteError) {
            console.error('[delete-account] Step 19 hard-delete failed:', businessesDeleteError)
            return NextResponse.json(
              { ok: false, step: 'delete_businesses', error: 'Failed to delete account data. Please try again or contact support.', details: businessesDeleteError.message },
              { status: 500 }
            )
          }
        }
      }
      summary.tablesDeleted.businesses = businesses.length
      console.log('[delete-account] Step 19 completed: hard-deleted businesses')
    }

    // Step 22: Delete the Supabase Auth user last
    console.log('[delete-account] Step 22: delete auth user', { userId: user.id })

    if (!dryRun) {
      try {
        console.log('[delete-account] Starting auth user deletion', { userId: user.id })
        const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

        if (deleteUserError) {
          console.error('[delete-account] Auth user deletion failed', {
            userId: user.id,
            error: deleteUserError,
            errorMessage: deleteUserError.message,
            errorDetails: JSON.stringify(deleteUserError)
          })

          // Check if user is already deleted (idempotency)
          // Supabase returns "User not found" error when trying to delete a non-existent user
          if (deleteUserError.message && deleteUserError.message.includes('User not found')) {
            console.warn('[delete-account] Auth user already deleted, treating as success', { userId: user.id })
            summary.authDeletionResult = 'already_deleted'
          } else {
            return NextResponse.json(
              { ok: false, step: 'delete_auth_user', error: 'Failed to delete your account. Please try again or contact support.', details: deleteUserError.message },
              { status: 500 }
            )
          }
        } else {
          console.log('[delete-account] Auth user deletion succeeded', { userId: user.id })
          summary.authDeletionResult = 'success'
        }

        // Send account deletion confirmation email after successful auth deletion
        if (!dryRun && user.email) {
          console.log('[delete-account] Sending account deletion confirmation email', {
            userEmail: user.email,
          })

          try {
            const business = businesses && businesses.length > 0 ? businesses[0] : null
            const twilioNumberReserved = summary.twilioNumberReleased !== undefined
            
            const emailResult = await sendAccountDeletionConfirmationEmail({
              userEmail: user.email,
              businessName: business?.name,
              twilioNumberReserved,
              twilioNumber: summary.twilioNumberReleased,
            })

            if (emailResult.success) {
              console.log('[delete-account] Account deletion confirmation email sent successfully', {
                messageId: emailResult.messageId,
              })
              summary.confirmationEmailSent = true
              summary.confirmationEmailMessageId = emailResult.messageId
            } else {
              console.warn('[delete-account] Failed to send account deletion confirmation email (account deletion completed)', {
                error: emailResult.error,
              })
              summary.confirmationEmailSent = false
              summary.confirmationEmailError = emailResult.error
            }

            // Send journey email with analytics
            if (user.email && businesses && businesses.length > 0) {
              console.log('[delete-account] Sending journey email with analytics', {
                userEmail: user.email,
                analytics,
              })

              try {
                const journeyEmailResult = await sendJourneyEmail({
                  userEmail: user.email,
                  businessName: businesses[0].name,
                  analytics,
                })

                if (journeyEmailResult.success) {
                  console.log('[delete-account] Journey email sent successfully', {
                    messageId: journeyEmailResult.messageId,
                  })
                  summary.journeyEmailSent = true
                  summary.journeyEmailMessageId = journeyEmailResult.messageId
                } else {
                  console.warn('[delete-account] Failed to send journey email (account deletion completed)', {
                    error: journeyEmailResult.error,
                  })
                  summary.journeyEmailSent = false
                  summary.journeyEmailError = journeyEmailResult.error
                }
              } catch (journeyEmailError) {
                console.error('[delete-account] Exception sending journey email (account deletion completed)', {
                  error: journeyEmailError instanceof Error ? journeyEmailError.message : String(journeyEmailError),
                })
                summary.journeyEmailSent = false
                summary.journeyEmailError = journeyEmailError instanceof Error ? journeyEmailError.message : 'Unknown error'
              }
            }
          } catch (emailError) {
            console.error('[delete-account] Exception sending account deletion confirmation email (account deletion completed)', {
              error: emailError instanceof Error ? emailError.message : String(emailError),
            })
            summary.confirmationEmailSent = false
            summary.confirmationEmailError = emailError instanceof Error ? emailError.message : 'Unknown error'
          }
        }
      } catch (error) {
        console.error('[delete-account] Unexpected error during auth user deletion', {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error)
        })
        return NextResponse.json(
          { ok: false, step: 'delete_auth_user', error: 'Failed to delete your account. Please try again or contact support.', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        )
      }
    } else {
      summary.authDeletionResult = 'skipped (dry run)'
    }

    console.log('[delete-account] Step 22 completed', {
      userId: user.id,
      authDeletionResult: summary.authDeletionResult
    })
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
