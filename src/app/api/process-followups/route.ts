import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";

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
    console.log('[FOLLOWUP CRON START] Route hit');
    
    // Verify CRON_SECRET for cron job protection
    // Support both Authorization header and Vercel's x-vercel-cron header
    const authHeader = request.headers.get('authorization')
    const cronHeader = request.headers.get('x-vercel-cron')
    const searchParams = new URL(request.url).searchParams
    const secretParam = searchParams.get('secret')

    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret) {
      console.error('[FOLLOWUP CRON] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Check authentication via multiple methods
    const isAuthorized = 
      cronHeader === '1' || // Vercel cron
      (authHeader && authHeader.replace('Bearer ', '') === expectedSecret) || // Authorization header
      secretParam === expectedSecret // Query parameter for manual testing

    if (!isAuthorized) {
      console.error('[FOLLOWUP CRON] Unauthorized request - missing or invalid credentials')
      console.error('[FOLLOWUP CRON] Headers:', {
        hasAuth: !!authHeader,
        hasCron: !!cronHeader,
        hasSecret: !!secretParam
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[FOLLOWUP CRON] Authorized successfully');
    console.log('[FOLLOWUP CRON START] Processing started');
    
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
      console.error('[SYSTEM] [FOLLOWUP] Error fetching jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[FOLLOWUP JOBS FOUND] No pending jobs found');
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        errors: 0
      });
    }

    console.log(`[FOLLOWUP JOBS FOUND] ${jobs.length} pending jobs found`);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let errors = 0;

    // Process each job with comprehensive error handling
    const processingErrors: Array<{jobId: string, error: string, updateError?: string, updateData?: any, reselectData?: any}> = [];
    
    for (const job of jobs) {
      processed++;
      console.log(`[FOLLOWUP JOB PROCESSING] Processing job ${job.id}`);

      try {
        console.log(`[FOLLOWUP JOB PROCESSING] Fetching lead for job ${job.id}`);
        
        // Fetch the corresponding lead
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id, caller_phone, business_id, opted_out')
          .eq('id', job.lead_id)
          .single();

        if (leadError || !lead) {
          throw new Error(`Lead not found for job ${job.id}: ${leadError?.message || 'Unknown error'}`);
        }

        console.log(`[SYSTEM] [FOLLOWUP] Lead fetched: ${lead.id}`);

        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[SYSTEM] [FOLLOWUP] Lead ${lead.id} opted out, skipping job ${job.id}`);
          
          // Mark job as failed with opt-out reason
          const { error: updateError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              attempt_count: job.attempt_count + 1,
              last_error_message: 'Lead has opted out of messages',
            })
            .eq('id', job.id);
          
          if (updateError) {
            console.error(`[SYSTEM] [FOLLOWUP] Failed to update job ${job.id}:`, updateError);
          }
          
          failed++;
          continue;
        }

        // Validate lead has phone number
        if (!lead.caller_phone) {
          throw new Error(`Missing phone number for lead ${lead.id}`);
        }

        console.log(`[SYSTEM] [FOLLOWUP] Phone validated: ${lead.caller_phone}`);

        // Fetch business information for Twilio
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('id, twilio_messaging_service_sid, twilio_phone_number')
          .eq('id', lead.business_id)
          .single();

        if (businessError || !business) {
          throw new Error(`Business not found for job ${job.id}: ${businessError?.message || 'Unknown error'}`);
        }

        console.log(`[SYSTEM] [FOLLOWUP] Business fetched: ${business.id}`);
        
        // Validate business has messaging service SID
        if (!business.twilio_messaging_service_sid) {
          throw new Error(`Missing twilio_messaging_service_sid for business ${business.id}`);
        }

        console.log(`[SYSTEM] [FOLLOWUP] Sending SMS to ${lead.caller_phone} for job ${job.id}`);

        // Send SMS using centralized sendSms function
        const messageSid = await sendSms(business, lead.caller_phone, job.message_body, {
          lead_id: job.lead_id,
        });

        // Check for Twilio send errors
        if (!messageSid) {
          throw new Error('SMS send failed: no Twilio message SID returned');
        }

        console.log(`[FOLLOWUP MESSAGE SENT] SMS sent for job ${job.id}, SID: ${messageSid}`);

        console.log(`[SYSTEM] [FOLLOWUP] Message inserted for job ${job.id}`);
        
        console.log(`[SYSTEM] [FOLLOWUP] Marking job ${job.id} as sent`);
        
        // Only mark job as sent if BOTH Twilio message creation AND database insertion succeed
        const { error: jobUpdateError } = await supabase
          .from('follow_up_jobs')
          .update({ status: 'sent' })
          .eq('id', job.id);

        if (jobUpdateError) {
          throw new Error(`Failed to update job status to sent: ${jobUpdateError.message || 'Database error'}`);
        }

        console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} marked as sent`);
        sent++;

      } catch (error: any) {
        console.error(`[SYSTEM] [FOLLOWUP] ERROR processing job ${job.id}:`, error);
        console.error(`[SYSTEM] [FOLLOWUP] Error details:`, {
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
        
        console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} - attempt ${newAttemptCount}/${job.max_attempts}, shouldFail: ${shouldFail}`);
        
        if (shouldFail) {
          // Max attempts reached - mark as failed with error details
          console.log(`[SYSTEM] [FOLLOWUP] Marking job ${job.id} as failed after ${newAttemptCount} attempts`);
          
          const retryUpdateData = { 
            status: 'failed',
            attempt_count: newAttemptCount,
            last_error_message: errorMessage,
            last_error_code: errorCode,
          };
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} update data:`, retryUpdateData);
          
          const { error: updateError, data: updateData } = await supabase
            .from('follow_up_jobs')
            .update(retryUpdateData)
            .eq('id', job.id)
            .select()
            .single();
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} update result:`, { updateError, updateData });
          
          if (updateError) {
            console.error(`[SYSTEM] [FOLLOWUP] Failed to update job ${job.id}:`, updateError);
            processingErrors.push({
              jobId: job.id,
              error: errorMessage,
              updateError: updateError.message
            });
            failed++;
            continue;
          }
          
          // Re-select the job to verify the update
          const { data: verifyJob, error: verifyError } = await supabase
            .from('follow_up_jobs')
            .select('status, attempt_count, scheduled_for, last_error_message')
            .eq('id', job.id)
            .single();
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} verification:`, verifyJob);
          
          if (verifyError) {
            console.error(`[SYSTEM] [FOLLOWUP] Failed to verify job ${job.id}:`, verifyError);
          }
          
          failed++;
        } else {
          // Retry with 5-minute delay and store error details
          const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
          
          console.log(`[SYSTEM] [FOLLOWUP] Scheduling retry for job ${job.id} at ${retryTime}`);
          
          const retryUpdateData = { 
            status: 'pending',
            attempt_count: newAttemptCount,
            scheduled_for: retryTime,
            last_error_message: errorMessage,
            last_error_code: errorCode,
          };
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} update data:`, retryUpdateData);
          
          const { error: updateError, data: updateData } = await supabase
            .from('follow_up_jobs')
            .update(retryUpdateData)
            .eq('id', job.id)
            .select()
            .single();
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} update result:`, { updateError, updateData });
          
          if (updateError) {
            console.error(`[SYSTEM] [FOLLOWUP] Failed to schedule retry for job ${job.id}:`, updateError);
            processingErrors.push({
              jobId: job.id,
              error: errorMessage,
              updateError: updateError.message
            });
            errors++;
            continue;
          }
          
          // Re-select the job to verify the update
          const { data: verifyJob, error: verifyError } = await supabase
            .from('follow_up_jobs')
            .select('status, attempt_count, scheduled_for, last_error_message')
            .eq('id', job.id)
            .single();
          
          console.log(`[SYSTEM] [FOLLOWUP] Job ${job.id} verification:`, verifyJob);
          
          if (verifyError) {
            console.error(`[SYSTEM] [FOLLOWUP] Failed to verify job ${job.id}:`, verifyError);
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

    console.log(`[FOLLOWUP JOB COMPLETE] Processed: ${processed}, Sent: ${sent}, Failed: ${failed}, Errors: ${errors}`);

    return NextResponse.json({
      processed,
      sent,
      failed,
      errors,
      processingErrors: processingErrors.length > 0 ? processingErrors : undefined
    });

  } catch (error) {
    console.error('[SYSTEM] [FOLLOWUP] Unexpected error:', error);
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
