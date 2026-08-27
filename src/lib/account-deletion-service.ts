import { supabaseAdmin } from './supabase/admin'
import getStripe from './stripe'
import { twilioClient } from './twilio'
import { sendOffboardingEmail, sendAccountDeletionConfirmationEmail, sendJourneyEmail } from './email'
import { isSystemPhoneNumber } from './twilio-assignment'
import { logAdminAction, getUserEmail } from './admin-audit'

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

export interface DeletionContext {
  userId: string
  userEmail?: string | null
  deletionSource: 'self_service' | 'admin'
  adminUserId?: string // For admin-initiated deletions
  adminUserEmail?: string // For admin-initiated deletions
  dryRun?: boolean
  skipOffboardingEmails?: boolean // For test cleanup
}

export interface DeletionResult {
  ok: boolean
  step?: string
  error?: string
  errorType?: string
  details?: any
  businessId?: string
  twilioLifecycleResult?: {
    success: boolean
    phoneNumber?: string
    status: 'recycled' | 'already_recycled' | 'no_number' | 'failed' | 'blocked'
    error?: string
  }
  dryRun?: boolean
  summary?: {
    userId: string
    businessId?: string
    tablesDeleted: { [key: string]: number }
    twilioNumberRecycled?: string
    twilioRecycleFailed?: boolean
    twilioRecycleError?: string
    twilioLifecycleResult?: {
      success: boolean
      phoneNumber?: string
      status: 'recycled' | 'already_recycled' | 'no_number' | 'failed' | 'blocked'
      error?: string
    }
    authDeletionResult?: string
    stripeResult?: {
      customerId: string | null
      subscriptionId: string | null
      cancellationAttempted: boolean
      cancellationSucceeded: boolean
      error: string | null
      dryRun?: boolean
    }
    offboardingEmailSent?: boolean
    offboardingEmailMessageId?: string
    confirmationEmailSent?: boolean
    confirmationEmailMessageId?: string
    journeyEmailSent?: boolean
    journeyEmailMessageId?: string
  }
}

/**
 * Shared account deletion lifecycle service
 * Used by both self-service /api/account/delete and admin /api/admin/delete-account
 */
