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
    console.log('[process-followups] Starting follow-up job processing');
    
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
      console.error('[process-followups] Error fetching jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[process-followups] No pending jobs found');
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        errors: 0
      });
    }

    console.log(`[process-followups] Found ${jobs.length} pending jobs`);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let errors = 0;

    // Initialize Twilio client
    const twilioClient = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    // Process each job with comprehensive error handling
    const processingErrors: Array<{jobId: string, error: string}> = [];
    
    for (const job of jobs) {
      processed++;
      console.log(`[process-followups] Picked up job: ${job.id}`);

      try {
        console.log(`[process-followups] Fetching lead for job ${job.id}`);
        
        // Fetch the corresponding lead
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id, caller_phone, business_id, opted_out')
          .eq('id', job.lead_id)
          .single();

        if (leadError || !lead) {
          throw new Error(`Lead not found for job ${job.id}: ${leadError?.message || 'Unknown error'}`);
        }

        console.log(`[process-followups] Lead fetched successfully: ${lead.id}`);

        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[process-followups] Lead ${lead.id} has opted out, skipping job ${job.id}`);
          
          // Mark job as failed with opt-out reason
          const { error: updateError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: 'Lead has opted out of messages',
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
          
          if (updateError) {
            console.error(`[process-followups] Failed to update job ${job.id} status:`, updateError);
          }
          
          failed++;
          continue;
        }

        // Validate lead has phone number
        if (!lead.caller_phone) {
          throw new Error(`Missing phone number for lead ${lead.id}`);
        }

        console.log(`[process-followups] Phone validated: ${lead.caller_phone}`);

        // Fetch business information for Twilio
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('id, twilio_messaging_service_sid, twilio_phone_number')
          .eq('id', lead.business_id)
          .single();

        if (businessError || !business) {
          throw new Error(`Business not found for job ${job.id}: ${businessError?.message || 'Unknown error'}`);
        }

        console.log(`[process-followups] Business fetched successfully: ${business.id}`);
        
        // Validate business has messaging service SID
        if (!business.twilio_messaging_service_sid) {
          throw new Error(`Missing twilio_messaging_service_sid for business ${business.id}`);
        }
        
        console.log(`[process-followups] Attempting Twilio send for job ${job.id}`);
        
        // Send SMS using Twilio Messaging Service
        const messageResult = await twilioClient.messages.create({
          body: job.message_body,
          to: lead.caller_phone,
          messagingServiceSid: business.twilio_messaging_service_sid,
        });

        console.log(`[process-followups] Twilio send succeeded for job ${job.id}, SID: ${messageResult.sid}`);
        
        console.log(`[process-followups] Inserting message row for job ${job.id}`);
        
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
          throw new Error(`Failed to insert message: ${messageInsertError.message || 'Database error'}`);
        }

        console.log(`[process-followups] Message inserted successfully for job ${job.id}`);
        
        console.log(`[process-followups] Marking job ${job.id} as sent`);
        
        // Only mark job as sent if BOTH Twilio message creation AND database insertion succeed
        const { error: jobUpdateError } = await supabase
          .from('follow_up_jobs')
          .update({ status: 'sent' })
          .eq('id', job.id);

        if (jobUpdateError) {
          throw new Error(`Failed to update job status to sent: ${jobUpdateError.message || 'Database error'}`);
        }

        console.log(`[process-followups] Job ${job.id} marked as sent successfully`);
        sent++;

      } catch (error: any) {
        console.error(`[process-followups] ERROR processing job ${job.id}:`, error);
        console.error(`[process-followups] Error details:`, {
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
          console.log(`[process-followups] Marking job ${job.id} as failed after ${newAttemptCount} attempts`);
          
          const { error: updateError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: newAttemptCount,
              last_error_message: errorMessage,
              last_error_code: errorCode,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
          
          if (updateError) {
            console.error(`[process-followups] Failed to update job ${job.id} with error details:`, updateError);
          }
          
          failed++;
        } else {
          // Retry with 5-minute delay and store error details
          const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
          
          console.log(`[process-followups] Scheduling retry for job ${job.id} at ${retryTime}`);
          
          const { error: updateError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'pending',
              attempt_count: newAttemptCount,
              scheduled_for: retryTime,
              last_error_message: errorMessage,
              last_error_code: errorCode,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
          
          if (updateError) {
            console.error(`[process-followups] Failed to update job ${job.id} for retry:`, updateError);
          }
          
          errors++;
        }

        // Track processing errors for response
        processingErrors.push({
          jobId: job.id,
          error: errorMessage
        });
      }
    }

    console.log(`[process-followups] Complete - Processed: ${processed}, Sent: ${sent}, Failed: ${failed}, Errors: ${errors}`);

    return NextResponse.json({
      processed,
      sent,
      failed,
      errors,
      processingErrors: processingErrors.length > 0 ? processingErrors : undefined
    });

  } catch (error) {
    console.error('[process-followups] Unexpected error:', error);
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
