import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

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

export async function POST() {
  try {
    console.log('[process-followup-jobs] Starting follow-up job processing');
    
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
      console.error('[process-followup-jobs] Error fetching jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[process-followup-jobs] No pending jobs found');
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        errors: 0
      });
    }

    console.log(`[process-followup-jobs] Found ${jobs.length} pending jobs`);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let errors = 0;

    // Initialize Twilio client
    const twilioClient = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    // Process each job
    for (const job of jobs) {
      processed++;
      console.log(`[process-followup-jobs] Processing job: ${job.id}`);

      try {
        // Fetch the corresponding lead
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id, caller_phone, business_id, opted_out')
          .eq('id', job.lead_id)
          .single();

        if (leadError || !lead) {
          console.error(`[process-followup-jobs] Lead not found for job ${job.id}:`, leadError);
          
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
          console.log(`[process-followup-jobs] Lead ${lead.id} has opted out, skipping job ${job.id}`);
          
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
          console.error(`[process-followup-jobs] Lead ${lead.id} has no phone number`);
          
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

        // Get business information for Twilio Messaging Service SID
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('twilio_messaging_service_sid, twilio_phone_number')
          .eq('id', lead.business_id)
          .single();

        if (businessError || !business) {
          console.error(`[process-followup-jobs] Business not found for lead ${lead.id}:`, businessError);
          
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

        // Send SMS using Twilio Messaging Service with status callback
        console.log(`[process-followup-jobs] Sending SMS to ${lead.caller_phone} for job ${job.id}`);
        
        const messageResult = await twilioClient.messages.create({
          body: job.message_body,
          to: lead.caller_phone,
          messagingServiceSid: business.twilio_messaging_service_sid,
          statusCallback: "https://replyflowhq.com/api/twilio/status",
        });

        console.log(`[process-followup-jobs] SMS sent successfully for job ${job.id}, SID: ${messageResult.sid}`);

        // Insert row into messages table
        const { error: messageInsertError } = await supabase
          .from('messages')
          .insert({
            lead_id: job.lead_id,
            body: job.message_body,
            direction: 'outbound',
            to_phone: lead.caller_phone,
            from_phone: business.twilio_phone_number,
            status: 'sent',
            twilio_message_sid: messageResult.sid,
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          });

        if (messageInsertError) {
          console.error(`[process-followup-jobs] Failed to insert message for job ${job.id}:`, messageInsertError);
          // This is a retryable error - don't mark as sent
          throw new Error(`Failed to insert message: ${messageInsertError.message || 'Database error'}`);
        }

        // Only mark job as sent if BOTH Twilio message creation AND database insertion succeed
        const { error: jobUpdateError } = await supabase
          .from('follow_up_jobs')
          .update({ status: 'sent' })
          .eq('id', job.id);

        if (jobUpdateError) {
          console.error(`[process-followup-jobs] Failed to update job ${job.id} status:`, jobUpdateError);
          errors++;
        } else {
          sent++;
        }

      } catch (error: any) {
        console.error(`[process-followup-jobs] Error processing job ${job.id}:`, error);
        console.error(`[process-followup-jobs] Error details:`, {
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
          console.log(`[process-followup-jobs] Marking job ${job.id} as failed after ${newAttemptCount} attempts`);
          
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
          
          console.log(`[process-followup-jobs] Scheduling retry for job ${job.id} at ${retryTime}`);
          
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

    console.log(`[process-followup-jobs] Complete - Processed: ${processed}, Sent: ${sent}, Failed: ${failed}, Errors: ${errors}`);

    return NextResponse.json({
      processed,
      sent,
      failed,
      errors
    });

  } catch (error) {
    console.error('[process-followup-jobs] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for testing
export async function GET() {
  return POST();
}
