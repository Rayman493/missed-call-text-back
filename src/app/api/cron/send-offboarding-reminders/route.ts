import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOffboardingReminderEmail } from '@/lib/email'
import { sendSms } from '@/lib/twilio'

// Reminder schedule:
// - Initial: sent immediately upon account deletion (handled in delete account flow)
// - Reminder #1: 2-3 days after deletion
// - Reminder #2: 2-3 days after Reminder #1
// - After Reminder #2: delete tracking record and stop

const REMINDER_INTERVAL_DAYS = 3 // Send reminders every 3 days
const MAX_REMINDERS = 2 // Maximum 2 reminders (total of 3 messages: initial + 2 reminders)

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('[Offboarding Reminders] Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        if (record.business_phone_number) {
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

            await sendSms(
              minimalBusiness as any,
              record.business_phone_number,
              reminderSmsMessage,
              { lead_id: undefined }
            )
            console.log(`[Offboarding Reminders] SMS sent successfully to ${record.business_phone_number}`)
          } catch (smsError) {
            console.error(`[Offboarding Reminders] Failed to send SMS to ${record.business_phone_number}:`, smsError)
          }
        }

        // Update reminder count and last reminder timestamp
        const { error: updateError } = await supabaseAdmin
          .from('offboarding_tracking')
          .update({
            reminder_count: record.reminder_count + 1,
            last_reminder_at: now.toISOString(),
          })
          .eq('id', record.id)

        if (updateError) {
          console.error(`[Offboarding Reminders] Failed to update record ${record.id}:`, updateError)
        } else {
          console.log(`[Offboarding Reminders] Updated record ${record.id}: reminder_count=${record.reminder_count + 1}`)
          processedCount++
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