export async function deleteAccountLifecycle(context: DeletionContext): Promise<DeletionResult> {
  const { userId, userEmail, deletionSource, adminUserId, adminUserEmail, dryRun = false, skipOffboardingEmails = false } = context

  console.log('[delete-account-lifecycle] START', {
    userId,
    deletionSource,
    dryRun,
    skipOffboardingEmails,
  })

  const summary: any = {
    userId,
    tablesDeleted: {},
    stripeResult: {
      customerId: null,
      subscriptionId: null,
      cancellationAttempted: false,
      cancellationSucceeded: false,
      error: null,
    },
  }

  // Step 1: Find all businesses for this user
  console.log('[delete-account-lifecycle] Step 1: find businesses')
  const { data: businesses, error: businessesError } = await supabaseAdmin
    .from('businesses')
    .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status, name, trial_ends_at, created_at, user_id, business_phone_number, is_protected_account')
    .eq('user_id', userId)

  if (businessesError) {
    console.error('[delete-account-lifecycle] Step 1 failed:', businessesError)
    return {
      ok: false,
      step: 'fetch_businesses',
      error: businessesError.message,
      details: businessesError,
      dryRun,
    }
  }

  const businessIds = businesses?.map((b: any) => b.id) || []
  summary.businessId = businessIds[0]

  // Populate Stripe result from first business
  if (businesses && businesses.length > 0) {
    summary.stripeResult.customerId = businesses[0].stripe_customer_id || null
    summary.stripeResult.subscriptionId = businesses[0].stripe_subscription_id || null
  }

  console.log('[delete-account-lifecycle] Found businesses:', businessIds.length, businessIds)

  // PROTECTED ACCOUNT CHECK: Block deletion if any business is protected
  const protectedBusiness = businesses?.find((b: any) => b.is_protected_account === true)
  if (protectedBusiness) {
    console.error('[delete-account-lifecycle] PROTECTED_ACCOUNT_DELETION_BLOCKED: Business is protected', {
      businessId: protectedBusiness.id,
      businessName: protectedBusiness.name,
      userId,
    })
    return {
      ok: false,
      step: 'protected_account_check',
      error: 'Cannot delete a protected account. Contact support.',
      businessId: protectedBusiness.id,
      dryRun,
    }
  }

  // SAFETY FIX: Two-phase preflight validation - validate all businesses before any destructive operation
  console.log('[delete-account-lifecycle] PREFLIGHT VALIDATION: Validating all businesses for lifecycle safety')
  const { validateTwilioNumberLifecycleMutation } = await import('./twilio-lifecycle-validator')

  for (const business of businesses as any[]) {
    if (business.twilio_phone_number_sid) {
      console.log('[delete-account-lifecycle] PREFLIGHT: Validating business:', business.id)

      // Skip system phone check in preflight (will be handled during actual recycling)
      if (isSystemPhoneNumber(business.twilio_phone_number)) {
        console.log('[delete-account-lifecycle] PREFLIGHT: Skipping system phone validation:', business.twilio_phone_number)
        continue
      }

      const validation = await validateTwilioNumberLifecycleMutation({
        businessId: business.id,
        phoneNumber: business.twilio_phone_number,
        phoneNumberSid: business.twilio_phone_number_sid,
        operation: 'recycle',
      })

      if (!validation.valid) {
        console.error('[delete-account-lifecycle] PREFLIGHT VALIDATION FAILED:', validation.error)
        console.error('[delete-account-lifecycle] PREFLIGHT Validation error type:', validation.errorType)
        console.error('[delete-account-lifecycle] PREFLIGHT Validation details:', validation.details)

        // HARD BLOCKING: Abort entire deletion if any business fails preflight validation
        return {
          ok: false,
          step: 'preflight_validation',
          error: validation.error,
          errorType: validation.errorType,
          details: validation.details,
          businessId: business.id,
          dryRun,
        }
      }

      console.log('[delete-account-lifecycle] PREFLIGHT: Validation passed for business:', business.id)
    }
  }
  console.log('[delete-account-lifecycle] PREFLIGHT VALIDATION: All businesses validated successfully')

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

  if (!dryRun && businesses && businesses.length > 0 && !skipOffboardingEmails) {
    const business = businesses[0]
    try {
      const { data: leadsData } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('business_id', business.id)

      if (leadsData && leadsData.length > 0) {
        const leadIds = leadsData.map((l) => l.id)
        const { count: messagesCount } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('lead_id', leadIds)
        analytics.messagesExchanged = messagesCount || 0
      }

      console.log('[delete-account-lifecycle] Gathered analytics for journey email:', analytics)
    } catch (analyticsError) {
      console.warn('[delete-account-lifecycle] Failed to gather analytics for journey email:', analyticsError)
    }
  }

  // Step 2: Cancel any active Stripe subscriptions BEFORE deleting any data
  console.log('[delete-account-lifecycle] Step 2: Cancel Stripe subscriptions (before data deletion)')
  if (!dryRun && businesses && businesses.length > 0) {
    const stripe = getStripe()
    const subsToCancel = (businesses as any[]).filter(
      (b) => b.stripe_subscription_id && ACTIVE_SUB_STATUSES.has(b.subscription_status || '')
    )

    if (subsToCancel.length > 0) {
      console.log('[delete-account-lifecycle] Found active Stripe subscriptions to cancel:', subsToCancel.map((b) => b.stripe_subscription_id))

      if (!stripe) {
        console.error('[delete-account-lifecycle] Stripe client unavailable, cannot cancel subscription')
        return {
          ok: false,
          step: 'stripe_init',
          error: 'Billing service unavailable. Please try again later.',
          dryRun,
        }
      }

      for (const b of subsToCancel) {
        console.log('[delete-account-lifecycle] Attempting to cancel Stripe subscription:', b.stripe_subscription_id)
        summary.stripeResult.cancellationAttempted = true

        try {
          const cancelled = await stripe.subscriptions.cancel(b.stripe_subscription_id)
          console.log('[delete-account-lifecycle] Stripe cancellation result:', {
            subscriptionId: cancelled.id,
            status: cancelled.status,
            customerId: b.stripe_customer_id,
          })

          if (cancelled.status !== 'canceled') {
            throw new Error(`Stripe returned unexpected status: ${cancelled.status}`)
          }

          // Successful cancellation
          summary.stripeResult.cancellationSucceeded = true
          console.log('[delete-account-lifecycle] Stripe subscription cancelled successfully', {
            customerId: b.stripe_customer_id,
            subscriptionId: b.stripe_subscription_id,
            status: cancelled.status,
          })

          // Reflect cancellation in DB before continuing
          const { error: updateError } = await supabaseAdmin
            .from('businesses')
            .update({ subscription_status: 'canceled' })
            .eq('id', b.id)

          if (updateError) {
            console.warn('[delete-account-lifecycle] Failed to update subscription_status in DB after Stripe cancellation:', updateError)
          } else {
            console.log('[delete-account-lifecycle] Updated subscription_status to canceled in DB')
          }
        } catch (cancelErr: any) {
          // Already-cancelled subscriptions sometimes return a 404 / resource_missing
          const code = cancelErr?.code || cancelErr?.raw?.code
          if (code === 'resource_missing') {
            console.warn('[delete-account-lifecycle] Subscription already gone in Stripe, continuing:', b.stripe_subscription_id)
            summary.stripeResult.cancellationSucceeded = true // Already cancelled
          } else {
            summary.stripeResult.cancellationSucceeded = false
            summary.stripeResult.error = cancelErr?.message || String(cancelErr)
            console.error('[delete-account-lifecycle] Stripe cancellation failed', {
              customerId: b.stripe_customer_id,
              subscriptionId: b.stripe_subscription_id,
              error: cancelErr?.message || String(cancelErr),
              code: code,
            })
            return {
              ok: false,
              step: 'stripe_cancel',
              error: 'Failed to cancel your subscription. Your account was not deleted. Please try again or contact support.',
              details: cancelErr?.message || String(cancelErr),
              dryRun,
            }
          }
        }
      }
    } else {
      console.log('[delete-account-lifecycle] No active Stripe subscriptions to cancel')
      summary.stripeResult.cancellationAttempted = false
      summary.stripeResult.cancellationSucceeded = true // No subscription to cancel is a success
    }
  } else if (dryRun && businesses && businesses.length > 0) {
    // Dry-run mode: just log that cancellation would be attempted
    const subsToCancel = (businesses as any[]).filter(
      (b) => b.stripe_subscription_id && ACTIVE_SUB_STATUSES.has(b.subscription_status || '')
    )
    if (subsToCancel.length > 0) {
      console.log('[delete-account-lifecycle] DRY RUN: Would cancel Stripe subscriptions:', subsToCancel.map((b) => b.stripe_subscription_id))
    }
    summary.stripeResult.dryRun = true
  } else {
    console.log('[delete-account-lifecycle] No businesses or dry-run mode, skipping Stripe cancellation')
  }

  console.log('[delete-account-lifecycle] Step 2 completed: Stripe cancellation handled', {
    cancellationAttempted: summary.stripeResult.cancellationAttempted,
    cancellationSucceeded: summary.stripeResult.cancellationSucceeded,
    error: summary.stripeResult.error,
  })

  // Send offboarding email before deletion (with idempotency check)
  let confirmationToken = null
  let offboardingEmailSkipped = false
  let offboardingEmailSkippedReason = ''
  console.log('[OFFBOARDING SMS ORDER] trackingCreationStarted')
  if (!dryRun && businesses && businesses.length > 0 && !skipOffboardingEmails) {
    const business = businesses[0] // Use first business for email
    const targetUserEmail = userEmail || business.user_id

    // Check if offboarding tracking record already exists (idempotency for retries)
    let existingTrackingRecord = null
    try {
      const { data: existingRecords } = await supabaseAdmin
        .from('offboarding_tracking')
        .select('*')
        .eq('business_id', business.id)
        .order('deletion_timestamp', { ascending: false })
        .limit(1)

      if (existingRecords && existingRecords.length > 0) {
        existingTrackingRecord = existingRecords[0]
        console.log('[delete-account-lifecycle] Found existing offboarding tracking record:', {
          trackingId: existingTrackingRecord.id,
          deletionTimestamp: existingTrackingRecord.deletion_timestamp,
        })
      }
    } catch (checkError) {
      console.warn('[delete-account-lifecycle] Failed to check for existing offboarding tracking record:', checkError)
    }

    // Only create new tracking record if one doesn't already exist
    if (!existingTrackingRecord) {
      try {
        if (!process.env.INTERNAL_API_SECRET) {
          console.warn('[delete-account-lifecycle] INTERNAL_API_SECRET not configured, skipping offboarding tracking record')
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
            businessEmail: targetUserEmail,
            businessId: business.id,
            userId,
            twilioPhoneNumber: business.twilio_phone_number,
          }),
        })

        const offboardingData = await offboardingResponse.json()
        if (offboardingData.success) {
          confirmationToken = offboardingData.confirmationToken
          console.log('[OFFBOARDING SMS ORDER] trackingCreated=true')
          console.log('[delete-account-lifecycle] Offboarding tracking record created:', offboardingData.trackingId)
        } else {
          console.log('[OFFBOARDING SMS ORDER] trackingCreated=false')
          console.warn('[delete-account-lifecycle] Failed to create offboarding tracking record:', offboardingData.error)
        }
      } catch (offboardingError) {
        console.log('[OFFBOARDING SMS ORDER] trackingCreated=false')
        console.warn('[delete-account-lifecycle] Failed to create offboarding tracking record:', offboardingError)
      }
    } else {
      console.log('[delete-account-lifecycle] Skipping offboarding tracking record creation (already exists)')
      confirmationToken = existingTrackingRecord.confirmation_token
    }

    // Only send offboarding email if no existing tracking record found (avoid duplicate emails on retry)
    if (targetUserEmail && !existingTrackingRecord) {
      console.log('[OFFBOARDING SMS ORDER] emailSendStarted')
      console.log('[delete-account-lifecycle] Sending offboarding email', {
        businessId: business.id,
        businessName: business.name,
        userEmail: targetUserEmail,
      })

      const emailResult = await sendOffboardingEmail({
        businessName: business.name || 'Customer',
        businessPhone: business.twilio_phone_number,
        replyFlowNumber: business.twilio_phone_number,
        userEmail: targetUserEmail,
        confirmationToken,
      })

      if (emailResult.success) {
        console.log('[OFFBOARDING SMS ORDER] emailSent=true')
        console.log('[delete-account-lifecycle] Offboarding email sent successfully', {
          messageId: emailResult.messageId,
        })
        summary.offboardingEmailSent = true
        summary.offboardingEmailMessageId = emailResult.messageId
      } else {
        console.log('[OFFBOARDING SMS ORDER] emailSent=false')
        console.warn('[delete-account-lifecycle] Failed to send offboarding email (continuing deletion)', {
          error: emailResult.error,
        })
        summary.offboardingEmailSent = false
        summary.offboardingEmailError = emailResult.error
      }
    } else if (existingTrackingRecord) {
      console.log('[delete-account-lifecycle] Skipping offboarding email (already sent for this deletion)')
      summary.offboardingEmailSent = false
      summary.offboardingEmailSkipped = true
      summary.offboardingEmailSkippedReason = 'already_sent'
      offboardingEmailSkipped = true
      offboardingEmailSkippedReason = 'already_sent'
    } else {
      console.warn('[delete-account-lifecycle] No user email available, skipping offboarding email')
      summary.offboardingEmailSent = false
      summary.offboardingEmailSkipped = true
      summary.offboardingEmailSkippedReason = 'no_email'
      offboardingEmailSkipped = true
      offboardingEmailSkippedReason = 'no_email'
    }
  }

  if (businessIds.length === 0) {
    console.log('[delete-account-lifecycle] No businesses found, skipping data deletion')
  } else {
    // Step 3: Find all leads for these businesses
    console.log('[delete-account-lifecycle] Step 3: find leads')
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .in('business_id', businessIds)

    if (leadsError) {
      console.error('[delete-account-lifecycle] Step 3 failed:', leadsError)
      return {
        ok: false,
        step: 'fetch_leads',
        error: leadsError.message,
        details: leadsError,
        dryRun,
      }
    }

    const leadIds = leads?.map((l) => l.id) || []
    console.log('[delete-account-lifecycle] Found leads:', leadIds.length)

    // Step 4: Delete message_media linked to messages
    if (leadIds.length > 0) {
      console.log('[delete-account-lifecycle] Step 4: delete message_media')

      // First get message IDs for these leads
      const { data: messages } = await supabaseAdmin
        .from('messages')
        .select('id')
        .in('lead_id', leadIds)

      const messageIds = messages?.map((m) => m.id) || []

      if (messageIds.length > 0) {
        const { error: messageMediaError, count } = await supabaseAdmin
          .from('message_media')
          .delete()
          .in('message_id', messageIds)
          .select()

        if (messageMediaError) {
          console.error('[delete-account-lifecycle] Step 4 failed:', messageMediaError)
          return {
            ok: false,
            step: 'delete_message_media',
            error: messageMediaError.message,
            details: messageMediaError,
            dryRun,
          }
        }
        summary.tablesDeleted.message_media = count || 0
        console.log('[delete-account-lifecycle] Step 4 completed: deleted message_media:', count)
      }
    }

    // Step 5: Delete messages linked to leads
    if (leadIds.length > 0) {
      console.log('[delete-account-lifecycle] Step 5: delete messages')

      const { error: messagesError, count } = await supabaseAdmin
        .from('messages')
        .delete()
        .in('lead_id', leadIds)
        .select()

      if (messagesError) {
        console.error('[delete-account-lifecycle] Step 5 failed:', messagesError)
        return {
          ok: false,
          step: 'delete_messages',
          error: messagesError.message,
          details: messagesError,
          dryRun,
        }
      }
      summary.tablesDeleted.messages = count || 0
      console.log('[delete-account-lifecycle] Step 5 completed: deleted messages:', count)
    }

    // Step 6: Delete notifications linked to businesses
    console.log('[delete-account-lifecycle] Step 6: delete notifications')

    const { error: notificationsError, count: notificationsCount } = await supabaseAdmin
      .from('notifications')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (notificationsError) {
      console.error('[delete-account-lifecycle] Step 6 failed:', notificationsError)
      return {
        ok: false,
        step: 'delete_notifications',
        error: notificationsError.message,
        details: notificationsError,
        dryRun,
      }
    }
    summary.tablesDeleted.notifications = notificationsCount || 0
    console.log('[delete-account-lifecycle] Step 6 completed: deleted notifications:', notificationsCount)

    // Step 7: Delete follow_up_jobs linked to businesses
    console.log('[delete-account-lifecycle] Step 7: delete follow_up_jobs')

    const { error: followUpJobsError, count: followUpJobsCount } = await supabaseAdmin
      .from('follow_up_jobs')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (followUpJobsError) {
      console.error('[delete-account-lifecycle] Step 7 failed:', followUpJobsError)
      return {
        ok: false,
        step: 'delete_follow_up_jobs',
        error: followUpJobsError.message,
        details: followUpJobsError,
        dryRun,
      }
    }
    summary.tablesDeleted.follow_up_jobs = followUpJobsCount || 0
    console.log('[delete-account-lifecycle] Step 7 completed: deleted follow_up_jobs:', followUpJobsCount)

    // Step 8: Delete conversations linked to businesses
    console.log('[delete-account-lifecycle] Step 8: delete conversations')

    const { error: conversationsError, count: conversationsCount } = await supabaseAdmin
      .from('conversations')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (conversationsError) {
      console.error('[delete-account-lifecycle] Step 8 failed:', conversationsError)
      return {
        ok: false,
        step: 'delete_conversations',
        error: conversationsError.message,
        details: conversationsError,
        dryRun,
      }
    }
    summary.tablesDeleted.conversations = conversationsCount || 0
    console.log('[delete-account-lifecycle] Step 8 completed: deleted conversations:', conversationsCount)

    // Step 9: Delete ai_call_records linked to businesses
    console.log('[delete-account-lifecycle] Step 9: delete ai_call_records')

    const { error: aiCallRecordsError, count: aiCallRecordsCount } = await supabaseAdmin
      .from('ai_call_records')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (aiCallRecordsError) {
      console.error('[delete-account-lifecycle] Step 9 failed:', aiCallRecordsError)
      return {
        ok: false,
        step: 'delete_ai_call_records',
        error: aiCallRecordsError.message,
        details: aiCallRecordsError,
        dryRun,
      }
    }
    summary.tablesDeleted.ai_call_records = aiCallRecordsCount || 0
    console.log('[delete-account-lifecycle] Step 9 completed: deleted ai_call_records:', aiCallRecordsCount)

    // Step 10: Delete ai_call_sessions linked to businesses
    console.log('[delete-account-lifecycle] Step 10: delete ai_call_sessions')

    const { error: aiCallSessionsError, count: aiCallSessionsCount } = await supabaseAdmin
      .from('ai_call_sessions')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (aiCallSessionsError) {
      console.error('[delete-account-lifecycle] Step 10 failed:', aiCallSessionsError)
      return {
        ok: false,
        step: 'delete_ai_call_sessions',
        error: aiCallSessionsError.message,
        details: aiCallSessionsError,
        dryRun,
      }
    }
    summary.tablesDeleted.ai_call_sessions = aiCallSessionsCount || 0
    console.log('[delete-account-lifecycle] Step 10 completed: deleted ai_call_sessions:', aiCallSessionsCount)

    // Step 11: Delete ai_call_failures linked to businesses
    console.log('[delete-account-lifecycle] Step 11: delete ai_call_failures')

    const { error: aiCallFailuresError, count: aiCallFailuresCount } = await supabaseAdmin
      .from('ai_call_failures')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (aiCallFailuresError) {
      console.error('[delete-account-lifecycle] Step 11 failed:', aiCallFailuresError)
      return {
        ok: false,
        step: 'delete_ai_call_failures',
        error: aiCallFailuresError.message,
        details: aiCallFailuresError,
        dryRun,
      }
    }
    summary.tablesDeleted.ai_call_failures = aiCallFailuresCount || 0
    console.log('[delete-account-lifecycle] Step 11 completed: deleted ai_call_failures:', aiCallFailuresCount)

    // Step 12: Delete voicemail_recordings linked to businesses
    console.log('[delete-account-lifecycle] Step 12: delete voicemail_recordings')

    const { error: voicemailRecordingsError, count: voicemailRecordingsCount } = await supabaseAdmin
      .from('voicemail_recordings')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (voicemailRecordingsError) {
      console.error('[delete-account-lifecycle] Step 12 failed:', voicemailRecordingsError)
      return {
        ok: false,
        step: 'delete_voicemail_recordings',
        error: voicemailRecordingsError.message,
        details: voicemailRecordingsError,
        dryRun,
      }
    }
    summary.tablesDeleted.voicemail_recordings = voicemailRecordingsCount || 0
    console.log('[delete-account-lifecycle] Step 12 completed: deleted voicemail_recordings:', voicemailRecordingsCount)

    // Step 13: Delete call_events linked to businesses
    console.log('[delete-account-lifecycle] Step 13: delete call_events')

    const { error: callEventsError, count: callEventsCount } = await supabaseAdmin
      .from('call_events')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (callEventsError) {
      console.error('[delete-account-lifecycle] Step 13 failed:', callEventsError)
      return {
        ok: false,
        step: 'delete_call_events',
        error: callEventsError.message,
        details: callEventsError,
        dryRun,
      }
    }
    summary.tablesDeleted.call_events = callEventsCount || 0
    console.log('[delete-account-lifecycle] Step 13 completed: deleted call_events:', callEventsCount)

    // Step 14: Delete calendar_integrations linked to businesses
    console.log('[delete-account-lifecycle] Step 14: delete calendar_integrations')

    const { error: calendarIntegrationsError, count: calendarIntegrationsCount } = await supabaseAdmin
      .from('calendar_integrations')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (calendarIntegrationsError) {
      console.error('[delete-account-lifecycle] Step 14 failed:', calendarIntegrationsError)
      return {
        ok: false,
        step: 'delete_calendar_integrations',
        error: calendarIntegrationsError.message,
        details: calendarIntegrationsError,
        dryRun,
      }
    }
    summary.tablesDeleted.calendar_integrations = calendarIntegrationsCount || 0
    console.log('[delete-account-lifecycle] Step 14 completed: deleted calendar_integrations:', calendarIntegrationsCount)

    // Step 15: Delete ignored_contacts linked to businesses
    console.log('[delete-account-lifecycle] Step 15: delete ignored_contacts')

    const { error: ignoredContactsError, count: ignoredContactsCount } = await supabaseAdmin
      .from('ignored_contacts')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (ignoredContactsError) {
      console.error('[delete-account-lifecycle] Step 15 failed:', ignoredContactsError)
      return {
        ok: false,
        step: 'delete_ignored_contacts',
        error: ignoredContactsError.message,
        details: ignoredContactsError,
        dryRun,
      }
    }
    summary.tablesDeleted.ignored_contacts = ignoredContactsCount || 0
    console.log('[delete-account-lifecycle] Step 15 completed: deleted ignored_contacts:', ignoredContactsCount)

    // Step 16: Delete stripe_webhook_events linked to businesses (if table exists)
    // This table may not exist in all environments, so we handle PGRST205 gracefully
    console.log('[delete-account-lifecycle] Step 16: delete stripe_webhook_events')

    const { error: stripeWebhookEventsError, count: stripeWebhookEventsCount } = await supabaseAdmin
      .from('stripe_webhook_events')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (stripeWebhookEventsError) {
      // PGRST205 means table doesn't exist in schema cache - treat as optional
      if (stripeWebhookEventsError.code === 'PGRST205') {
        console.warn('[delete-account-lifecycle] stripe_webhook_events table not found (PGRST205), skipping')
        summary.tablesDeleted.stripe_webhook_events = 0
      } else {
        console.error('[delete-account-lifecycle] Step 16 failed:', stripeWebhookEventsError)
        return {
          ok: false,
          step: 'delete_stripe_webhook_events',
          error: stripeWebhookEventsError.message,
          details: stripeWebhookEventsError,
          dryRun,
        }
      }
    } else {
      summary.tablesDeleted.stripe_webhook_events = stripeWebhookEventsCount || 0
      console.log('[delete-account-lifecycle] Step 16 completed: deleted stripe_webhook_events:', stripeWebhookEventsCount)
    }

    // Step 17: Delete tasks linked to businesses
    console.log('[delete-account-lifecycle] Step 17: delete tasks')

    const { error: tasksError, count: tasksCount } = await supabaseAdmin
      .from('tasks')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (tasksError) {
      console.error('[delete-account-lifecycle] Step 17 failed:', tasksError)
      return {
        ok: false,
        step: 'delete_tasks',
        error: tasksError.message,
        details: tasksError,
        dryRun,
      }
    }
    summary.tablesDeleted.tasks = tasksCount || 0
    console.log('[delete-account-lifecycle] Step 17 completed: deleted tasks:', tasksCount)

    // Step 18: Delete jobs linked to businesses (must be before leads due to RESTRICT constraint)
    console.log('[delete-account-lifecycle] Step 18: delete jobs')

    const { error: jobsError, count: jobsCount } = await supabaseAdmin
      .from('jobs')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (jobsError) {
      console.error('[delete-account-lifecycle] Step 18 failed:', jobsError)
      return {
        ok: false,
        step: 'delete_jobs',
        error: jobsError.message,
        details: jobsError,
        dryRun,
      }
    }
    summary.tablesDeleted.jobs = jobsCount || 0
    console.log('[delete-account-lifecycle] Step 18 completed: deleted jobs:', jobsCount)

    // Step 19: Delete leads linked to businesses
    console.log('[delete-account-lifecycle] Step 19: delete leads')

    const { error: leadsDeleteError, count: leadsCount } = await supabaseAdmin
      .from('leads')
      .delete()
      .in('business_id', businessIds)
      .select()

    if (leadsDeleteError) {
      console.error('[delete-account-lifecycle] Step 19 failed:', leadsDeleteError)
      return {
        ok: false,
        step: 'delete_leads',
        error: 'Failed to delete account data. Please try again or contact support.',
        details: leadsDeleteError.message,
        dryRun,
      }
    }
    summary.tablesDeleted.leads = leadsCount || 0
    console.log('[delete-account-lifecycle] Step 19 completed: deleted leads:', leadsCount)

    // Step 20: Recycle Twilio numbers back to warm inventory BEFORE business deletion
    // This ensures the business still exists for ownership validation
    // The FK ON DELETE SET NULL would null business_id before we can validate ownership
    console.log('[delete-account-lifecycle] Step 20: recycle assigned Twilio numbers back to warm inventory (pre-deletion)')

    for (const business of businesses as any[]) {
      if (business.twilio_phone_number_sid) {
        // Protect against recycling the dedicated system phone
        if (isSystemPhoneNumber(business.twilio_phone_number)) {
          console.log('[PROTECTED] Skipping protected system phone:', business.twilio_phone_number)
          console.log('[PROTECTED] System phone will not be recycled during account deletion')
          continue
        }

        console.log('[RECYCLE] Recycling assigned Twilio number back to warm inventory (pre-deletion)', {
          businessId: business.id,
          phoneNumber: business.twilio_phone_number,
          sid: business.twilio_phone_number_sid,
        })

        if (!dryRun) {
          try {
            // Import the regular recycle function (not post-deletion variant)
            // The business still exists, so we can use the full compare-and-swap validation
            const { recycleTwilioNumberToInventory } = await import('./warm-number-manager')

            console.log('[RECYCLE] Recycling number to warm inventory (pre-deletion mode)')
            const recycleResult = await recycleTwilioNumberToInventory(
              business.twilio_phone_number,
              business.twilio_phone_number_sid,
              business.id
            )

            if (recycleResult.success) {
              console.log('[RECYCLE] Number recycled successfully to warm inventory')
              summary.twilioNumberRecycled = business.twilio_phone_number
              summary.tablesDeleted.twilio_numbers_recycled = (summary.tablesDeleted.twilio_numbers_recycled || 0) + 1
              summary.twilioLifecycleResult = {
                success: true,
                phoneNumber: business.twilio_phone_number,
                status: 'recycled',
              }
            } else {
              console.error('[RECYCLE] Failed to recycle number to warm inventory:', recycleResult.error)
              console.error('[RECYCLE] Recycling failed - ABORTING deletion to prevent orphaned number')
              summary.twilioRecycleFailed = true
              summary.twilioRecycleError = recycleResult.error
              summary.twilioLifecycleResult = {
                success: false,
                status: 'failed',
                error: recycleResult.error,
              }

              // FAIL CLOSED: Abort deletion if recycle fails
              // This prevents: account gone + number lifecycle incomplete
              return {
                ok: false,
                step: 'recycle_twilio_numbers',
                error: 'Failed to recycle Twilio number. Your account was not deleted. Please try again or contact support.',
                details: recycleResult.error,
                twilioLifecycleResult: summary.twilioLifecycleResult,
                dryRun,
              }
            }
          } catch (recycleError: any) {
            console.error('[RECYCLE] Exception recycling number to warm inventory:', recycleError)
            console.error('[RECYCLE] Recycling failed - ABORTING deletion to prevent orphaned number')
            summary.twilioRecycleFailed = true
            summary.twilioRecycleError = recycleError?.message || String(recycleError)
            summary.twilioLifecycleResult = {
              success: false,
              status: 'failed',
              error: recycleError?.message || String(recycleError),
            }

            // FAIL CLOSED: Abort deletion if recycle throws
            return {
              ok: false,
              step: 'recycle_twilio_numbers',
              error: 'Failed to recycle Twilio number. Your account was not deleted. Please try again or contact support.',
              details: recycleError?.message || String(recycleError),
              twilioLifecycleResult: summary.twilioLifecycleResult,
              dryRun,
            }
          }
        } else {
          console.log('[delete-account-lifecycle] DRY RUN: Would recycle number to warm inventory (pre-deletion)')
          summary.twilioNumberRecycled = business.twilio_phone_number
          summary.tablesDeleted.twilio_numbers_recycled = (summary.tablesDeleted.twilio_numbers_recycled || 0) + 1
          summary.twilioLifecycleResult = {
            success: true,
            phoneNumber: business.twilio_phone_number,
            status: 'recycled',
          }
        }
      }
    }

    const recycledCount = summary.tablesDeleted.twilio_numbers_recycled || 0
    const failedCount = summary.twilioRecycleFailed ? 1 : 0
    if (recycledCount > 0 && failedCount === 0) {
      console.log(`[delete-account-lifecycle] Step 20 completed: successfully recycled ${recycledCount} assigned Twilio number(s) to warm inventory`)
    } else if (recycledCount > 0 && failedCount > 0) {
      console.log(`[delete-account-lifecycle] Step 20 completed: recycled ${recycledCount} number(s) to warm inventory with ${failedCount} failure(s)`)
    } else if (failedCount > 0) {
      console.error(`[delete-account-lifecycle] Step 20 completed: failed to recycle Twilio number to warm inventory`)
    } else {
      console.log('[delete-account-lifecycle] Step 20 completed: no Twilio numbers to recycle')
    }

    // Step 21: Hard-delete businesses (AFTER successful recycle)
    console.log('[delete-account-lifecycle] Step 21: hard-delete businesses')

    for (const business of businesses as any[]) {
      // Hard-delete the business row
      if (!dryRun) {
        const { error: businessesDeleteError } = await supabaseAdmin
          .from('businesses')
          .delete()
          .eq('id', business.id)

        if (businessesDeleteError) {
          console.error('[delete-account-lifecycle] Step 21 hard-delete failed:', businessesDeleteError)
          return {
            ok: false,
            step: 'delete_businesses',
            error: 'Failed to delete account data. Please try again or contact support.',
            details: businessesDeleteError.message,
            dryRun,
          }
        }
      }
    }
    summary.tablesDeleted.businesses = businesses.length
    console.log('[delete-account-lifecycle] Step 21 completed: hard-deleted businesses')

    // Trigger cleanup of excess inventory after recycling
    // This handles the case where recycling numbers back to inventory
    // creates excess numbers above the target
    console.log('[delete-account-lifecycle] Triggering excess inventory cleanup after recycling...')
    const { cleanupExcessInventory } = await import('./warm-number-manager')
    cleanupExcessInventory()
      .then((cleanupResult) => {
        if (cleanupResult.success) {
          if (cleanupResult.numbersEligible === 0) {
            console.log('[delete-account-lifecycle] Excess inventory cleanup: nothing eligible for cleanup')
          } else if (cleanupResult.partialFailure) {
            console.error('[delete-account-lifecycle] Excess inventory cleanup: PARTIAL FAILURE', {
              eligible: cleanupResult.numbersEligible,
              retired: cleanupResult.numbersRetired,
              released: cleanupResult.numbersReleased,
              failed: cleanupResult.numbersFailed,
              failures: cleanupResult.failures,
            })
          } else {
            console.log('[delete-account-lifecycle] Excess inventory cleanup: SUCCESS', {
              eligible: cleanupResult.numbersEligible,
              retired: cleanupResult.numbersRetired,
              released: cleanupResult.numbersReleased,
            })
          }
        } else {
          console.error('[delete-account-lifecycle] Excess inventory cleanup: COMPLETE FAILURE', {
            error: cleanupResult.error,
            failures: cleanupResult.failures,
          })
        }
      })
      .catch((cleanupError) => {
        console.error('[delete-account-lifecycle] Excess inventory cleanup failed (non-blocking):', cleanupError)
      })
  }

  // Step 22: Delete the Supabase Auth user last
  console.log('[delete-account-lifecycle] Step 22: delete auth user', { userId })

  if (!dryRun) {
    try {
      console.log('[delete-account-lifecycle] Starting auth user deletion', { userId })
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)

      if (deleteUserError) {
        console.error('[delete-account-lifecycle] Auth user deletion failed', {
          userId,
          error: deleteUserError,
          errorMessage: deleteUserError.message,
          errorDetails: JSON.stringify(deleteUserError),
        })

        // Check if user is already deleted (idempotency)
        // Supabase returns "User not found" error when trying to delete a non-existent user
        if (deleteUserError.message && deleteUserError.message.includes('User not found')) {
          console.warn('[delete-account-lifecycle] Auth user already deleted, treating as success', { userId })
          summary.authDeletionResult = 'already_deleted'
        } else {
          return {
            ok: false,
            step: 'delete_auth_user',
            error: 'Failed to delete your account. Please try again or contact support.',
            details: deleteUserError.message,
            dryRun,
          }
        }
      } else {
        console.log('[delete-account-lifecycle] Auth user deletion succeeded', { userId })
        summary.authDeletionResult = 'success'
      }

      // Send account deletion confirmation email after successful auth deletion
      if (!dryRun && !skipOffboardingEmails && userEmail) {
        console.log('[delete-account-lifecycle] Sending account deletion confirmation email', {
          userEmail,
        })

        try {
          const business = businesses && businesses.length > 0 ? businesses[0] : null
          const twilioNumberRecycled = summary.twilioNumberRecycled !== undefined

          const emailResult = await sendAccountDeletionConfirmationEmail({
            userEmail,
            businessName: business?.name,
            twilioNumberReserved: twilioNumberRecycled,
            twilioNumber: summary.twilioNumberRecycled,
          })

          if (emailResult.success) {
            console.log('[delete-account-lifecycle] Account deletion confirmation email sent successfully', {
              messageId: emailResult.messageId,
            })
            summary.confirmationEmailSent = true
            summary.confirmationEmailMessageId = emailResult.messageId
          } else {
            console.warn('[delete-account-lifecycle] Failed to send account deletion confirmation email (account deletion completed)', {
              error: emailResult.error,
            })
            summary.confirmationEmailSent = false
            summary.confirmationEmailError = emailResult.error
          }

          // Send journey email with analytics
          if (userEmail && businesses && businesses.length > 0) {
            console.log('[delete-account-lifecycle] Sending journey email with analytics', {
              userEmail,
              analytics,
            })

            try {
              const journeyEmailResult = await sendJourneyEmail({
                userEmail,
                businessName: businesses[0].name,
                analytics,
              })

              if (journeyEmailResult.success) {
                console.log('[delete-account-lifecycle] Journey email sent successfully', {
                  messageId: journeyEmailResult.messageId,
                })
                summary.journeyEmailSent = true
                summary.journeyEmailMessageId = journeyEmailResult.messageId
              } else {
                console.warn('[delete-account-lifecycle] Failed to send journey email (account deletion completed)', {
                  error: journeyEmailResult.error,
                })
                summary.journeyEmailSent = false
                summary.journeyEmailError = journeyEmailResult.error
              }
            } catch (journeyEmailError) {
              console.error('[delete-account-lifecycle] Exception sending journey email (account deletion completed)', {
                error: journeyEmailError instanceof Error ? journeyEmailError.message : String(journeyEmailError),
              })
              summary.journeyEmailSent = false
              summary.journeyEmailError = journeyEmailError instanceof Error ? journeyEmailError.message : 'Unknown error'
            }
          }
        } catch (emailError) {
          console.error('[delete-account-lifecycle] Exception sending account deletion confirmation email (account deletion completed)', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          })
          summary.confirmationEmailSent = false
          summary.confirmationEmailError = emailError instanceof Error ? emailError.message : 'Unknown error'
        }
      }
    } catch (error) {
      console.error('[delete-account-lifecycle] Unexpected error during auth user deletion', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        ok: false,
        step: 'delete_auth_user',
        error: 'Failed to delete your account. Please try again or contact support.',
        details: error instanceof Error ? error.message : 'Unknown error',
        dryRun,
      }
    }
  } else {
    summary.authDeletionResult = 'skipped (dry run)'
  }

  console.log('[delete-account-lifecycle] Step 22 completed', {
    userId,
    authDeletionResult: summary.authDeletionResult,
  })
  console.log('[ACCOUNT DELETE COMPLETE]', {
    userId: summary.userId,
    businessId: summary.businessId,
    stripeResult: summary.stripeResult,
    twilioLifecycleResult: summary.twilioLifecycleResult,
    tablesDeleted: summary.tablesDeleted,
    authDeletionResult: summary.authDeletionResult,
  })

  // Create admin audit log entry for account deletion
  // This ensures account deletion is consistent with other sensitive admin actions
  // Audit logging failure should NOT block deletion
  try {
    const business = businesses && businesses.length > 0 ? businesses[0] : null
    const actingAdminUserId = deletionSource === 'admin' ? adminUserId : userId
    const actingAdminEmail = deletionSource === 'admin' ? adminUserEmail : getUserEmail({ id: userId, email: userEmail } as any)

    logAdminAction({
      actingAdminUserId: actingAdminUserId || userId,
      actingAdminEmail: actingAdminEmail || userEmail || getUserEmail({ id: userId, email: userEmail } as any),
      action: dryRun ? 'account_deletion_dry_run' : 'account_deletion',
      targetBusinessId: summary.businessId || undefined,
      targetUserId: userId,
      resourceIdentifiers: business ? { business_name: business.name } : undefined,
      afterState: {
        deletion_status: dryRun ? 'dry_run' : 'completed',
        deletion_source: deletionSource,
        tables_deleted: summary.tablesDeleted,
        stripe_cancellation: summary.stripeResult?.cancellationSucceeded,
        twilio_lifecycle_result: summary.twilioLifecycleResult,
        auth_deletion_result: summary.authDeletionResult,
        analytics,
      },
      metadata: dryRun ? { mode: 'dry-run' } : { deletionSource },
    })
  } catch (auditError) {
    console.error('[delete-account-lifecycle] Failed to create admin audit log (non-blocking):', auditError)
  }

  return {
    ok: true,
    summary,
    dryRun,
  }
}