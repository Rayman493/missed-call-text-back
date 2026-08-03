/**
 * Reconcile Twilio inventory with database (read-only)
 * 
 * Compares Twilio owned numbers with twilio_numbers table to detect discrepancies.
 * Reports orphaned numbers without taking any destructive actions.
 * 
 * Returns:
 * - numbersInTwilioNotInDb: Numbers purchased from Twilio but not recorded in DB
 * - numbersInDbNotInTwilio: Numbers in DB but not owned by Twilio
 * - systemNumber: The protected system number (if found)
 */
export async function reconcileTwilioInventory(): Promise<{
  success: boolean;
  numbersInTwilioNotInDb: Array<{ phoneNumber: string; sid: string }>;
  numbersInDbNotInTwilio: Array<{ phoneNumber: string; sid: string; id: string }>;
  systemNumber?: { phoneNumber: string; sid: string };
  error?: string;
}> {
  console.log('[RECONCILE] ========== START TWILIO INVENTORY RECONCILIATION ==========');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const systemPhoneNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER;

  if (!accountSid || !authToken) {
    console.error('[RECONCILE] ERROR: Missing Twilio credentials');
    return {
      success: false,
      numbersInTwilioNotInDb: [],
      numbersInDbNotInTwilio: [],
      error: 'Missing Twilio credentials'
    };
  }

  try {
    const client = Twilio(accountSid, authToken);

    // STEP 1: Fetch all numbers from Twilio
    console.log('[RECONCILE] STEP 1: Fetching all numbers from Twilio...');
    const twilioNumbers = await client.incomingPhoneNumbers.list();
    console.log(`[RECONCILE] Found ${twilioNumbers.length} numbers in Twilio`);

    // STEP 2: Fetch all numbers from database
    console.log('[RECONCILE] STEP 2: Fetching all numbers from database...');
    const { data: dbNumbers, error: dbError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, status')
      .neq('status', 'released');

    if (dbError) {
      console.error('[RECONCILE] ERROR: Failed to fetch from database:', dbError);
      return {
        success: false,
        numbersInTwilioNotInDb: [],
        numbersInDbNotInTwilio: [],
        error: 'Failed to fetch from database'
      };
    }

    console.log(`[RECONCILE] Found ${dbNumbers?.length || 0} numbers in database`);

    // STEP 3: Build lookup maps
    const dbSidMap = new Map(dbNumbers?.map(n => [n.twilio_sid, n]) || []);
    const twilioSidMap = new Map(twilioNumbers.map(n => [n.sid, n]));

    // STEP 4: Find numbers in Twilio but not in DB
    const numbersInTwilioNotInDb: Array<{ phoneNumber: string; sid: string }> = [];
    let systemNumber: { phoneNumber: string; sid: string } | undefined = undefined;

    for (const twilioNumber of twilioNumbers) {
      if (!dbSidMap.has(twilioNumber.sid)) {
        // Check if this is the system number
        if (systemPhoneNumber && twilioNumber.phoneNumber === systemPhoneNumber) {
          systemNumber = {
            phoneNumber: twilioNumber.phoneNumber,
            sid: twilioNumber.sid
          };
          console.log(`[RECONCILE] Found system number: ${twilioNumber.phoneNumber}`);
        } else {
          numbersInTwilioNotInDb.push({
            phoneNumber: twilioNumber.phoneNumber,
            sid: twilioNumber.sid
          });
          console.log(`[RECONCILE] ORPHAN DETECTED: Number in Twilio but not in DB: ${twilioNumber.phoneNumber} (${twilioNumber.sid})`);
        }
      }
    }

    // STEP 5: Find numbers in DB but not in Twilio
    const numbersInDbNotInTwilio: Array<{ phoneNumber: string; sid: string; id: string }> = [];

    for (const dbNumber of dbNumbers || []) {
      if (!twilioSidMap.has(dbNumber.twilio_sid)) {
        numbersInDbNotInTwilio.push({
          phoneNumber: dbNumber.phone_number,
          sid: dbNumber.twilio_sid,
          id: dbNumber.id
        });
        console.log(`[RECONCILE] DISCREPANCY: Number in DB but not in Twilio: ${dbNumber.phone_number} (${dbNumber.twilio_sid})`);
      }
    }

    console.log(`[RECONCILE] Reconciliation complete:`);
    console.log(`[RECONCILE] - Orphaned numbers (Twilio not in DB): ${numbersInTwilioNotInDb.length}`);
    console.log(`[RECONCILE] - Discrepant numbers (DB not in Twilio): ${numbersInDbNotInTwilio.length}`);
    console.log(`[RECONCILE] - System number: ${systemNumber ? systemNumber.phoneNumber : 'not found'}`);
    console.log('[RECONCILE] ========== END TWILIO INVENTORY RECONCILIATION ==========');

    return {
      success: true,
      numbersInTwilioNotInDb,
      numbersInDbNotInTwilio,
      systemNumber
    };

  } catch (error: any) {
    console.error('[RECONCILE] EXCEPTION: Reconciliation failed:', error);
    console.error('[RECONCILE] ========== END TWILIO INVENTORY RECONCILIATION (EXCEPTION) ==========');
    return {
      success: false,
      numbersInTwilioNotInDb: [],
      numbersInDbNotInTwilio: [],
      error: error.message
    };
  }
}

/**
 * Recover stuck provisioning states
 * 
 * Finds numbers stuck in intermediate provisioning states and attempts to recover them.
 * States handled: campaign_registering, campaign_registered, sender_pool_attaching, purchasing
 * 
 * Recovery strategy:
 * - If stuck > 30 minutes: attempt to resume provisioning
 * - If recovery fails: mark as failed with error, schedule retry with exponential backoff
 * - After MAX_RECOVERY_ATTEMPTS: permanently mark as failed
 * 
 * Overlap protection:
 * - Uses recovery_run_id to prevent concurrent processing of same number
 * - Stale claims (stuck for > 1 hour) are automatically reclaimed
 * 
 * Batching:
 * - Processes up to BATCH_SIZE numbers per run to avoid timeout
 * - Processes numbers with next_recovery_retry_at <= now first
 * 
 * Returns recovery statistics.
 */
const MAX_RECOVERY_ATTEMPTS = 5;
const BATCH_SIZE = 20; // Process max 20 numbers per run to avoid timeout
const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const STALE_CLAIM_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const BASE_RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour base delay

export async function recoverStuckProvisioning(recoveryRunId?: string): Promise<{
  success: boolean;
  recovered: number;
  failed: number;
  skipped: number;
  errors: Array<{ phoneNumber: string; sid: string; state: string; error: string }>;
  recoveryRunId: string;
}> {
  console.log('[RECOVERY] ========== START STUCK PROVISIONING RECOVERY ==========');

  // Generate or use provided recovery run ID for overlap protection
  const runId = recoveryRunId || crypto.randomUUID();
  console.log(`[RECOVERY] Recovery run ID: ${runId}`);

  const now = new Date();
  const stuckTime = new Date(now.getTime() - STUCK_THRESHOLD_MS).toISOString();
  const staleClaimTime = new Date(now.getTime() - STALE_CLAIM_THRESHOLD_MS).toISOString();

  const errors: Array<{ phoneNumber: string; sid: string; state: string; error: string }> = [];
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // STEP 1: Create recovery run audit record
    const { data: recoveryRun, error: runError } = await supabase
      .from('provisioning_recovery_runs')
      .insert({
        id: runId,
        trigger_source: recoveryRunId ? 'manual' : 'cron',
        deployment_environment: process.env.NODE_ENV || 'unknown',
      })
      .select()
      .single();

    if (runError) {
      console.error('[RECOVERY] ERROR: Failed to create recovery run record:', runError);
      return {
        success: false,
        recovered: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        recoveryRunId: runId
      };
    }

    console.log(`[RECOVERY] Created recovery run record: ${recoveryRun.id}`);

    // STEP 2: Reclaim stale claims (numbers with recovery_run_id set > 1 hour ago)
    console.log('[RECOVERY] STEP 2: Reclaiming stale claims...');
    const { data: reclaimedClaims } = await supabase
      .from('twilio_numbers')
      .update({
        recovery_run_id: null,
        last_recovery_error: 'Stale claim reclaimed',
      })
      .not('recovery_run_id', 'is', null)
      .lt('last_recovery_attempt_at', staleClaimTime)
      .select('id');
    
    if (reclaimedClaims && reclaimedClaims.length > 0) {
      console.log(`[RECOVERY] Reclaimed ${reclaimedClaims.length} stale claims`);
    }

    // STEP 3: Find numbers eligible for recovery
    // Priority: next_recovery_retry_at <= now (scheduled retries)
    // Then: stuck > 30 minutes AND (no recovery_run_id OR recovery_run_id is null)
    console.log('[RECOVERY] STEP 3: Finding eligible numbers for recovery...');
    
    // First, get scheduled retries
    const { data: scheduledRetries, error: scheduledError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, provisioning_status, last_provisioning_attempt_at, recovery_attempt_count, last_recovery_error')
      .in('provisioning_status', ['campaign_registering', 'campaign_registered', 'sender_pool_attaching', 'purchasing'])
      .lte('next_recovery_retry_at', now.toISOString())
      .is('recovery_run_id', null)
      .limit(BATCH_SIZE)
      .order('next_recovery_retry_at', { ascending: true });

    let eligibleNumbers = scheduledRetries || [];

    // If we have capacity, add newly stuck numbers
    if (eligibleNumbers.length < BATCH_SIZE) {
      const remainingSlots = BATCH_SIZE - eligibleNumbers.length;
      const { data: newlyStuck, error: stuckError } = await supabase
        .from('twilio_numbers')
        .select('id, phone_number, twilio_sid, business_id, provisioning_status, last_provisioning_attempt_at, recovery_attempt_count, last_recovery_error')
        .in('provisioning_status', ['campaign_registering', 'campaign_registered', 'sender_pool_attaching', 'purchasing'])
        .lt('last_provisioning_attempt_at', stuckTime)
        .is('recovery_run_id', null)
        .not('next_recovery_retry_at', 'is', null)
        .limit(remainingSlots)
        .order('last_provisioning_attempt_at', { ascending: true });

      if (stuckError) {
        console.error('[RECOVERY] ERROR: Failed to fetch newly stuck numbers:', stuckError);
      } else if (newlyStuck) {
        eligibleNumbers = [...eligibleNumbers, ...newlyStuck];
      }
    }

    if (eligibleNumbers.length === 0) {
      console.log('[RECOVERY] No eligible numbers found');
      
      // Update recovery run as complete
      await supabase
        .from('provisioning_recovery_runs')
        .update({
          finished_at: now.toISOString(),
          stuck_count: 0,
          processed_count: 0,
          recovered_count: 0,
          failed_count: 0,
          skipped_count: 0,
          summary: 'No eligible numbers found'
        })
        .eq('id', runId);

      return {
        success: true,
        recovered: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        recoveryRunId: runId
      };
    }

    console.log(`[RECOVERY] Found ${eligibleNumbers.length} eligible numbers`);

    // STEP 4: Attempt to recover each eligible number
    for (const number of eligibleNumbers) {
      console.log(`[RECOVERY] Processing: ${number.phone_number} (${number.provisioning_status}, attempt ${number.recovery_attempt_count || 0}/${MAX_RECOVERY_ATTEMPTS})`);

      // ATOMIC CLAIM: Update recovery_run_id to prevent concurrent processing
      const { data: claimedNumber, error: claimError } = await supabase
        .from('twilio_numbers')
        .update({
          recovery_run_id: runId,
          last_recovery_attempt_at: now.toISOString(),
          recovery_attempt_count: (number.recovery_attempt_count || 0) + 1,
        })
        .eq('id', number.id)
        .is('recovery_run_id', null) // Only claim if not already claimed
        .select()
        .single();

      if (claimError || !claimedNumber) {
        console.log(`[RECOVERY] Number ${number.phone_number} already claimed or failed to claim, skipping`);
        skipped++;
        continue;
      }

      console.log(`[RECOVERY] Successfully claimed: ${number.phone_number}`);

      try {
        if (!number.business_id) {
          console.log(`[RECOVERY] Skipping ${number.phone_number}: no business_id`);
          skipped++;
          
          // Release claim
          await supabase
            .from('twilio_numbers')
            .update({ recovery_run_id: null })
            .eq('id', number.id);
          continue;
        }

        let recoverySuccess = false;
        let recoveryError: string | undefined;

        // Check if max attempts reached
        if ((number.recovery_attempt_count || 0) >= MAX_RECOVERY_ATTEMPTS) {
          console.log(`[RECOVERY] Max recovery attempts reached for ${number.phone_number}, marking as failed`);
          
          await updateProvisioningStatus(
            number.business_id,
            number.twilio_sid,
            'failed',
            `Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached. Last error: ${number.last_recovery_error || 'Unknown'}`,
            runId
          );
          
          failed++;
          errors.push({
            phoneNumber: number.phone_number,
            sid: number.twilio_sid,
            state: number.provisioning_status,
            error: `Max recovery attempts reached`
          });
          continue;
        }

        // Recovery strategy based on current state
        const correlationId = `recovery-${Date.now()}-${number.id}`;
        
        switch (number.provisioning_status) {
          case 'campaign_registering':
          case 'campaign_registered':
            // Retry campaign registration
            console.log(`[RECOVERY] Retrying campaign registration for ${number.phone_number}`);
            const campaignResult = await registerToA2PCampaign(
              number.twilio_sid,
              number.business_id,
              correlationId
            );
            recoverySuccess = campaignResult.success;
            recoveryError = campaignResult.error;
            break;

          case 'sender_pool_attaching':
            // Retry sender pool attachment
            console.log(`[RECOVERY] Retrying sender pool attachment for ${number.phone_number}`);
            const attachResult = await attachToSenderPool(
              number.twilio_sid,
              number.business_id,
              correlationId
            );
            recoverySuccess = attachResult.success;
            recoveryError = attachResult.error;
            break;

          case 'purchasing':
            // Purchasing is stuck - this is critical, mark as failed
            console.log(`[RECOVERY] Number stuck in 'purchasing' - marking as failed: ${number.phone_number}`);
            await updateProvisioningStatus(
              number.business_id,
              number.twilio_sid,
              'failed',
              'Stuck in purchasing state - manual intervention required',
              correlationId
            );
            recoverySuccess = false;
            recoveryError = 'Stuck in purchasing state';
            break;

          default:
            console.log(`[RECOVERY] Unknown state: ${number.provisioning_status}`);
            skipped++;
            
            // Release claim
            await supabase
              .from('twilio_numbers')
              .update({ recovery_run_id: null })
              .eq('id', number.id);
            continue;
        }

        if (recoverySuccess) {
          console.log(`[RECOVERY] ✓ Recovered: ${number.phone_number}`);
          
          // Clear recovery metadata on success
          await supabase
            .from('twilio_numbers')
            .update({
              recovery_run_id: null,
              last_recovery_error: null,
              next_recovery_retry_at: null,
            })
            .eq('id', number.id);
          
          recovered++;
        } else {
          console.log(`[RECOVERY] ✗ Recovery failed: ${number.phone_number} - ${recoveryError}`);
          
          // Calculate exponential backoff: base * 2^(attempt-1), max 24 hours
          const attemptNumber = number.recovery_attempt_count || 0;
          const backoffHours = Math.min(Math.pow(2, attemptNumber - 1), 24);
          const nextRetryAt = new Date(now.getTime() + backoffHours * 60 * 60 * 1000).toISOString();
          
          // Update retry metadata
          await supabase
            .from('twilio_numbers')
            .update({
              recovery_run_id: null, // Release claim
              last_recovery_error: recoveryError || 'Unknown error',
              next_recovery_retry_at: nextRetryAt,
            })
            .eq('id', number.id);
          
          errors.push({
            phoneNumber: number.phone_number,
            sid: number.twilio_sid,
            state: number.provisioning_status,
            error: recoveryError || 'Unknown error'
          });
          failed++;
        }

      } catch (error: any) {
        console.error(`[RECOVERY] Exception recovering ${number.phone_number}:`, error);
        
        // Calculate exponential backoff
        const attemptNumber = number.recovery_attempt_count || 0;
        const backoffHours = Math.min(Math.pow(2, attemptNumber - 1), 24);
        const nextRetryAt = new Date(now.getTime() + backoffHours * 60 * 60 * 1000).toISOString();
        
        // Update retry metadata on exception
        await supabase
          .from('twilio_numbers')
          .update({
            recovery_run_id: null, // Release claim
            last_recovery_error: error.message || 'Recovery exception',
            next_recovery_retry_at: nextRetryAt,
          })
          .eq('id', number.id);
        
        errors.push({
          phoneNumber: number.phone_number,
          sid: number.twilio_sid,
          state: number.provisioning_status,
          error: error.message || 'Unknown error'
        });
        failed++;
      }
    }

    // STEP 5: Update recovery run audit record
    await supabase
      .from('provisioning_recovery_runs')
      .update({
        finished_at: now.toISOString(),
        stuck_count: eligibleNumbers.length,
        processed_count: recovered + failed + skipped,
        recovered_count: recovered,
        failed_count: failed,
        skipped_count: skipped,
        summary: `Processed ${eligibleNumbers.length} numbers: ${recovered} recovered, ${failed} failed, ${skipped} skipped`,
        error: errors.length > 0 ? `${errors.length} errors encountered` : null,
      })
      .eq('id', runId);

    console.log(`[RECOVERY] Recovery complete:`);
    console.log(`[RECOVERY] - Recovered: ${recovered}`);
    console.log(`[RECOVERY] - Failed: ${failed}`);
    console.log(`[RECOVERY] - Skipped: ${skipped}`);
    console.log(`[RECOVERY] - Recovery Run ID: ${runId}`);
    console.log('[RECOVERY] ========== END STUCK PROVISIONING RECOVERY ==========');

    return {
      success: true,
      recovered,
      failed,
      skipped,
      errors,
      recoveryRunId: runId
    };

  } catch (error: any) {
    console.error('[RECOVERY] EXCEPTION: Recovery failed:', error);
    console.error('[RECOVERY] ========== END STUCK PROVISIONING RECOVERY (EXCEPTION) ==========');
    
    // Mark recovery run as failed (ignore if update fails)
    try {
      await supabase
        .from('provisioning_recovery_runs')
        .update({
          finished_at: now.toISOString(),
          error: error.message || 'Unknown exception',
        })
        .eq('id', runId);
    } catch (updateError) {
      // Ignore error if update fails (run record may not exist)
      console.warn('[RECOVERY] Failed to mark recovery run as failed:', updateError);
    }
    
    return {
      success: false,
      recovered: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      recoveryRunId: runId
    };
  }
}

/**
 * Comprehensive Twilio Provisioning Service
 * 
 * This service implements the full provisioning + compliance workflow for ReplyFlowHQ
 * dedicated local numbers, including:
 * - Number purchase with status tracking
 * - A2P campaign registration with polling
 * - Messaging Service sender pool attachment
 * - Retry logic and error handling
 * - Comprehensive logging
 */

import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';
import { isSystemPhoneNumber } from './twilio-assignment';
import { triggerBackgroundReplenishment } from './warm-number-manager';

// Initialize Supabase client for DB operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

// Polling configuration
const POLL_INTERVAL_MS = 30000; // 30 seconds
const MAX_POLL_RETRIES = 20; // 20 retries = 10 minutes max

// Provisioning status types
export type ProvisioningStatus = 
  | 'purchasing' 
  | 'purchased' 
  | 'campaign_registering' 
  | 'campaign_registered' 
  | 'sender_pool_attaching' 
  | 'ready' 
  | 'failed';

export interface ProvisioningResult {
  success: boolean;
  phoneNumber?: string;
  phoneNumberSid?: string;
  error?: string;
  status?: ProvisioningStatus;
  fromWarmInventory?: boolean; // Flag to indicate if number came from warm inventory
}

/**
 * Check provisioning consistency between businesses and twilio_numbers tables
 */
async function checkProvisioningConsistency(
  businessId: string,
  phoneNumberSid: string,
  correlationId: string
): Promise<{ consistent: boolean; mismatchReason?: string; twilioNumber?: any }> {
  try {
    // Query businesses table
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      const error = 'Business not found';
      console.error('[TWILIO PROVISIONING] Consistency check failed:', error);
      return { consistent: false, mismatchReason: error };
    }

    // Query twilio_numbers table
    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status')
      .eq('twilio_sid', phoneNumberSid)
      .maybeSingle();

    // Check 1: twilio_numbers row must exist
    if (!twilioNumber) {
      console.error('[TWILIO PROVISIONING] twilio_numbers row not found:', { businessId, phoneNumberSid });
      return { consistent: false, mismatchReason: 'twilio_numbers row not found' };
    }

    // Check 2: phone_number must match
    if (business.twilio_phone_number !== twilioNumber.phone_number) {
      console.error('[TWILIO PROVISIONING] phone_number mismatch:', { businessId, phoneNumberSid });
      return { consistent: false, mismatchReason: 'phone_number mismatch between businesses and twilio_numbers' };
    }

    // Check 3: business_id must match
    if (businessId !== twilioNumber.business_id) {
      console.error('[TWILIO PROVISIONING] business_id mismatch:', { businessId, phoneNumberSid });
      return { consistent: false, mismatchReason: 'business_id mismatch between businesses and twilio_numbers' };
    }

    // Check 4: assigned_twilio_number_id must be set and match
    if (!business.assigned_twilio_number_id || business.assigned_twilio_number_id !== twilioNumber.id) {
      console.error('[TWILIO PROVISIONING] assigned_twilio_number_id mismatch:', { businessId, phoneNumberSid });
      return { consistent: false, mismatchReason: 'assigned_twilio_number_id not set or does not match twilio_numbers.id' };
    }

    // Check 5: status must be assigned/active, not available
    if (twilioNumber.status === 'available') {
      console.error('[TWILIO PROVISIONING] twilio_number status is available:', { businessId, phoneNumberSid });
      return { consistent: false, mismatchReason: 'twilio_number status is available, should be assigned/active' };
    }

    console.log('[TWILIO PROVISIONING] Consistency check passed:', { businessId, phoneNumberSid });

    return { consistent: true, twilioNumber };

  } catch (error: any) {
    console.error('[TWILIO PROVISIONING] Consistency check exception:', error);
    return { consistent: false, mismatchReason: error.message };
  }
}

