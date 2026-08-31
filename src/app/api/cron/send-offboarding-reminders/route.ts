import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOffboardingReminderEmail } from '@/lib/email'
import { sendSms } from '@/lib/twilio'
import { verifyCronRequest } from '@/lib/cron-auth'

// Reminder schedule:
// - Initial: sent immediately upon account deletion (handled in delete account flow)
// - Reminder #1: 2-3 days after deletion
// - Reminder #2: 2-3 days after Reminder #1
// - After Reminder #2: delete tracking record and stop

const REMINDER_INTERVAL_DAYS = 3 // Send reminders every 3 days
const MAX_REMINDERS = 2 // Maximum 2 reminders (total of 3 messages: initial + 2 reminders)
const CLAIM_TIMEOUT_MINUTES = 5 // Claims expire after 5 minutes (stale claims)

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret using shared helper
    const authResult = verifyCronRequest(request)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    console.log('[Offboarding Reminders] Starting reminder scheduler')

    // Find all unconfirmed offboarding records that need reminders
    const { data: pendingRecords, error: fetchError } = await supabaseAdmin
      .from('offboarding_tracking')
      .select('*')
      .eq('forwarding_confirmed', false)
      .lt('reminder_count', MAX_REMINDERS)

    if (fetchError) {
      console.error('[Offboarding Reminders] Failed to fetch pending records:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch pending records', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!pendingRecords || pendingRecords.length === 0) {
      console.log('[Offboarding Reminders] No pending records to process')
      return NextResponse.json({ success: true, processed: 0 })
    }

    console.log(`[Offboarding Reminders] Found ${pendingRecords.length} pending records`)

    const now = new Date()

    // Clean up stale claims (claims older than CLAIM_TIMEOUT_MINUTES)
    // This prevents records from getting stuck if a worker crashes
    const staleClaimThreshold = new Date(now.getTime() - CLAIM_TIMEOUT_MINUTES * 60 * 1000)
    const { error: staleClaimError } = await supabaseAdmin
      .from('offboarding_tracking')
      .update({ processing_at: null })
      .lt('processing_at', staleClaimThreshold.toISOString())

    if (staleClaimError) {
      console.error('[Offboarding Reminders] Failed to clean up stale claims:', staleClaimError)
    } else {
      console.log('[Offboarding Reminders] Cleaned up stale claims')
    }

    let processedCount = 0
    let deletedCount = 0

    for (const record of pendingRecords) {
      const deletionDate = new Date(record.deletion_timestamp)
      const daysSinceDeletion = Math.floor((now.getTime() - deletionDate.getTime()) / (1000 * 60 * 60 * 24))
      const lastReminderDate = record.last_reminder_at ? new Date(record.last_reminder_at) : deletionDate
      const daysSinceLastReminder = Math.floor((now.getTime() - lastReminderDate.getTime()) / (1000 * 60 * 60 * 24))

      // Check if it's time to send a reminder
      if (daysSinceLastReminder >= REMINDER_INTERVAL_DAYS) {
        console.log(`[Offboarding Reminders] Processing record ${record.id}: reminder_count=${record.reminder_count}, days_since_deletion=${daysSinceDeletion}`)

        // Check if we've reached max reminders
        if (record.reminder_count >= MAX_REMINDERS) {
          console.log(`[Offboarding Reminders] Max reminders reached for record ${record.id}, deleting tracking record`)

          // Delete the tracking record after max reminders
          await supabaseAdmin
            .from('offboarding_tracking')
            .delete()
            .eq('id', record.id)

          deletedCount++
          continue
        }

        // CLAIM: Try to claim this record for processing
        // Only proceed if we successfully acquire the claim
        const claimTimestamp = now.toISOString()
        const { data: claimedRecord, error: claimError } = await supabaseAdmin
          .from('offboarding_tracking')
          .update({ processing_at: claimTimestamp })
          .eq('id', record.id)
          .is('processing_at', null) // Only claim if not already being processed
          .select()
          .single()

        if (claimError || !claimedRecord) {
          console.log(`[Offboarding Reminders] Failed to claim record ${record.id} (already being processed or race condition), skipping`)
          continue
        }

        console.log(`[Offboarding Reminders] Successfully claimed record ${record.id}`)

        try {
          // Send reminder email
          const emailResult = await sendOffboardingReminderEmail({
            businessEmail: record.business_email,
            confirmationToken: record.confirmation_token,
            reminderNumber: record.reminder_count + 1,
            businessPhone: record.business_phone_number,
          })

          if (emailResult.success) {
            console.log(`[Offboarding Reminders] Email sent successfully to ${record.business_email}`)
          } else {
            console.error(`[Offboarding Reminders] Failed to send email to ${record.business_email}:`, emailResult.error)
          }

        // Send reminder SMS (if we have a business phone number)
        let smsResult: 'sent' | 'skipped' | 'failed' = 'skipped'
        if (record.business_phone_number && record.twilio_phone_number) {
          const reminderSmsMessage = `ReplyFlow Reminder: Please disable call forwarding to ensure missed calls return to your normal voicemail.

Confirm you've disabled forwarding: ${process.env.NEXT_PUBLIC_APP_URL}/api/offboarding/confirm?token=${record.confirmation_token}

This is reminder #${record.reminder_count + 1} of ${MAX_REMINDERS}.`

          try {
            // We need a business object for sendSms, but we don't have the full business data
            // For offboarding, we'll use a minimal object with just the phone number
            const minimalBusiness = {
              id: record.business_id || '',
              business_phone_number: record.business_phone_number,
              twilio_phone_number: record.twilio_phone_number,
              twilio_messaging_service_sid: null,
              twilio_phone_number_sid: null,
              provisioning_status: null,
            }

            const smsSent = await sendSms(
              minimalBusiness as any,
              record.business_phone_number,
              reminderSmsMessage,
              { lead_id: undefined }
            )

            // sendSms returns the message SID on success, null on failure
            if (smsSent) {
              console.log(`[Offboarding Reminders] SMS sent successfully to ${record.business_phone_number}, SID: ${smsSent}`)
              smsResult = 'sent'
            } else {
              console.error(`[Offboarding Reminders] SMS send returned null (no canonical Twilio number) for ${record.business_phone_number}`)
              smsResult = 'failed'
            }
          } catch (smsError) {
            console.error(`[Offboarding Reminders] SMS send threw exception for ${record.business_phone_number}:`, smsError)
            smsResult = 'failed'
          }
        } else if (!record.twilio_phone_number) {
          // Twilio number has been recycled/released - SMS is intentionally unavailable
          console.log(`[Offboarding Reminders] SMS skipped for ${record.business_phone_number} (Twilio number recycled/released)`)
          smsResult = 'skipped'
        }

        // Update reminder count and last reminder timestamp, and release the claim
        // Use conditional update to prevent race conditions and duplicate delivery
        // Only update if reminder_count hasn't changed since we read it
        const { data: updatedRecord, error: updateError } = await supabaseAdmin
          .from('offboarding_tracking')
          .update({
            reminder_count: record.reminder_count + 1,
            last_reminder_at: now.toISOString(),
            processing_at: null, // Release claim
          })
          .eq('id', record.id)
          .eq('reminder_count', record.reminder_count) // Conditional: only if unchanged
          .select()
          .single()

        if (updateError) {
          console.error(`[Offboarding Reminders] Failed to update record ${record.id}:`, updateError)
          // Attempt to release claim even on update failure
          await supabaseAdmin
            .from('offboarding_tracking')
            .update({ processing_at: null })
            .eq('id', record.id)
          // If update failed, we may have sent email but not updated tracking
          // This creates a risk of duplicate delivery, but we cannot retry safely
          // Log the failure for manual investigation
          console.error(`[Offboarding Reminders] EMAIL SENT BUT TRACKING UPDATE FAILED for ${record.id} - duplicate delivery risk`)
        } else if (!updatedRecord) {
          console.error(`[Offboarding Reminders] Conditional update failed for ${record.id} - reminder_count changed by another process`)
          // Another process already updated this record, so our email might be a duplicate
          // We cannot undo the sent email, but we prevented tracking corruption
        } else {
          console.log(`[Offboarding Reminders] Updated record ${record.id}: reminder_count=${updatedRecord.reminder_count}, email=${emailResult.success ? 'sent' : 'failed'}, sms=${smsResult}`)
          processedCount++
        }
      } catch (processingError) {
        console.error(`[Offboarding Reminders] Error processing record ${record.id}:`, processingError)
        // Release claim on error
        await supabaseAdmin
          .from('offboarding_tracking')
          .update({ processing_at: null })
          .eq('id', record.id)
      }
      }
    }

    console.log(`[Offboarding Reminders] Completed: processed=${processedCount}, deleted=${deletedCount}`)

    return NextResponse.json({
      success: true,
      processed: processedCount,
      deleted: deletedCount,
    })
  } catch (error) {
    console.error('[Offboarding Reminders] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process reminders', details: String(error) },
      { status: 500 }
    )
  }
}
