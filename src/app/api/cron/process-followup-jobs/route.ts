import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";
import { isIgnoredContact } from "@/lib/ignored-contacts";
import { hasBillingAccess } from "@/lib/manual-access";
import { isCompleteAIIntake } from "@/lib/ai-intake-completion";
import { verifyCronRequest } from "@/lib/cron-auth";

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Initialize Supabase client with service role key (server-side only)
const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
);

export async function POST(request: Request) {
  try {
    // Verify cron secret using shared helper
    const authResult = verifyCronRequest(request as any)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    console.log('[Cron] Authorized cron request to /api/cron/process-followup-jobs');
    console.log('[SYSTEM] [FOLLOWUP-CRON] Follow-up job processing started');
    
    // Fetch up to 10 pending jobs where scheduled_for <= now()
    const now = new Date().toISOString();
    const { data: jobs, error: jobsError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(10)
      .order('scheduled_for', { ascending: true });

    if (jobsError) {
      console.error('[SYSTEM] [FOLLOWUP-CRON] Error fetching jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[SYSTEM] [FOLLOWUP-CRON] No pending jobs found');
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        errors: 0
      });
    }

    console.log(`[SYSTEM] [FOLLOWUP-CRON] Found ${jobs.length} pending jobs`);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let cancelled = 0;
    let errors = 0;

    // Process each job
    for (const job of jobs) {
      processed++;
      console.log(`[SYSTEM] [FOLLOWUP-CRON] Processing job: ${job.id}`);

      try {
        // Fetch the corresponding lead
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id, caller_phone, business_id, opted_out')
          .eq('id', job.lead_id)
          .single();

        if (leadError || !lead) {
          console.error(`[SYSTEM] [FOLLOWUP-CRON] Lead not found for job ${job.id}:`, leadError);
          
          // Mark job as failed (non-retryable error)
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: `Lead not found: ${leadError?.message || 'Unknown error'}`,
            })
            .eq('id', job.id);
          
          failed++;
          continue;
        }

        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Lead ${lead.id} opted out, skipping job ${job.id}`);
          
          // Mark job as failed with opt-out reason (non-retryable)
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: 'Lead has opted out of messages',
            })
            .eq('id', job.id);
          
          failed++;
          continue;
        }

        // Check if lead has phone number
        if (!lead.caller_phone) {
          console.error(`[SYSTEM] [FOLLOWUP-CRON] Lead ${lead.id} has no phone number`);
          
          // Mark job as failed (non-retryable error)
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: 'Lead has no phone number',
            })
            .eq('id', job.id);
          
          failed++;
          continue;
        }

        // ATOMIC CLAIM: Update job from pending -> processing
        // Only the worker that successfully claims the job may proceed
        const { data: claimedJob, error: claimError } = await supabase
          .from('follow_up_jobs')
          .update({
            status: 'processing',
            processing_started_at: new Date().toISOString()
          })
          .eq('id', job.id)
          .eq('status', 'pending') // Only claim if still pending
          .select()
          .single();

        if (claimError || !claimedJob) {
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Job ${job.id} already claimed or failed to claim, skipping`);
          errors++;
          continue;
        }

        console.log(`[SYSTEM] [FOLLOWUP-CRON] Job ${job.id} successfully claimed for processing`);

        // Get business information for Twilio Messaging Service SID
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', lead.business_id)
          .single();

        if (businessError || !business) {
          console.error(`[SYSTEM] [FOLLOWUP-CRON] Business not found for lead ${lead.id}:`, businessError);
          
          // Mark job as failed (non-retryable error)
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: `Business not found: ${businessError?.message || 'Unknown error'}`,
            })
            .eq('id', job.id);
          
          failed++;
          continue;
        }

        // Check if lead phone is in ignored contacts
        const isIgnored = await isIgnoredContact(business.id, lead.caller_phone);
        if (isIgnored) {
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Lead ${lead.id} phone is in ignored contacts, skipping job ${job.id}`);
          await supabase
            .from('follow_up_jobs')
            .update({
              status: 'cancelled',
              cancelled_reason: 'ignored_contact',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', job.id);
          failed++;
          continue;
        }

        // Check if business has active access (subscription or manual access)
        if (!hasBillingAccess(business)) {
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Business ${business.id} does not have active access, skipping job ${job.id}`);
          await supabase
            .from('follow_up_jobs')
            .update({
              status: 'cancelled',
              cancelled_reason: 'no_active_access',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', job.id);
          failed++;
          continue;
        }

        // Guard: Check if AI intake is complete - skip follow-up if so
        console.log(`[SYSTEM] [FOLLOWUP-CRON] Checking AI intake completion for lead: ${job.lead_id}`)
        const { data: aiCallRecords, error: aiRecordsError } = await supabase
          .from('ai_call_records')
          .select('extracted_info, outcome')
          .eq('lead_id', job.lead_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const completedOutcomes = ['complete', 'completed', 'completed_intake']
        const aiIntakeComplete = !aiRecordsError && !!aiCallRecords && (
          completedOutcomes.includes(String(aiCallRecords.outcome || '').toLowerCase()) ||
          isCompleteAIIntake(aiCallRecords.extracted_info)
        )
        console.log(`[SYSTEM] [FOLLOWUP-CRON] AI intake completion check for lead ${job.lead_id}:`, {
          hasAiRecords: !!aiCallRecords,
          aiOutcome: aiCallRecords?.outcome,
          aiIntakeComplete
        })

        if (aiIntakeComplete) {
          console.log(`[FOLLOWUP SUPPRESSED] reason=ai_intake_complete leadId=${job.lead_id} jobId=${job.id}`)
          await supabase
            .from('follow_up_jobs')
            .update({
              status: 'cancelled',
              cancelled_reason: 'ai_intake_complete',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', job.id);
          cancelled++;
          continue;
        }

        // Look up open conversation for this lead
        console.log(`[AUTO RESPONSE] Looking up conversation for lead: ${job.lead_id}`);
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', job.lead_id)
          .eq('status', 'open')
          .maybeSingle();

        if (conversationError) {
          console.error('[AUTO RESPONSE] Error fetching conversation:', conversationError);
        }

        if (conversation) {
          console.log(`[AUTO RESPONSE] Found conversation: ${conversation.id} for lead: ${job.lead_id}`);
        } else {
          console.warn(`[AUTO RESPONSE] No open conversation found for lead: ${job.lead_id}, proceeding without conversation`);
        }

        // Send SMS using centralized sendSms function
        console.log('[AUTO RESPONSE SEND START]', {
          leadId: job.lead_id,
          conversationId: conversation?.id,
          toPhone: lead.caller_phone,
          messagePreview: job.message_body.substring(0, 50) + '...'
        });

        // Check if business is currently Out of Office and append notice
        let messageBody = job.message_body;

        const smsOptions: any = {
          lead_id: job.lead_id,
        };

        // Include conversation_id if we have one
        if (conversation) {
          smsOptions.conversation_id = conversation.id;
        }

        console.log('[FOLLOWUP FINAL SMS BODY] =========================================');
        console.log('[FOLLOWUP FINAL SMS BODY] followUpId:', job.id);
        console.log('[FOLLOWUP FINAL SMS BODY] businessId:', business.id);
        console.log('[FOLLOWUP FINAL SMS BODY] stepNumber:', job.step);
        console.log('[FOLLOWUP FINAL SMS BODY] finalBody:', messageBody);
        console.log('[FOLLOWUP FINAL SMS BODY] finalBodyLength:', messageBody.length);
        console.log('[FOLLOWUP FINAL SMS BODY] Timestamp:', new Date().toISOString());
        console.log('[FOLLOWUP FINAL SMS BODY] =========================================');

        const messageSid = await sendSms(business, lead.caller_phone, messageBody, smsOptions);

        if (messageSid) {
          console.log('[AUTO RESPONSE TWILIO SENT]', {
            messageSid,
            leadId: job.lead_id,
            conversationId: conversation?.id
          });
        } else {
          console.error('[AUTO RESPONSE MESSAGE INSERT ERROR]', {
            leadId: job.lead_id,
            conversationId: conversation?.id,
            error: 'No message SID returned from sendSms'
          });
        }

        if (!messageSid) {
          throw new Error('SMS send failed: no Twilio message SID returned');
        }

        console.log(`[SYSTEM] [FOLLOWUP-CRON] SMS sent for job ${job.id}, SID: ${messageSid}`);

        // Only mark job as sent if BOTH Twilio message creation AND database insertion succeed
        const { error: jobUpdateError } = await supabase
          .from('follow_up_jobs')
          .update({ status: 'sent' })
          .eq('id', job.id);

        if (jobUpdateError) {
          console.error(`[SYSTEM] [FOLLOWUP-CRON] Failed to update job ${job.id}:`, jobUpdateError);
          errors++;
        } else {
          sent++;
        }

      } catch (error: any) {
        console.error(`[SYSTEM] [FOLLOWUP-CRON] ERROR processing job ${job.id}:`, error);
        console.error(`[SYSTEM] [FOLLOWUP-CRON] Error details:`, {
          jobId: job.id,
          errorMessage: error.message,
          errorCode: error.code,
          errorStack: error.stack
        });
        
        // Increment attempt count and determine retry logic
        const newAttemptCount = job.attempt_count + 1;
        const shouldFail = newAttemptCount >= job.max_attempts;
        
        // Prepare error data for storage
        const errorMessage = String(error?.message || error || 'Unknown error occurred');
        const errorCode = error?.code || null;
        
        if (shouldFail) {
          // Max attempts reached - mark as failed with error details
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Marking job ${job.id} as failed after ${newAttemptCount} attempts`);
          
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: newAttemptCount,
              last_error_message: errorMessage,
              last_error_code: errorCode,
            })
            .eq('id', job.id);
          
          failed++;
        } else {
          // Retry with 5-minute delay and store error details
          const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
          
          console.log(`[SYSTEM] [FOLLOWUP-CRON] Scheduling retry for job ${job.id} at ${retryTime}`);
          
          await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'pending',
              attempt_count: newAttemptCount,
              scheduled_for: retryTime,
              last_error_message: errorMessage,
              last_error_code: errorCode,
            })
            .eq('id', job.id);
          
          errors++;
        }
      }
    }

    console.log(`[SYSTEM] [FOLLOWUP-CRON] Complete - Processed: ${processed}, Sent: ${sent}, Failed: ${failed}, Errors: ${errors}`);

    return NextResponse.json({
      processed,
      sent,
      failed,
      errors
    });

  } catch (error) {
    console.error('[SYSTEM] [FOLLOWUP-CRON] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for testing
export async function GET(request: Request) {
  return POST(request);
}