/**
 * Reconcile missing twilio_numbers row for a business
 */
async function reconcileTwilioNumberRow(
  businessId: string,
  correlationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Query businesses table
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      const error = 'Business not found';
      console.error('[TWILIO PROVISIONING] Reconciliation failed:', error);
      return { success: false, error };
    }

    // Check if twilio_phone_number exists
    if (!business.twilio_phone_number || !business.twilio_phone_number_sid) {
      const error = 'Business has no twilio_phone_number or twilio_phone_number_sid';
      console.error('[TWILIO PROVISIONING] Reconciliation failed:', error);
      return { success: false, error };
    }
    
    // Check if twilio_numbers row already exists
    const { data: existingTwilioNumber, error: existingError } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('twilio_sid', business.twilio_phone_number_sid)
      .maybeSingle();
    
    if (existingTwilioNumber) {
      console.log('[RECONCILE TWILIO NUMBER] twilio_numbers row already exists:', existingTwilioNumber.id);
      
      // Update businesses table with assigned_twilio_number_id
      const { error: updateError } = await supabase
        .from('businesses')
        .update({ assigned_twilio_number_id: existingTwilioNumber.id })
        .eq('id', businessId);
      
      if (updateError) {
        console.error('[RECONCILE TWILIO NUMBER] Failed to update businesses:', updateError);
        return { success: false, error: 'Failed to update businesses table' };
      }

      // Self-heal: Update sms_status to 'ready' if it's stuck at 'pending' for an already-provisioned number
      console.log('[RECONCILE TWILIO NUMBER] Checking if sms_status needs repair for existing row');
      const { data: currentTwilioNumber, error: fetchError } = await supabase
        .from('twilio_numbers')
        .select('sms_status, provisioning_status, status')
        .eq('id', existingTwilioNumber.id)
        .single();

      if (!fetchError && currentTwilioNumber) {
        const needsRepair = 
          currentTwilioNumber.sms_status === 'pending' &&
          currentTwilioNumber.provisioning_status === 'ready' &&
          (currentTwilioNumber.status === 'active' || currentTwilioNumber.status === 'assigned');

        if (needsRepair) {
          console.log('[RECONCILE TWILIO NUMBER] Repairing sms_status from pending to ready for existing row');
          const { error: smsUpdateError } = await supabase
            .from('twilio_numbers')
            .update({ sms_status: 'ready' })
            .eq('id', existingTwilioNumber.id);

          if (smsUpdateError) {
            console.error('[RECONCILE TWILIO NUMBER] Failed to repair sms_status:', smsUpdateError);
          } else {
            console.log('[RECONCILE TWILIO NUMBER] ✓ sms_status repaired to ready');
          }
        } else {
          console.log('[RECONCILE TWILIO NUMBER] sms_status does not need repair:', {
            sms_status: currentTwilioNumber.sms_status,
            provisioning_status: currentTwilioNumber.provisioning_status,
            status: currentTwilioNumber.status
          });
        }
      }
      
      console.log('[RECONCILE TWILIO NUMBER] ✓ Reconciliation complete - linked existing row');
      return { success: true };
    }
    
    // Create twilio_numbers row
    console.log('[RECONCILE TWILIO NUMBER] Creating twilio_numbers row');
    const { data: insertedTwilioNumber, error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        business_id: businessId,
        phone_number: business.twilio_phone_number,
        twilio_sid: business.twilio_phone_number_sid,
        number_type: 'both',
        status: 'active',
        sms_status: 'ready',
        provisioning_status: 'ready',
        last_provisioning_attempt_at: new Date().toISOString(),
        assigned_at: new Date().toISOString(),
        campaign_registered_at: new Date().toISOString(),
        sender_pool_attached_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (insertError || !insertedTwilioNumber) {
      console.error('[RECONCILE TWILIO NUMBER] Failed to create twilio_numbers row:', insertError);
      return { success: false, error: 'Failed to create twilio_numbers row' };
    }
    
    console.log('[RECONCILE TWILIO NUMBER] twilio_numbers row created with ID:', insertedTwilioNumber.id);
    
    // Update businesses table with assigned_twilio_number_id
    console.log('[RECONCILE TWILIO NUMBER] Updating businesses table');
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ assigned_twilio_number_id: insertedTwilioNumber.id })
      .eq('id', businessId);
    
    if (updateError) {
      console.error('[RECONCILE TWILIO NUMBER] Failed to update businesses:', updateError);
      return { success: false, error: 'Failed to update businesses table' };
    }
    
    console.log('[RECONCILE TWILIO NUMBER] ✓ Reconciliation complete');
    console.log('[RECONCILE TWILIO NUMBER] ========== COMPLETE ==========');
    
    return { success: true };
    
  } catch (error: any) {
    console.error('[RECONCILE TWILIO NUMBER] Exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Main provisioning function - orchestrates the full workflow
 */
export async function provisionTwilioNumberWithCompliance(
  businessId: string,
  correlationId?: string
): Promise<ProvisioningResult> {
  const correlation = correlationId || `PROV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[PROVISIONING SERVICE] ========== START COMPREHENSIVE PROVISIONING ==========');
  console.log('[PROVISIONING SERVICE] correlation_id:', correlation);
  console.log('[PROVISIONING SERVICE] business_id:', businessId);
  console.log('[PROVISIONING SERVICE] Messaging Service SID:', messagingServiceSid);
  
  try {
    // STEP 1: Purchase number
    console.log('[PROVISIONING SERVICE] STEP 1: Purchasing number');
    const purchaseResult = await purchaseNumber(businessId, correlation);
    
    if (!purchaseResult.success || !purchaseResult.phoneNumber || !purchaseResult.phoneNumberSid) {
      console.error('[PROVISIONING SERVICE] Number purchase failed:', purchaseResult.error);
      return { success: false, error: purchaseResult.error };
    }
    
    console.log('[PROVISIONING SERVICE] Number purchased successfully:', purchaseResult.phoneNumber);
    
    // STEP 2: Register to A2P campaign
    console.log('[PROVISIONING SERVICE] STEP 2: Registering to A2P campaign');
    const campaignResult = await registerToA2PCampaign(
      purchaseResult.phoneNumberSid,
      businessId,
      correlation
    );
    
    if (!campaignResult.success) {
      console.error('[PROVISIONING SERVICE] A2P campaign registration failed:', campaignResult.error);
      // Don't fail immediately - continue to sender pool attachment
      console.log('[PROVISIONING SERVICE] Continuing with sender pool attachment despite campaign issue');
    }
    
    // STEP 3: Attach to Messaging Service sender pool
    console.log('[PROVISIONING SERVICE] STEP 3: Attaching to Messaging Service sender pool');
    const senderPoolResult = await attachToSenderPool(
      purchaseResult.phoneNumberSid,
      businessId,
      correlation
    );
    
    if (!senderPoolResult.success) {
      console.error('[PROVISIONING SERVICE] Sender pool attachment failed:', senderPoolResult.error);
      return { success: false, error: senderPoolResult.error };
    }
    
    // STEP 4: Mark as ready with consistency check
    console.log('[PROVISIONING SERVICE] STEP 4: Marking number as ready with consistency check');
    
    // Check consistency before marking as ready
    const consistencyCheck = await checkProvisioningConsistency(
      businessId,
      purchaseResult.phoneNumberSid,
      correlation
    );
    
    if (!consistencyCheck.consistent) {
      console.error('[PROVISIONING SERVICE] Consistency check failed:', consistencyCheck.mismatchReason);
      
      // Attempt reconciliation
      console.log('[PROVISIONING SERVICE] Attempting reconciliation');
      const reconciliationResult = await reconcileTwilioNumberRow(businessId, correlation);
      
      if (!reconciliationResult.success) {
        console.error('[PROVISIONING SERVICE] Reconciliation failed:', reconciliationResult.error);
        return { success: false, error: `Consistency check failed: ${consistencyCheck.mismatchReason}. Reconciliation failed: ${reconciliationResult.error}` };
      }
      
      console.log('[PROVISIONING SERVICE] Reconciliation successful, re-checking consistency');
      const recheck = await checkProvisioningConsistency(businessId, purchaseResult.phoneNumberSid, correlation);
      
      if (!recheck.consistent) {
        console.error('[PROVISIONING SERVICE] Consistency check still failed after reconciliation:', recheck.mismatchReason);
        return { success: false, error: `Consistency check failed after reconciliation: ${recheck.mismatchReason}` };
      }
      
      console.log('[PROVISIONING SERVICE] Consistency check passed after reconciliation');
    }
    
    await updateProvisioningStatus(
      businessId,
      purchaseResult.phoneNumberSid,
      'ready',
      null,
      correlation
    );
    
    console.log('[PROVISIONING SERVICE] ========== PROVISIONING COMPLETE ==========');
    console.log('[PROVISIONING SERVICE] Phone number:', purchaseResult.phoneNumber);
    console.log('[PROVISIONING SERVICE] Status: ready');
    
    return {
      success: true,
      phoneNumber: purchaseResult.phoneNumber,
      phoneNumberSid: purchaseResult.phoneNumberSid,
      status: 'ready'
    };
    
  } catch (error: any) {
    console.error('[PROVISIONING SERVICE] Provisioning failed with exception:', error);
    
    // Update status to failed
    await updateProvisioningStatus(
      businessId,
      null,
      'failed',
      error.message || 'Unknown error',
      correlation
    );
    
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * STEP 1: Purchase number and save to database
 */
async function purchaseNumber(
  businessId: string,
  correlationId: string
): Promise<ProvisioningResult> {
  console.log('[PURCHASE NUMBER] ========== START ==========');
  console.log('[PURCHASE NUMBER] correlation_id:', correlationId);
  console.log('[PURCHASE NUMBER] business_id:', businessId);
  
  if (!accountSid || !authToken) {
    const error = 'Twilio credentials missing';
    console.error('[PURCHASE NUMBER] ERROR:', error);
    return { success: false, error };
  }
  
  try {
    // Get business details for stable key matching
    const { data: business } = await supabase
      .from('businesses')
      .select('user_id, business_phone, stripe_customer_id')
      .eq('id', businessId)
      .single();

    // Check for reserved numbers using strong reclaim only (email + business phone)
    console.log('[PURCHASE NUMBER] Checking for reserved numbers using strong reclaim (email + business phone)');
    let reservedNumber: any = null;
    let reclaimReason: string = '';

    if (business) {
      // Only try exact match on email + business_phone (strong match only)
      if (business.user_id && business.business_phone) {
        const { data: user } = await supabase.auth.admin.getUserById(business.user_id);
        if (user && user.user && user.user.email) {
          const { data: reservedByPhoneAndEmail } = await supabase
            .from('twilio_numbers')
            .select('*')
            .eq('status', 'reserved')
            .eq('reserved_owner_email', user.user.email)
            .eq('reserved_business_phone', business.business_phone)
            .gt('reserved_expires_at', new Date().toISOString())
            .limit(1)
            .maybeSingle();

          if (reservedByPhoneAndEmail) {
            reservedNumber = reservedByPhoneAndEmail;
            reclaimReason = 'strong_reclaim_email_and_business_phone_match';
            console.log('[PURCHASE NUMBER] STRONG RECLAIM: Found reserved number by email + business phone match', {
              email: user.user.email,
              businessPhone: business.business_phone,
              phoneNumber: reservedNumber.phone_number,
              reserved_expires_at: reservedNumber.reserved_expires_at,
            });
          } else {
            console.log('[PURCHASE NUMBER] No strong reclaim match found (email + business phone)', {
              email: user.user.email,
              businessPhone: business.business_phone,
            });
          }
        }
      }

      // Check for weak reclaim candidates (log only, don't auto-assign)
      if (!reservedNumber && business.user_id) {
        const { data: user } = await supabase.auth.admin.getUserById(business.user_id);
        if (user && user.user && user.user.email) {
          const { data: reservedByEmail } = await supabase
            .from('twilio_numbers')
            .select('phone_number, reserved_business_phone, reserved_expires_at')
            .eq('status', 'reserved')
            .eq('reserved_owner_email', user.user.email)
            .gt('reserved_expires_at', new Date().toISOString())
            .limit(1)
            .maybeSingle();

          if (reservedByEmail) {
            console.log('[PURCHASE NUMBER] WEAK RECLAIM CANDIDATE: Found reserved number by email only (skipping auto-assignment)', {
              email: user.user.email,
              phoneNumber: reservedByEmail.phone_number,
              reservedBusinessPhone: reservedByEmail.reserved_business_phone,
              currentBusinessPhone: business.business_phone,
              reason: 'Business phone mismatch - requires manual review',
            });
          }
        }
      }

      if (!reservedNumber && business.stripe_customer_id) {
        const { data: reservedByStripe } = await supabase
          .from('twilio_numbers')
          .select('phone_number, reserved_owner_email, reserved_business_phone, reserved_expires_at')
          .eq('status', 'reserved')
          .eq('reserved_stripe_customer_id', business.stripe_customer_id)
          .gt('reserved_expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();

        if (reservedByStripe) {
          console.log('[PURCHASE NUMBER] WEAK RECLAIM CANDIDATE: Found reserved number by Stripe customer ID only (skipping auto-assignment)', {
            stripeCustomerId: business.stripe_customer_id,
            phoneNumber: reservedByStripe.phone_number,
            reservedOwnerEmail: reservedByStripe.reserved_owner_email,
            reservedBusinessPhone: reservedByStripe.reserved_business_phone,
            reason: 'Email and business phone mismatch - requires manual review',
          });
        }
      }
    }

    if (reservedNumber) {
      console.log('[PURCHASE NUMBER] Reclaiming reserved number for returning customer (strong match)', {
        phoneNumber: reservedNumber.phone_number,
        reclaimReason,
        previousBusinessId: reservedNumber.reserved_for_business_id,
        previousEmail: reservedNumber.reserved_owner_email,
        previousBusinessPhone: reservedNumber.reserved_business_phone,
      });

      // Reclaim the reserved number for the business
      const { error: reclaimError } = await supabase
        .from('twilio_numbers')
        .update({
          business_id: businessId,
          status: 'active',
          assigned_at: new Date().toISOString(),
          reserved_for_business_id: null,
          reserved_at: null,
          reserved_expires_at: null,
          reservation_reason: null,
          reserved_owner_email: null,
          reserved_business_phone: null,
          reserved_stripe_customer_id: null,
          reserved_user_id: null,
          detached_at: null,
          detached_reason: null,
        })
        .eq('id', reservedNumber.id);

      if (reclaimError) {
        console.error('[PURCHASE NUMBER] Failed to reclaim reserved number:', reclaimError);
        return { success: false, error: 'Failed to reclaim reserved number' };
      }

      // Update businesses table
      const { error: updateError } = await supabase
        .from('businesses')
        .update({
          twilio_phone_number: reservedNumber.phone_number,
          twilio_phone_number_sid: reservedNumber.twilio_sid,
          assigned_twilio_number_id: reservedNumber.id,
          twilio_messaging_service_sid: messagingServiceSid,
          provisioning_status: 'ready',
          provisioning_error: null,
          last_provisioning_attempt_at: new Date().toISOString(),
          provisioned_at: new Date().toISOString(),
        })
        .eq('id', businessId);

      if (updateError) {
        console.error('[PURCHASE NUMBER] Failed to update business:', updateError);
        return { success: false, error: 'Failed to update business record' };
      }

      console.log('[PURCHASE NUMBER] Reclaimed reserved number successfully', {
        phoneNumber: reservedNumber.phone_number,
        phoneNumberSid: reservedNumber.twilio_sid,
        reclaimReason,
      });

      return {
        success: true,
        phoneNumber: reservedNumber.phone_number,
        phoneNumberSid: reservedNumber.twilio_sid,
        status: 'ready'
      };
    }

    // No strong reclaim found, continue with normal flow
    console.log('[PURCHASE NUMBER] No strong reclaim found, continuing with normal provisioning flow');

    // Next, check for available numbers in inventory (excluding reserved and system phone)
    console.log('[PURCHASE NUMBER] Checking for available numbers in inventory');
    const { data: availableNumber, error: availableError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('status', 'available')
      .is('business_id', null)
      .limit(1)
      .maybeSingle();

    if (availableNumber && !availableError) {
      // Protect against assigning the dedicated system phone
      if (isSystemPhoneNumber(availableNumber.phone_number)) {
        console.log('[SYSTEM PHONE] Skipping dedicated system number during inventory scan:', availableNumber.phone_number);
        console.log('[PURCHASE NUMBER] System phone found in inventory, skipping and purchasing new number instead');
      } else {
        console.log('[PURCHASE NUMBER] Found available number in inventory:', availableNumber.phone_number);
        console.log('[PURCHASE NUMBER] Assigning existing number to business instead of purchasing new');

        // Assign the available number to the business
        const { error: assignError } = await supabase
          .from('twilio_numbers')
          .update({
            business_id: businessId,
            status: 'active',
            assigned_at: new Date().toISOString(),
            detached_at: null,
            detached_reason: null,
          })
          .eq('id', availableNumber.id);

        if (assignError) {
          console.error('[PURCHASE NUMBER] Failed to assign available number:', assignError);
          return { success: false, error: 'Failed to assign available number' };
        }

        // Update businesses table
        const { error: updateError } = await supabase
          .from('businesses')
          .update({
            twilio_phone_number: availableNumber.phone_number,
            twilio_phone_number_sid: availableNumber.twilio_sid,
            assigned_twilio_number_id: availableNumber.id,
            twilio_messaging_service_sid: messagingServiceSid,
            provisioning_status: 'ready',
            provisioning_error: null,
            last_provisioning_attempt_at: new Date().toISOString(),
            provisioned_at: new Date().toISOString(),
          })
          .eq('id', businessId);

        if (updateError) {
          console.error('[PURCHASE NUMBER] Failed to update business:', updateError);
          return { success: false, error: 'Failed to update business record' };
        }

        console.log('[PURCHASE NUMBER] Assigned available number successfully', {
          phoneNumber: availableNumber.phone_number,
          phoneNumberSid: availableNumber.twilio_sid,
        });

        // Trigger background replenishment to maintain inventory
        console.log('[PURCHASE NUMBER] Triggering background replenishment to maintain inventory');
        triggerBackgroundReplenishment();

        return {
          success: true,
          phoneNumber: availableNumber.phone_number,
          phoneNumberSid: availableNumber.twilio_sid,
          status: 'ready',
          fromWarmInventory: true // Flag to indicate this came from warm inventory
        };
      }
    }

    // No available numbers in inventory, purchase new from Twilio
    console.log('[PURCHASE NUMBER] No available numbers in inventory, purchasing new from Twilio');

    const client = Twilio(accountSid, authToken);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.replyflowhq.com';

    console.log('[PURCHASE NUMBER] Using appUrl:', appUrl);

    // Search for available US local numbers
    console.log('[PURCHASE NUMBER] Searching for available local numbers');
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        voiceEnabled: true,
        smsEnabled: true,
        limit: 1,
      });

    if (!availableNumbers || availableNumbers.length === 0) {
      const error = 'No available local numbers found';
      console.error('[PURCHASE NUMBER] ERROR:', error);
      return { success: false, error };
    }

    const numberToPurchase = availableNumbers[0];
    console.log('[PURCHASE NUMBER] Selected number:', numberToPurchase.phoneNumber);

    // Purchase the number with webhook URLs
    console.log('[PURCHASE NUMBER] Purchasing number');
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: `${appUrl}/api/twilio/voice`,
      voiceMethod: 'POST',
      statusCallback: `${appUrl}/api/twilio/voice-status`,
      statusCallbackMethod: 'POST',
      smsUrl: `${appUrl}/api/twilio/incoming-sms`,
      smsMethod: 'POST',
    });

    console.log('[PURCHASE NUMBER] Purchased successfully');
    console.log('[PURCHASE NUMBER] Phone number:', purchasedNumber.phoneNumber);
    console.log('[PURCHASE NUMBER] SID:', purchasedNumber.sid);
    
    // Save to twilio_numbers table
    console.log('[PURCHASE NUMBER] Saving to database');
    const { data: insertedTwilioNumber, error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        business_id: businessId,
        phone_number: purchasedNumber.phoneNumber,
        twilio_sid: purchasedNumber.sid,
        number_type: 'both',
        status: 'active',
        sms_status: 'pending',
        provisioning_status: 'purchased',
        last_provisioning_attempt_at: new Date().toISOString(),
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('[PURCHASE NUMBER] Database insert failed:', insertError);
      // Release the number if DB insert fails
      try {
        await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
        console.log('[PURCHASE NUMBER] Released number due to DB insert failure');
      } catch (releaseError) {
        console.error('[PURCHASE NUMBER] Failed to release number:', releaseError);
      }
      return { success: false, error: 'Failed to save number to database' };
    }
    
    console.log('[PURCHASE NUMBER] twilio_numbers row inserted with ID:', insertedTwilioNumber.id);
    
    // Update businesses table with assigned_twilio_number_id
    console.log('[PURCHASE NUMBER] Updating businesses table');
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        twilio_phone_number: purchasedNumber.phoneNumber,
        twilio_phone_number_sid: purchasedNumber.sid,
        assigned_twilio_number_id: insertedTwilioNumber.id,
        twilio_messaging_service_sid: messagingServiceSid,
        provisioning_status: 'ready',
        provisioning_error: null,
        last_provisioning_attempt_at: new Date().toISOString(),
        provisioned_at: new Date().toISOString(),
      })
      .eq('id', businessId);
    
    if (updateError) {
      console.error('[PURCHASE NUMBER] Business update failed:', updateError);
      return { success: false, error: 'Failed to update business record' };
    }
    
    console.log('[PROVISIONING STATUS] Business provisioned successfully', {
      businessId,
      phoneNumber: purchasedNumber.phoneNumber,
      phoneNumberSid: purchasedNumber.sid,
      messagingServiceSid,
      provisioning_status: 'ready',
      provisioned_at: new Date().toISOString()
    });
    
    console.log('[PURCHASE NUMBER] ========== COMPLETE ==========');
    
    // Trigger background replenishment to maintain warm pool after new purchase
    console.log('[PURCHASE NUMBER] Triggering background replenishment after new purchase');
    triggerBackgroundReplenishment();
    
    return {
      success: true,
      phoneNumber: purchasedNumber.phoneNumber,
      phoneNumberSid: purchasedNumber.sid,
      status: 'purchased'
    };
    
  } catch (error: any) {
    console.error('[PURCHASE NUMBER] Exception:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during number purchase'
    };
  }
}

/**
 * STEP 2: Register number to A2P campaign with polling
 */
async function registerToA2PCampaign(
  phoneNumberSid: string,
  businessId: string,
  correlationId: string
): Promise<ProvisioningResult> {
  console.log('[A2P CAMPAIGN] ========== START REGISTRATION ==========');
  console.log('[A2P CAMPAIGN] correlation_id:', correlationId);
  console.log('[A2P CAMPAIGN] phone_number_sid:', phoneNumberSid);
  console.log('[A2P CAMPAIGN] messaging_service_sid:', messagingServiceSid);
  
  if (!messagingServiceSid) {
    console.log('[A2P CAMPAIGN] No Messaging Service SID configured, skipping campaign registration');
    return { success: true }; // Not applicable
  }
  
  if (!accountSid || !authToken) {
    const error = 'Twilio credentials missing';
    console.error('[A2P CAMPAIGN] ERROR:', error);
    return { success: false, error };
  }
  
  try {
    const client = Twilio(accountSid, authToken);
    
    // Update status to campaign_registering
    await updateProvisioningStatus(businessId, phoneNumberSid, 'campaign_registering', null, correlationId);
    
    // Check if number is already registered to the campaign
    console.log('[A2P CAMPAIGN] Checking current campaign registration status');
    const phoneNumber = await client.incomingPhoneNumbers(phoneNumberSid).fetch();
    
    console.log('[A2P CAMPAIGN] Current phone number status:', phoneNumber.status);
    console.log('[A2P CAMPAIGN] Current capabilities:', phoneNumber.capabilities);
    
    // For A2P 10DLC, the number should be registered through the Messaging Service
    // Check if the number is associated with the Messaging Service
    console.log('[A2P CAMPAIGN] Checking Messaging Service association');
    
    try {
      const servicePhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 });
      
      const isInService = servicePhoneNumbers.some(pn => pn.sid === phoneNumberSid);
      
      if (isInService) {
        console.log('[A2P CAMPAIGN] Number is in Messaging Service - campaign registration assumed complete');
        
        // Poll to verify the status is 'in-use' or similar indicating readiness
        console.log('[A2P CAMPAIGN] Polling for campaign registration confirmation');
        const pollResult = await pollCampaignRegistrationStatus(client, phoneNumberSid, correlationId);
        
        if (pollResult.success) {
          await updateProvisioningStatus(
            businessId,
            phoneNumberSid,
            'campaign_registered',
            null,
            correlationId,
            true // campaign_registered_at
          );
          
          console.log('[A2P CAMPAIGN] ========== REGISTRATION COMPLETE ==========');
          return { success: true };
        } else {
          console.error('[A2P CAMPAIGN] Polling failed:', pollResult.error);
          await updateProvisioningStatus(
            businessId,
            phoneNumberSid,
            'campaign_registered',
            pollResult.error || null,
            correlationId,
            true // campaign_registered_at (mark as complete despite warning)
          );
          return { success: true, error: pollResult.error }; // Continue despite polling issue
        }
      } else {
        console.log('[A2P CAMPAIGN] Number not in Messaging Service - will be attached in sender pool step');
        return { success: true }; // Will handle in sender pool attachment
      }
    } catch (serviceCheckError: any) {
      console.error('[A2P CAMPAIGN] Error checking Messaging Service:', serviceCheckError);
      return { success: true, error: 'Failed to check Messaging Service association' };
    }
    
  } catch (error: any) {
    console.error('[A2P CAMPAIGN] Exception:', error);
    await updateProvisioningStatus(businessId, phoneNumberSid, 'failed', error.message, correlationId);
    return { success: false, error: error.message };
  }
}

/**
 * Poll for campaign registration status
 */
async function pollCampaignRegistrationStatus(
  client: Twilio.Twilio,
  phoneNumberSid: string,
  correlationId: string,
  retryCount: number = 0
): Promise<ProvisioningResult> {
  console.log('[A2P POLL] ========== POLL ATTEMPT', retryCount + 1, '==========');
  console.log('[A2P POLL] correlation_id:', correlationId);
  console.log('[A2P POLL] phone_number_sid:', phoneNumberSid);
  
  if (retryCount >= MAX_POLL_RETRIES) {
    const error = `Max polling retries (${MAX_POLL_RETRIES}) reached`;
    console.error('[A2P POLL] ERROR:', error);
    return { success: false, error };
  }
  
  try {
    const phoneNumber = await client.incomingPhoneNumbers(phoneNumberSid).fetch();
    
    console.log('[A2P POLL] Current status:', phoneNumber.status);
    console.log('[A2P POLL] Capabilities:', phoneNumber.capabilities);
    
    // Check if number is ready for SMS (status should be 'in-use' or similar)
    const readyStatuses = ['in-use', 'active', 'unregistered'];
    if (readyStatuses.includes(phoneNumber.status.toLowerCase())) {
      console.log('[A2P POLL] Number is ready for use');
      return { success: true };
    }
    
    // Wait and retry
    console.log('[A2P POLL] Number not ready yet, waiting', POLL_INTERVAL_MS, 'ms');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    
    return pollCampaignRegistrationStatus(client, phoneNumberSid, correlationId, retryCount + 1);
    
  } catch (error: any) {
    console.error('[A2P POLL] Exception during poll:', error);
    
    // Wait and retry on transient errors
    if (error.code === 20429 || error.status === 429) {
      console.log('[A2P POLL] Rate limited, waiting and retrying');
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      return pollCampaignRegistrationStatus(client, phoneNumberSid, correlationId, retryCount + 1);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * STEP 3: Attach number to Messaging Service sender pool
 */
async function attachToSenderPool(
  phoneNumberSid: string,
  businessId: string,
  correlationId: string
): Promise<ProvisioningResult> {
  console.log('[SENDER POOL] ========== START ATTACHMENT ==========');
  console.log('[SENDER POOL] correlation_id:', correlationId);
  console.log('[SENDER POOL] phone_number_sid:', phoneNumberSid);
  console.log('[SENDER POOL] messaging_service_sid:', messagingServiceSid);
  
  if (!messagingServiceSid) {
    console.log('[SENDER POOL] No Messaging Service SID configured, skipping attachment');
    return { success: true }; // Not applicable
  }
  
  if (!accountSid || !authToken) {
    const error = 'Twilio credentials missing';
    console.error('[SENDER POOL] ERROR:', error);
    return { success: false, error };
  }
  
  try {
    const client = Twilio(accountSid, authToken);
    
    // Update status to sender_pool_attaching
    await updateProvisioningStatus(businessId, phoneNumberSid, 'sender_pool_attaching', null, correlationId);
    
    // Check if already attached
    console.log('[SENDER POOL] Checking if number is already in sender pool');
    const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 });
    
    const alreadyAttached = existingPhoneNumbers.some(pn => pn.sid === phoneNumberSid);
    
    if (alreadyAttached) {
      console.log('[SENDER POOL] Number already attached to sender pool');
      await updateProvisioningStatus(
        businessId,
        phoneNumberSid,
        'sender_pool_attaching',
        null,
        correlationId,
        false,
        true // sender_pool_attached_at
      );
      return { success: true };
    }
    
    // Attach the number
    console.log('[SENDER POOL] Attaching number to sender pool');
    const attachedSender = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .create({
        phoneNumberSid: phoneNumberSid
      });
    
    console.log('[SENDER POOL] Attached successfully');
    console.log('[SENDER POOL] Attached SID:', attachedSender.sid);
    
    // Verify attachment
    console.log('[SENDER POOL] Verifying attachment');
    const updatedPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 });
    
    const isAttached = updatedPhoneNumbers.some(pn => pn.sid === phoneNumberSid);
    
    if (!isAttached) {
      const error = 'Attachment verification failed - number not found in sender pool';
      console.error('[SENDER POOL] ERROR:', error);
      await updateProvisioningStatus(businessId, phoneNumberSid, 'failed', error, correlationId);
      return { success: false, error };
    }
    
    console.log('[SENDER POOL] ========== ATTACHMENT COMPLETE ==========');
    await updateProvisioningStatus(
      businessId,
      phoneNumberSid,
      'sender_pool_attaching',
      null,
      correlationId,
      false,
      true // sender_pool_attached_at
    );
    
    return { success: true };
    
  } catch (error: any) {
    console.error('[SENDER POOL] Exception:', error);
    await updateProvisioningStatus(businessId, phoneNumberSid, 'failed', error.message, correlationId);
    return { success: false, error: error.message };
  }
}

/**
 * Update provisioning status in database
 */
async function updateProvisioningStatus(
  businessId: string,
  phoneNumberSid: string | null,
  status: ProvisioningStatus,
  error: string | null,
  correlationId: string,
  setCampaignRegisteredAt: boolean = false,
  setSenderPoolAttachedAt: boolean = false
): Promise<void> {
  console.log('[UPDATE STATUS] ========== START ==========');
  console.log('[UPDATE STATUS] correlation_id:', correlationId);
  console.log('[UPDATE STATUS] business_id:', businessId);
  console.log('[UPDATE STATUS] phone_number_sid:', phoneNumberSid);
  console.log('[UPDATE STATUS] status:', status);
  console.log('[UPDATE STATUS] error:', error);
  
  try {
    // Only update twilio_numbers table for provisioning fields
    if (phoneNumberSid) {
      const updateData: any = {
        provisioning_status: status,
        last_provisioning_attempt_at: new Date().toISOString(),
      };

      if (error) {
        updateData.provisioning_error = error;
      } else {
        updateData.provisioning_error = null;
      }

      if (setCampaignRegisteredAt) {
        updateData.campaign_registered_at = new Date().toISOString();
      }

      if (setSenderPoolAttachedAt) {
        updateData.sender_pool_attached_at = new Date().toISOString();
      }

      // Transition sms_status to ready when provisioning is complete
      if (status === 'ready') {
        updateData.sms_status = 'ready';
        console.log('[UPDATE STATUS] Transitioning sms_status to ready');
      }

      console.log('[UPDATE STATUS] Updating twilio_numbers table with data:', updateData);
      
      const { error: twilioError } = await supabase
        .from('twilio_numbers')
        .update(updateData)
        .eq('twilio_sid', phoneNumberSid as string);
      
      if (twilioError) {
        console.error('[UPDATE STATUS] Failed to update twilio_numbers:', twilioError);
      } else {
        console.log('[UPDATE STATUS] Updated twilio_numbers successfully');
      }
    } else {
      console.error('[UPDATE STATUS] No phone number SID provided, cannot update');
    }
    
    console.log('[UPDATE STATUS] ========== COMPLETE ==========');
    
  } catch (error: any) {
    console.error('[UPDATE STATUS] Exception:', error);
  }
}

/**
 * Check if a number is ready for use (fail-safe check)
 */
export async function isNumberReadyForUse(businessId: string): Promise<boolean> {
  try {
    console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK START =====')
    console.log('[FAIL-SAFE] Business ID:', businessId)

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('twilio_phone_number_sid, twilio_phone_number, provisioning_status')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      console.error('[FAIL-SAFE] Business not found:', businessId);
      console.error('[FAIL-SAFE] Business lookup error:', businessError);
      console.log('[FAIL-SAFE FAILED because BUSINESS_NOT_FOUND]', { businessId, businessError });
      return false;
    }

    console.log('[FAIL-SAFE] Business lookup successful');
    console.log('[FAIL-SAFE] Business phone SID:', business.twilio_phone_number_sid);
    console.log('[FAIL-SAFE] Business phone number:', business.twilio_phone_number);
    console.log('[FAIL-SAFE] Business provisioning_status:', business.provisioning_status);

    if (!business.twilio_phone_number_sid || !business.twilio_phone_number) {
      console.error('[FAIL-SAFE] Missing business Twilio number fields');
      console.log('[FAIL-SAFE FAILED because MISSING_BUSINESS_TWILIO_FIELDS]', { businessId, hasPhoneSid: !!business.twilio_phone_number_sid, hasPhoneNumber: !!business.twilio_phone_number });
      return false;
    }

    console.log('[FAIL-SAFE] ===== TWILIO_NUMBERS LOOKUP =====')
    console.log('[FAIL-SAFE] Lookup criteria: twilio_sid =', business.twilio_phone_number_sid);

    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status, sms_status, provisioning_status, campaign_registered_at, sender_pool_attached_at, detached_at, detached_reason, last_error')
      .eq('twilio_sid', business.twilio_phone_number_sid)
      .maybeSingle();

    console.log('[FAIL-SAFE] twilio_numbers lookup result:', { twilioNumber, twilioError });

    if (twilioError || !twilioNumber) {
      console.error('[FAIL-SAFE] Twilio number not found in twilio_numbers table');
      console.log('[FAIL-SAFE FAILED because TWILIO_NUMBER_ROW_MISSING]', { businessId, twilioError });
      return false;
    }

    const assignedOrActive = twilioNumber.status === 'assigned' || twilioNumber.status === 'active';
    if (!assignedOrActive) {
      console.log('[FAIL-SAFE FAILED because NUMBER_STATUS_NOT_ASSIGNED_OR_ACTIVE]', { businessId, status: twilioNumber.status });
      return false;
    }

    // Self-heal: If sms_status is 'pending' but all other conditions indicate readiness, auto-repair
    if (twilioNumber.sms_status !== 'ready') {
      console.log('[FAIL-SAFE] SMS_STATUS_NOT_READY - checking for self-heal conditions');
      console.log('[FAIL-SAFE] Current sms_status:', twilioNumber.sms_status);
      console.log('[FAIL-SAFE] Number status:', twilioNumber.status);
      console.log('[FAIL-SAFE] Number provisioning_status:', twilioNumber.provisioning_status);
      console.log('[FAIL-SAFE] Business provisioning_status:', business.provisioning_status);

      // Self-heal conditions: number is active/assigned, provisioning is ready, business provisioning is completed
      const canSelfHeal = 
        assignedOrActive &&
        twilioNumber.provisioning_status === 'ready' &&
        business.provisioning_status === 'completed';

      if (canSelfHeal) {
        console.log('[FAIL-SAFE SELF-HEAL] =========================================');
        console.log('[FAIL-SAFE SELF-HEAL] Auto-repairing sms_status from pending to ready');
        console.log('[FAIL-SAFE SELF-HEAL] businessId:', businessId);
        console.log('[FAIL-SAFE SELF-HEAL] twilioNumber.id:', twilioNumber.id);
        console.log('[FAIL-SAFE SELF-HEAL] twilio_sid:', twilioNumber.twilio_sid);
        console.log('[FAIL-SAFE SELF-HEAL] phone_number:', twilioNumber.phone_number);
        console.log('[FAIL-SAFE SELF-HEAL] Timestamp:', new Date().toISOString());
        console.log('[FAIL-SAFE SELF-HEAL] =========================================');

        // Update sms_status to 'ready'
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({ sms_status: 'ready' })
          .eq('id', twilioNumber.id);

        if (updateError) {
          console.error('[FAIL-SAFE SELF-HEAL FAILED] =========================================');
          console.error('[FAIL-SAFE SELF-HEAL FAILED] Failed to update sms_status');
          console.error('[FAIL-SAFE SELF-HEAL FAILED] Error:', updateError);
          console.error('[FAIL-SAFE SELF-HEAL FAILED] Timestamp:', new Date().toISOString());
          console.error('[FAIL-SAFE SELF-HEAL FAILED] =========================================');
          console.log('[FAIL-SAFE FAILED because SELF_HEAL_UPDATE_FAILED]', { businessId, updateError });
          return false;
        }

        console.log('[FAIL-SAFE SELF-HEAL SUCCESS] =========================================');
        console.log('[FAIL-SAFE SELF-HEAL SUCCESS] sms_status updated to ready');
        console.log('[FAIL-SAFE SELF-HEAL SUCCESS] Continuing with SMS dispatch');
        console.log('[FAIL-SAFE SELF-HEAL SUCCESS] Timestamp:', new Date().toISOString());
        console.log('[FAIL-SAFE SELF-HEAL SUCCESS] =========================================');
        
        // Update local variable to reflect the change
        twilioNumber.sms_status = 'ready';
      } else {
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] =========================================');
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] Cannot self-heal - conditions not met');
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] assignedOrActive:', assignedOrActive);
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] provisioning_status ready:', twilioNumber.provisioning_status === 'ready');
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] business provisioning completed:', business.provisioning_status === 'completed');
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] Timestamp:', new Date().toISOString());
        console.log('[FAIL-SAFE SELF-HEAL SKIPPED] =========================================');
        console.log('[FAIL-SAFE FAILED because SMS_STATUS_NOT_READY_NO_SELF_HEAL]', { businessId, sms_status: twilioNumber.sms_status });
        return false;
      }
    }

    if (twilioNumber.detached_at || twilioNumber.detached_reason) {
      console.log('[FAIL-SAFE FAILED because NUMBER_DETACHED]', { businessId, detached_at: twilioNumber.detached_at, detached_reason: twilioNumber.detached_reason });
      return false;
    }

    const client = Twilio(accountSid, authToken);

    try {
      await client.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch();
      console.log('[FAIL-SAFE] ✓ Twilio ownership verified');
    } catch (ownershipError: any) {
      console.error('[FAIL-SAFE] Twilio ownership verification failed:', ownershipError);
      console.log('[FAIL-SAFE FAILED because TWILIO_OWNERSHIP_VERIFICATION_FAILED]', { businessId, status: ownershipError?.status, code: ownershipError?.code, message: ownershipError?.message });
      return false;
    }

    let senderPoolVerified = false;
    if (messagingServiceSid) {
      try {
        const senderPool = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });

        senderPoolVerified = senderPool.some(pn => pn.sid === business.twilio_phone_number_sid);

        if (!senderPoolVerified) {
          console.error('[FAIL-SAFE] Number not in sender pool');
          console.log('[FAIL-SAFE FAILED because NUMBER_NOT_IN_SENDER_POOL]', { businessId, business_twilio_phone_number_sid: business.twilio_phone_number_sid, messagingServiceSid });
          return false;
        }

        console.log('[FAIL-SAFE] ✓ Number verified in sender pool');
      } catch (poolError) {
        console.error('[FAIL-SAFE] Failed to verify sender pool:', poolError);
        console.log('[FAIL-SAFE FAILED because SENDER_POOL_VERIFICATION_EXCEPTION]', { businessId, error: poolError instanceof Error ? poolError.message : String(poolError), stack: poolError instanceof Error ? poolError.stack : undefined });
        return false;
      }
    }

    const updateData: any = {};
    if (senderPoolVerified && !twilioNumber.sender_pool_attached_at) {
      updateData.sender_pool_attached_at = new Date().toISOString();
    }
    if (twilioNumber.provisioning_status !== 'ready') {
      updateData.provisioning_status = 'ready';
      updateData.provisioning_error = null;
      updateData.last_provisioning_attempt_at = new Date().toISOString();
    }
    if (twilioNumber.status === 'assigned' && twilioNumber.sms_status === 'ready' && twilioNumber.provisioning_status === 'purchasing') {
      console.log('[FAIL-SAFE] Self-healing impossible assigned+ready+purchasing state');
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();
      const { error: healError } = await supabase
        .from('twilio_numbers')
        .update(updateData)
        .eq('id', twilioNumber.id);

      if (healError) {
        console.error('[FAIL-SAFE] Self-heal update failed:', healError);
      } else {
        console.log('[FAIL-SAFE] Self-healed twilio_numbers readiness fields:', updateData);
      }
    }

    console.log('[FAIL-SAFE] ✓ Number is ready for use');
    console.log('[FAIL-SAFE] ✓ SMS ALLOWED - twilio_api_called will be true');
    console.log('[FAIL-SAFE PASSED]', {
      businessId,
      status: twilioNumber.status,
      sms_status: twilioNumber.sms_status,
      previous_provisioning_status: twilioNumber.provisioning_status,
      senderPoolVerified,
      messagingServiceSidPresent: !!messagingServiceSid
    });
    console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
    return true;
  } catch (error: any) {
    console.error('[FAIL-SAFE] Exception during ready check:', error);
    console.log('[FAIL-SAFE FAILED because UNHANDLED_EXCEPTION]', { businessId, message: error?.message, stack: error?.stack, raw: error });
    console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
    return false;
  }
}

/**
 * Retry provisioning from failed step
 */
export async function retryProvisioning(
  businessId: string,
  correlationId?: string
): Promise<ProvisioningResult> {
  const correlation = correlationId || `RETRY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[RETRY PROVISIONING] ========== START ==========');
  console.log('[RETRY PROVISIONING] correlation_id:', correlation);
  console.log('[RETRY PROVISIONING] business_id:', businessId);
  
  try {
    // Query businesses table for business fields only
    console.log('[RETRY PROVISIONING] Querying businesses table for business_id:', businessId);
    
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();
    
    if (businessError) {
      console.error('[RETRY PROVISIONING] Business query error:', businessError);
      return { success: false, error: `Business query failed: ${businessError.message}` };
    }
    
    if (!business) {
      console.error('[RETRY PROVISIONING] Business not found in businesses table');
      return { success: false, error: 'Business not found' };
    }
    
    console.log('[RETRY PROVISIONING] Business found in businesses table:', business.name);
    console.log('[RETRY PROVISIONING] Phone number:', business.twilio_phone_number);
    console.log('[RETRY PROVISIONING] Phone SID:', business.twilio_phone_number_sid);
    
    // If no number purchased, start fresh
    if (!business.twilio_phone_number_sid) {
      console.log('[RETRY PROVISIONING] No number purchased, starting fresh');
      return provisionTwilioNumberWithCompliance(businessId, correlation);
    }
    
    // Query twilio_numbers table for provisioning fields
    console.log('[RETRY PROVISIONING] Querying twilio_numbers table for phone SID:', business.twilio_phone_number_sid);
    
    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('provisioning_status, provisioning_error, last_provisioning_attempt_at, campaign_registered_at, sender_pool_attached_at, a2p_campaign_sid')
      .eq('twilio_sid', business.twilio_phone_number_sid)
      .single();
    
    let twilioNumberData = twilioNumber;
    
    if (twilioError) {
      console.error('[RETRY PROVISIONING] Twilio number query error:', twilioError);
      // Try to create twilio_numbers row if it doesn't exist
      console.log('[RETRY PROVISIONING] Creating twilio_numbers row for business');
      
      const { error: insertError } = await supabase
        .from('twilio_numbers')
        .insert({
          business_id: businessId,
          phone_number: business.twilio_phone_number,
          twilio_sid: business.twilio_phone_number_sid,
          number_type: 'both',
          status: 'active',
          sms_status: 'pending',
          provisioning_status: 'purchased',
          last_provisioning_attempt_at: new Date().toISOString(),
          assigned_at: new Date().toISOString(),
        });
      
      if (insertError) {
        console.error('[RETRY PROVISIONING] Failed to create twilio_numbers row:', insertError);
        return { success: false, error: `Failed to create twilio_numbers row: ${insertError.message}` };
      }
      
      // Query again after creation
      const { data: newTwilioNumber, error: newError } = await supabase
        .from('twilio_numbers')
        .select('provisioning_status, provisioning_error, last_provisioning_attempt_at, campaign_registered_at, sender_pool_attached_at, a2p_campaign_sid')
        .eq('twilio_sid', business.twilio_phone_number_sid)
        .single();
      
      if (newError || !newTwilioNumber) {
        return { success: false, error: 'Failed to query twilio_numbers after creation' };
      }
      
      console.log('[RETRY PROVISIONING] twilio_numbers row created successfully');
      twilioNumberData = newTwilioNumber;
    }
    
    if (!twilioNumberData) {
      console.error('[RETRY PROVISIONING] Twilio number not found in twilio_numbers table');
      return { success: false, error: 'Twilio number not found' };
    }
    
    console.log('[RETRY PROVISIONING] Twilio number found in twilio_numbers table');
    console.log('[RETRY PROVISIONING] Provisioning status from twilio_numbers:', twilioNumberData.provisioning_status);
    console.log('[RETRY PROVISIONING] campaign_registered_at:', twilioNumberData.campaign_registered_at);
    console.log('[RETRY PROVISIONING] sender_pool_attached_at:', twilioNumberData.sender_pool_attached_at);
    
    // Check if truly ready (all conditions must pass)
    const isTrulyReady = 
      twilioNumberData.provisioning_status === 'ready' &&
      twilioNumberData.campaign_registered_at !== null &&
      twilioNumberData.sender_pool_attached_at !== null;
    
    console.log('[RETRY PROVISIONING] Readiness check:', {
      provisioning_status: twilioNumberData.provisioning_status,
      campaign_registered_at: twilioNumberData.campaign_registered_at,
      sender_pool_attached_at: twilioNumberData.sender_pool_attached_at,
      is_truly_ready: isTrulyReady
    });
    
    // Only return early if truly ready
    if (isTrulyReady) {
      console.log('[RETRY PROVISIONING] Number is truly ready - no action needed');
      return {
        success: true,
        phoneNumber: business.twilio_phone_number,
        phoneNumberSid: business.twilio_phone_number_sid,
        status: 'ready'
      };
    }
    
    // Legacy status normalization
    const legacyStatuses = ['active', 'attached', 'provisioning', 'pending'];
    if (legacyStatuses.includes(twilioNumberData.provisioning_status || '')) {
      console.log('[RETRY PROVISIONING] Legacy status detected:', twilioNumberData.provisioning_status);
      console.log('[RETRY PROVISIONING] Normalizing to campaign_registering for full provisioning');
      
      // Update status to campaign_registering to trigger full provisioning
      await updateProvisioningStatus(businessId, business.twilio_phone_number_sid, 'campaign_registering', null, correlation);
    }
    
    // Continue with campaign registration (even if already done, it will verify)
    console.log('[RETRY PROVISIONING] Continuing with campaign registration step');
    
    const campaignResult = await registerToA2PCampaign(
      business.twilio_phone_number_sid,
      businessId,
      correlation
    );
    
    if (!campaignResult.success) {
      console.error('[RETRY PROVISIONING] Campaign registration failed:', campaignResult.error);
      return { success: false, error: campaignResult.error };
    }
    
    console.log('[RETRY PROVISIONING] Campaign registration completed');
    
    // Continue to sender pool attachment
    console.log('[RETRY PROVISIONING] Continuing with sender pool attachment step');
    
    const senderPoolResult = await attachToSenderPool(
      business.twilio_phone_number_sid,
      businessId,
      correlation
    );
    
    if (!senderPoolResult.success) {
      console.error('[RETRY PROVISIONING] Sender pool attachment failed:', senderPoolResult.error);
      return { success: false, error: senderPoolResult.error };
    }
    
    console.log('[RETRY PROVISIONING] Sender pool attachment completed');
    
    // Mark as ready
    await updateProvisioningStatus(businessId, business.twilio_phone_number_sid, 'ready', null, correlation);
    
    console.log('[RETRY PROVISIONING] ========== COMPLETE ==========');
    console.log('[RETRY PROVISIONING] Final status: ready');
    
    return {
      success: true,
      phoneNumber: business.twilio_phone_number,
      phoneNumberSid: business.twilio_phone_number_sid,
      status: 'ready'
    };
    
  } catch (error: any) {
    console.error('[RETRY PROVISIONING] Exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Backfill sms_status for existing numbers stuck in pending state
 * This repairs numbers that are already provisioned but have sms_status = pending
 */
export async function backfillSmsStatusForStuckNumbers(): Promise<{ fixed: number; errors: string[] }> {
  console.log('[SMS STATUS BACKFILL] ========== START ==========');
  console.log('[SMS STATUS BACKFILL] Timestamp:', new Date().toISOString());

  const errors: string[] = [];
  let fixed = 0;

  try {
    // Find numbers that are stuck: provisioning_status = ready, sms_status = pending, status = active, have business_id and twilio_sid
    const { data: stuckNumbers, error: queryError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, phone_number, twilio_sid, provisioning_status, sms_status, status')
      .eq('provisioning_status', 'ready')
      .eq('sms_status', 'pending')
      .eq('status', 'active')
      .not('business_id', 'is', null)
      .not('twilio_sid', 'is', null);

    if (queryError) {
      console.error('[SMS STATUS BACKFILL] Query failed:', queryError);
      errors.push(`Query failed: ${queryError.message}`);
      return { fixed, errors };
    }

    if (!stuckNumbers || stuckNumbers.length === 0) {
      console.log('[SMS STATUS BACKFILL] No stuck numbers found');
      return { fixed, errors };
    }

    console.log('[SMS STATUS BACKFILL] Found stuck numbers:', stuckNumbers.length);

    // Update each stuck number
    for (const number of stuckNumbers) {
      try {
        console.log('[SMS STATUS BACKFILL] Fixing number:', {
          id: number.id,
          phone_number: number.phone_number,
          business_id: number.business_id,
          current_sms_status: number.sms_status,
          current_provisioning_status: number.provisioning_status
        });

        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({ sms_status: 'ready' })
          .eq('id', number.id);

        if (updateError) {
          console.error('[SMS STATUS BACKFILL] Failed to update number:', number.id, updateError);
          errors.push(`Failed to update number ${number.phone_number}: ${updateError.message}`);
        } else {
          console.log('[SMS STATUS BACKFILL] Fixed number:', number.phone_number);
          fixed++;
        }
      } catch (error: any) {
        console.error('[SMS STATUS BACKFILL] Exception fixing number:', number.id, error);
        errors.push(`Exception fixing number ${number.phone_number}: ${error.message}`);
      }
    }

    console.log('[SMS STATUS BACKFILL] ========== COMPLETE ==========');
    console.log('[SMS STATUS BACKFILL] Fixed:', fixed);
    console.log('[SMS STATUS BACKFILL] Errors:', errors.length);

    return { fixed, errors };

  } catch (error: any) {
    console.error('[SMS STATUS BACKFILL] Exception:', error);
    errors.push(`Global exception: ${error.message}`);
    return { fixed, errors };
  }
}

/**
 * Get provisioning status for admin visibility
 */
export async function getProvisioningStatus(businessId: string) {
  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('provisioning_status, provisioning_error, last_provisioning_attempt_at, twilio_phone_number, twilio_phone_number_sid, campaign_registered_at, sender_pool_attached_at')
      .eq('id', businessId)
      .single();
    
    if (!business) {
      return null;
    }
    
    // Get additional details from twilio_numbers table
    const { data: twilioNumber } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('business_id', businessId)
      .single();
    
    return {
      business: business,
      twilioNumber: twilioNumber,
      messagingServiceSid: messagingServiceSid,
    };
    
  } catch (error: any) {
    console.error('[GET PROVISIONING STATUS] Exception:', error);
    return null;
  }
}
