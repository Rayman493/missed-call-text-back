/**
 * Warm Number Manager
 * Lightweight automatic warm-number replenishment for onboarding reliability
 * Dynamic inventory management: total = assigned_count + warm_buffer (3)
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { isSystemPhoneNumber } from './twilio-assignment';

const MIN_AVAILABLE_WARM_NUMBERS = parseInt(process.env.WARM_INVENTORY_TARGET || '3', 10); // Warm buffer target

// Duplicate purchase protection flag
let isReplenishing = false;

// Use service role key for database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

interface WarmNumberStats {
  availableCount: number;
  assignedCount: number;
  failedCount: number;
  quarantinedCount: number;
  totalManaged: number;
}

/**
 * Select newest excess numbers to release, preserving oldest up to target.
 * Expects input rows to already satisfy the canonical healthy criteria.
 */
export function selectExcessNumbersForTrim<T extends { created_at?: string | null }>(
  rows: T[],
  target: number
): T[] {
  if (!rows || rows.length <= target) return []
  const sorted = [...rows].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0
    return bt - at // newest first
  })
  const excessCount = rows.length - target
  return sorted.slice(0, excessCount)
}

interface InventoryMetrics {
  totalManaged: number;
  availableCount: number;
  assignedCount: number;
  failedCount: number;
  quarantinedCount: number;
  desiredTotal: number;
  desiredAvailableBuffer: number;
  purchaseNeeded: number;
}

export interface CleanupResult {
  success: boolean;
  partialFailure: boolean;
  numbersEligible: number;
  numbersRetired: number;
  numbersReleased: number;
  numbersFailed: number;
  failures: Array<{
    phoneNumber: string;
    stage: 'db_update' | 'twilio_release' | 'messaging_service_removal';
    code?: string;
    message: string;
  }>;
  error?: string;
}

/**
 * Get count of available warm numbers
 * ONLY counts numbers with:
 * - status='available'
 * - business_id IS NULL
 * - sms_status='ready'
 * 
 * Does NOT count:
 * - assigned numbers
 * - legacy active rows
 * - rows with business_id populated
 */
export async function getAvailableWarmNumberCount(): Promise<number> {
  if (!supabase) {
    console.error('[Warm Inventory] Supabase client not configured');
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from('twilio_numbers')
      .select('id')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .eq('provisioning_status', 'ready');

    if (error) {
      console.error('[Warm Inventory] Error fetching available warm numbers:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`[INVENTORY] Warm inventory: ${count}/${MIN_AVAILABLE_WARM_NUMBERS}`);
    return count;
  } catch (error) {
    console.error('[Warm Inventory] Exception fetching available warm numbers:', error);
    return 0;
  }
}

/**
 * Get comprehensive warm number statistics
 * ONLY counts numbers with exact status matches (no legacy compatibility)
 */
export async function getWarmNumberStats(): Promise<WarmNumberStats> {
  if (!supabase) {
    console.error('[Warm Inventory] Supabase client not configured');
    return {
      availableCount: 0,
      assignedCount: 0,
      failedCount: 0,
      quarantinedCount: 0,
      totalManaged: 0,
    };
  }

  try {
    console.log('[Warm Inventory] ========== GETTING WARM NUMBER STATS ==========');
    
    // Available: status='available', business_id IS NULL, sms_status='ready', provisioning_status='ready'
    const { data: available } = await supabase
      .from('twilio_numbers')
      .select('id')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .eq('provisioning_status', 'ready');

    console.log(`[Warm Inventory] Available count: ${available?.length || 0} (status=available, business_id IS NULL, sms_status=ready, provisioning_status=ready)`);

    // Assigned: status='assigned' (includes business_id populated)
    const { data: assigned } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'assigned');

    console.log(`[Warm Inventory] Assigned count: ${assigned?.length || 0} (status=assigned)`);

    // Failed: status='failed'
    const { data: failed } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'failed');

    console.log(`[Warm Inventory] Failed count: ${failed?.length || 0} (status=failed)`);

    // Quarantined: status='quarantined'
    const { data: quarantined } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'quarantined');

    console.log(`[Warm Inventory] Quarantined count: ${quarantined?.length || 0} (status=quarantined)`);
    console.log('[Warm Inventory] ========== STATS COMPLETE ==========');

    const totalManaged = (available?.length || 0) + (assigned?.length || 0) + (failed?.length || 0) + (quarantined?.length || 0);

    return {
      availableCount: available?.length || 0,
      assignedCount: assigned?.length || 0,
      failedCount: failed?.length || 0,
      quarantinedCount: quarantined?.length || 0,
      totalManaged,
    };
  } catch (error) {
    console.error('[Warm Inventory] Exception fetching warm number stats:', error);
    return {
      availableCount: 0,
      assignedCount: 0,
      failedCount: 0,
      quarantinedCount: 0,
      totalManaged: 0,
    };
  }
}

/**
 * Calculate dynamic inventory metrics
 * Returns information about current inventory state and purchase/cleanup needs
 */
export async function getInventoryMetrics(): Promise<InventoryMetrics> {
  if (!supabase) {
    console.error('[INVENTORY] Supabase client not configured');
    return {
      assignedCount: 0,
      availableCount: 0,
      desiredAvailableBuffer: MIN_AVAILABLE_WARM_NUMBERS,
      desiredTotal: MIN_AVAILABLE_WARM_NUMBERS,
      totalManaged: 0,
      purchaseNeeded: 0,
      failedCount: 0,
      quarantinedCount: 0,
    };
  }

  try {
    const stats = await getWarmNumberStats();
    
    const assignedCount = stats.assignedCount;
    const availableCount = stats.availableCount;
    const desiredAvailableBuffer = MIN_AVAILABLE_WARM_NUMBERS;
    const desiredTotal = assignedCount + desiredAvailableBuffer;
    const totalManaged = stats.totalManaged;
    const purchaseNeeded = Math.max(0, desiredAvailableBuffer - availableCount);
    const excessCount = Math.max(0, totalManaged - desiredTotal);

    console.log('[INVENTORY] ========== INVENTORY METRICS ==========');
    console.log(`[INVENTORY] assigned_count: ${assignedCount}`);
    console.log(`[INVENTORY] available_count: ${availableCount}`);
    console.log(`[INVENTORY] desired_available_buffer: ${desiredAvailableBuffer}`);
    console.log(`[INVENTORY] desired_total: ${desiredTotal}`);
    console.log(`[INVENTORY] total_managed_numbers: ${totalManaged}`);
    console.log(`[INVENTORY] purchase_needed: ${purchaseNeeded}`);
    console.log(`[INVENTORY] excess_count: ${excessCount}`);
    console.log('[INVENTORY] ========== METRICS COMPLETE ==========');

    return {
      assignedCount,
      availableCount,
      desiredAvailableBuffer,
      desiredTotal,
      totalManaged,
      purchaseNeeded,
      failedCount: stats.failedCount,
      quarantinedCount: stats.quarantinedCount,
    };
  } catch (error) {
    console.error('[INVENTORY] Exception calculating inventory metrics:', error);
    return {
      assignedCount: 0,
      availableCount: 0,
      desiredAvailableBuffer: MIN_AVAILABLE_WARM_NUMBERS,
      desiredTotal: MIN_AVAILABLE_WARM_NUMBERS,
      totalManaged: 0,
      purchaseNeeded: 0,
      failedCount: 0,
      quarantinedCount: 0,
    };
  }
}

/**
 * Provision a new warm number for the inventory
 * Purchases a new Twilio number, configures it, and stores it as available
 */
export async function provisionWarmNumber(): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
  console.log('[Warm Inventory] ========== provisionWarmNumber HIT ==========');
  console.log('[Warm Inventory] Provisioning new warm number...');

  if (!supabase) {
    console.error('[Warm Inventory] Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com';

  if (!accountSid || !authToken) {
    console.error('[Warm Inventory] Missing Twilio credentials');
    return { success: false, error: 'Missing Twilio credentials' };
  }

  const client = Twilio(accountSid, authToken);
  let purchasedNumber: any = null;

  try {
    // Step 1: Search for available local numbers
    console.log('[Warm Inventory] Searching for available local numbers...');
    const availableNumbers = await client.availablePhoneNumbers('US').local.list({
      limit: 10,
    });

    if (!availableNumbers || availableNumbers.length === 0) {
      console.error('[Warm Inventory] No available local numbers found');
      return { success: false, error: 'No available local numbers' };
    }

    const numberToPurchase = availableNumbers[0];
    console.log(`[Warm Inventory] Selected number: ${numberToPurchase.phoneNumber}`);

    // Step 2: Purchase the number with webhooks
    console.log('[Warm Inventory] Purchasing number with webhooks...');
    purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: `${appUrl}/api/twilio/voice`,
      statusCallback: `${appUrl}/api/twilio/voice-status`,
      statusCallbackMethod: 'POST',
      smsUrl: `${appUrl}/api/twilio/incoming-sms`,
      smsMethod: 'POST',
    });

    console.log(`[Warm Inventory] Purchased number: ${purchasedNumber.phoneNumber}, SID: ${purchasedNumber.sid}`);

    // Step 3: Add to Messaging Service if configured
    let senderPoolAttachedAt: string | null = null;
    let messagingServiceError: string | null = null;
    if (messagingServiceSid) {
      console.log(`[Warm Inventory] Adding number to Messaging Service: ${messagingServiceSid}`);

      try {
        const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });

        const alreadyAttached = existingPhoneNumbers.some(pn => pn.sid === purchasedNumber.sid);

        if (!alreadyAttached) {
          await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .create({
              phoneNumberSid: purchasedNumber.sid,
            });
          console.log('[Warm Inventory] Added to sender pool');
        } else {
          console.log('[Warm Inventory] Number already in sender pool');
        }

        // Verify sender pool membership
        const updatedPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });

        const isAttached = updatedPhoneNumbers.some(pn => pn.sid === purchasedNumber.sid);

        if (!isAttached) {
          console.error('[Warm Inventory] Failed to verify sender pool membership');
          messagingServiceError = 'Failed to verify sender pool membership';
          // Do NOT release the number - it's purchased and we'll track it as needing repair
        } else {
          senderPoolAttachedAt = new Date().toISOString();
          console.log('[Warm Inventory] Sender pool membership verified');
        }
      } catch (error: any) {
        console.error('[Warm Inventory] Failed to add to Messaging Service:', error);
        messagingServiceError = error.message || 'Failed to add to Messaging Service';
        // Do NOT release the number on timeout - it's purchased and we'll track it as needing repair
        // Only release on definitive failure (not timeout)
        if (error.code !== 'ECONNABORTED' && error.code !== 'ETIMEDOUT') {
          console.log('[Warm Inventory] Definitive failure, releasing number');
          await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
          return { success: false, error: 'Failed to add to Messaging Service' };
        } else {
          console.log('[Warm Inventory] Timeout during Messaging Service add - will track as needing repair');
        }
      }
    }

    // Step 4: Store in twilio_numbers table
    console.log('[Warm Inventory] Storing number in twilio_numbers table...');
    const { error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        phone_number: purchasedNumber.phoneNumber,
        twilio_sid: purchasedNumber.sid,
        number_type: 'both',
        status: messagingServiceError ? 'failed' : 'available',
        sms_status: messagingServiceError ? 'failed' : 'ready',
        provisioning_status: 'ready',
        provisioning_error: messagingServiceError || null,
        sender_pool_attached_at: senderPoolAttachedAt,
        business_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[Warm Inventory] Failed to store number in database:', insertError);
      // Release the number on failure
      await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
      return { success: false, error: 'Failed to store number in database' };
    }

    if (messagingServiceError) {
      console.log('[Warm Inventory] Number purchased but Messaging Service registration failed - tracked as failed for repair');
      console.log('[Warm Inventory] Number will be available for repair via admin tools');
      return { success: true, phoneNumber: purchasedNumber.phoneNumber }; // Return success so we don't block replenishment
    }

    console.log(`[Warm Inventory] Warm number provisioned successfully: ${purchasedNumber.phoneNumber}`);
    return { success: true, phoneNumber: purchasedNumber.phoneNumber };

  } catch (error: any) {
    console.error('[Warm Inventory] Exception during provisioning:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Ensure minimum number of available warm numbers
 * Provisions additional numbers if below minimum
 * Uses dynamic inventory metrics to determine exact purchase needs
 */
export async function ensureWarmNumberMinimum(): Promise<{ success: boolean; numbersAdded: number; availableBefore: number; availableAfter: number }> {
  // Duplicate purchase protection
  if (isReplenishing) {
    console.log('[INVENTORY] Replenishment already in progress, skipping duplicate request');
    return {
      success: true,
      numbersAdded: 0,
      availableBefore: await getAvailableWarmNumberCount(),
      availableAfter: await getAvailableWarmNumberCount(),
    };
  }

  isReplenishing = true;

  try {
    return await ensureWarmNumberMinimumWith({
      getInventoryMetrics,
      getAvailableWarmNumberCount,
      cleanupExcessInventory,
      provisionWarmNumber,
    });
  } finally {
    isReplenishing = false;
  }
}

/**
 * Internal/testable orchestration helper for warm inventory maintenance.
 * Production entrypoint ensureWarmNumberMinimum delegates here with real deps.
 */
export async function ensureWarmNumberMinimumWith(deps: {
  getInventoryMetrics: typeof getInventoryMetrics,
  getAvailableWarmNumberCount: typeof getAvailableWarmNumberCount,
  cleanupExcessInventory: () => Promise<CleanupResult>,
  provisionWarmNumber: typeof provisionWarmNumber,
}): Promise<{ success: boolean; numbersAdded: number; availableBefore: number; availableAfter: number }> {
  const metrics = await deps.getInventoryMetrics();
  const availableBefore = metrics.availableCount;

  console.log(`[INVENTORY] Current available: ${availableBefore}, Buffer target: ${metrics.desiredAvailableBuffer}`);

  // If we have more than target, trim the excess safely
  if (availableBefore > metrics.desiredAvailableBuffer) {
    console.log('[INVENTORY] Excess inventory detected, starting trim-to-target...');
    await deps.cleanupExcessInventory();
    const availableAfter = await deps.getAvailableWarmNumberCount();
    return {
      success: true,
      numbersAdded: 0,
      availableBefore,
      availableAfter,
    };
  }

  // If we are exactly at target, do nothing
  if (availableBefore === metrics.desiredAvailableBuffer) {
    console.log('[INVENTORY] Inventory exactly at target, no action needed');
    return {
      success: true,
      numbersAdded: 0,
      availableBefore,
      availableAfter: availableBefore,
    };
  }

  // Below target → purchase path
  const numbersNeeded = metrics.purchaseNeeded;
  console.log(`[INVENTORY] Purchasing ${numbersNeeded} number(s) to restore buffer...`);

  let numbersAdded = 0;
  let lastError: string | undefined;

  for (let i = 0; i < numbersNeeded; i++) {
    const result = await deps.provisionWarmNumber();

    if (result.success) {
      numbersAdded++;
      console.log(`[PURCHASE] Purchased new Twilio number: ${result.phoneNumber}`);
    } else {
      lastError = result.error;
      console.error(`[PURCHASE] Failed to purchase number ${i + 1}/${numbersNeeded}:`, lastError);
    }
  }

  const availableAfter = await deps.getAvailableWarmNumberCount();
  console.log(`[INVENTORY] Inventory restored: ${availableAfter}/${metrics.desiredAvailableBuffer}`);

  // Non-blocking: trigger cleanup of excess inventory after replenishment
  // using real production path (no-op if already exactly at target post-purchase).
  cleanupExcessInventory()
    .then((cleanupResult) => {
      if (cleanupResult.success) {
        if (cleanupResult.partialFailure) {
          console.error('[INVENTORY] Excess inventory cleanup: PARTIAL FAILURE', {
            eligible: cleanupResult.numbersEligible,
            retired: cleanupResult.numbersRetired,
            released: cleanupResult.numbersReleased,
            failed: cleanupResult.numbersFailed,
            failures: cleanupResult.failures
          });
        } else {
          console.log('[INVENTORY] Excess inventory cleanup: SUCCESS', {
            eligible: cleanupResult.numbersEligible,
            retired: cleanupResult.numbersRetired,
            released: cleanupResult.numbersReleased
          });
        }
      } else {
        console.error('[INVENTORY] Excess inventory cleanup: COMPLETE FAILURE', {
          error: cleanupResult.error,
          failures: cleanupResult.failures
        });
      }
    })
    .catch((cleanupError) => {
      console.error('[INVENTORY] Excess inventory cleanup failed (non-blocking):', cleanupError);
    });

  return {
    success: numbersAdded === numbersNeeded,
    numbersAdded,
    availableBefore,
    availableAfter,
  };
}

/**
 * Assign a warm number to a business
 * Updates the number status to 'assigned' and sets business_id
 */
export async function assignWarmNumberToBusiness(phoneNumber: string, businessId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[Warm Inventory] Assigning warm number ${phoneNumber} to business ${businessId}...`);

  if (!supabase) {
    console.error('[Warm Inventory] Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  try {
    const { error } = await supabase
      .from('twilio_numbers')
      .update({
        status: 'assigned',
        business_id: businessId,
        assigned_at: new Date().toISOString(),
        sms_status: 'ready',
        provisioning_status: 'ready',
        provisioning_error: null,
        detached_at: null,
        detached_reason: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('phone_number', phoneNumber)
      .eq('status', 'available');

    if (error) {
      console.error('[Warm Inventory] Failed to assign warm number:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Warm Inventory] Assigned warm number to business`);
    return { success: true };
  } catch (error: any) {
    console.error('[Warm Inventory] Exception assigning warm number:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger background replenishment after assigning a warm number
 * This should be called asynchronously after assigning a number
 */
export async function triggerBackgroundReplenishment(): Promise<void> {
  console.log('[Warm Inventory] ========== triggerBackgroundReplenishment HIT ==========');
  console.log('[Warm Inventory] Triggering background replenishment...');
  
  // Run asynchronously without awaiting
  ensureWarmNumberMinimum()
    .then((result) => {
      console.log('[Warm Inventory] Background replenish complete:', result);
    })
    .catch((error) => {
      console.error('[Warm Inventory] Background replenish failed:', error);
    });
}

/**
 * Get and assign the oldest available warm number to a business
 * Returns the assigned number or null if no warm numbers available
 */
export async function getAndAssignWarmNumber(businessId: string): Promise<{ success: boolean; phoneNumber?: string; phoneNumberSid?: string; error?: string }> {
  console.log(`[Warm Inventory] ========== START WARM INVENTORY ASSIGNMENT ==========`);
  console.log(`[Warm Inventory] Attempting to assign warm number to business ${businessId}...`);

  if (!supabase) {
    console.error('[Warm Inventory] ERROR: Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  try {
    // STEP 1: Atomic claim - UPDATE with WHERE conditions to prevent race condition
    // This ensures only one request can claim a specific number
    console.log(`[Warm Inventory] STEP 1: Atomically claiming warm number for business ${businessId}...`);
    
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const senderPoolAttachedAt = new Date().toISOString();

    const { data: updatedNumbers, error: claimError } = await supabase
      .from('twilio_numbers')
      .update({
        status: 'assigned',
        business_id: businessId,
        assigned_at: new Date().toISOString(),
        sms_status: 'ready',
        provisioning_status: 'ready',
        sender_pool_attached_at: senderPoolAttachedAt,
        detached_at: null,
        detached_reason: null,
        last_error: null,
        provisioning_error: null,
        updated_at: new Date().toISOString(),
      })
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .eq('provisioning_status', 'ready')
      .order('created_at', { ascending: true })
      .limit(1)
      .select();

    if (claimError) {
      console.error('[Warm Inventory] ERROR: Atomic claim failed:', claimError);
      console.error('[Warm Inventory] ERROR Details:', JSON.stringify(claimError, null, 2));
      return { success: false, error: 'Failed to claim warm number' };
    }

    if (!updatedNumbers || updatedNumbers.length === 0) {
      console.log('[Warm Inventory] No warm numbers available (atomic claim returned 0 rows)');
      return { success: false, error: 'No warm numbers available' };
    }

    const warmNumber = updatedNumbers[0];
    console.log(`[Warm Inventory] Successfully claimed number: ${warmNumber.phone_number}`);
    console.log(`[Warm Inventory] Claimed SID: ${warmNumber.twilio_sid}`);
    console.log(`[Warm Inventory] Claimed id: ${warmNumber.id}`);

    // STEP 2: Verify Twilio still owns the number after claim
    console.log(`[Warm Inventory] STEP 2: Verifying Twilio ownership...`);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[Warm Inventory] ERROR: Missing Twilio credentials for ownership verification');
      return { success: false, error: 'Missing Twilio credentials' };
    }

    // PROTECT: Block assignment of protected system number
    if (isSystemPhoneNumber(warmNumber.phone_number)) {
      console.error('[Warm Inventory] PROTECTED NUMBER ATTEMPTED ASSIGNMENT:', warmNumber.phone_number);
      console.error('[Warm Inventory] Rolling back assignment to prevent system number misuse');

      // Rollback the assignment
      await supabase
        .from('twilio_numbers')
        .update({
          status: 'available',
          business_id: null,
          assigned_at: null,
          detached_at: null,
          detached_reason: 'protected_number_rollback',
          last_error: 'Attempted to assign protected system number',
          updated_at: new Date().toISOString(),
        })
        .eq('id', warmNumber.id);

      return { success: false, error: 'Attempted to assign protected system number' };
    }

    const client = Twilio(accountSid, authToken);

    try {
      await client.incomingPhoneNumbers(warmNumber.twilio_sid).fetch();
      console.log(`[Warm Inventory] Twilio ownership verified: ${warmNumber.phone_number}`);
    } catch (twilioError: any) {
      console.error(`[Warm Inventory] Twilio ownership check failed for ${warmNumber.phone_number}:`, twilioError);
      if (twilioError.code === 20404 || twilioError.status === 404) {
        console.log(`[Warm Inventory] Number not found in Twilio - releasing claim and marking as retired`);
        // Release the claim and mark as retired
        await supabase
          .from('twilio_numbers')
          .update({
            status: 'retired',
            detached_at: new Date().toISOString(),
            detached_reason: 'twilio_number_not_owned',
            business_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', warmNumber.id);
        console.log(`[Warm Inventory] Released claim and marked as retired: ${warmNumber.phone_number}`);
      }
      return { success: false, error: 'Number not owned by Twilio' };
    }

    if (messagingServiceSid) {
      console.log(`[Warm Inventory] STEP 3: Verifying sender pool attachment...`);
      const senderPool = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 });
      const isInSenderPool = senderPool.some(pn => pn.sid === warmNumber.twilio_sid);

      if (!isInSenderPool) {
        console.error('[Warm Inventory] ERROR: Warm number is not attached to sender pool - releasing claim');
        // Release the claim
        await supabase
          .from('twilio_numbers')
          .update({
            status: 'available',
            business_id: null,
            assigned_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', warmNumber.id);
        return { success: false, error: 'Warm number is not attached to sender pool' };
      }

      console.log(`[Warm Inventory] Sender pool attachment verified: ${warmNumber.phone_number}`);
    }

    console.log(`[Warm Inventory] SUCCESS: Number claimed and verified`);

    // STEP 4: Update businesses table to mark provisioning as ready
    console.log(`[Warm Inventory] STEP 4: Updating business provisioning status to ready...`);
    const { error: businessUpdateError } = await supabase
      .from('businesses')
      .update({
        twilio_phone_number: warmNumber.phone_number,
        twilio_phone_number_sid: warmNumber.twilio_sid,
        assigned_twilio_number_id: warmNumber.id,
        twilio_messaging_service_sid: messagingServiceSid,
        provisioning_status: 'ready',
        provisioning_error: null,
        last_provisioning_attempt_at: new Date().toISOString(),
        provisioned_at: new Date().toISOString(),
      })
      .eq('id', businessId);

    if (businessUpdateError) {
      console.error('[Warm Inventory] ERROR: Business update failed');
      console.error('[Warm Inventory] ERROR Details:', JSON.stringify(businessUpdateError, null, 2));
      return { success: false, error: 'Failed to update business record' };
    }

    console.log(`[Warm Inventory] SUCCESS: Business provisioning status set to ready`);
    console.log(`[ASSIGN] Assigned recycled warm number to business: ${warmNumber.phone_number}`);
    console.log(`[Warm Inventory] ========== END WARM INVENTORY ASSIGNMENT (SUCCESS) ==========`);
    return {
      success: true,
      phoneNumber: warmNumber.phone_number,
      phoneNumberSid: warmNumber.twilio_sid,
    };

  } catch (error: any) {
    console.error('[Warm Inventory] EXCEPTION: Exception assigning warm number');
    console.error('[Warm Inventory] EXCEPTION Details:', JSON.stringify(error, null, 2));
    console.error('[Warm Inventory] ========== END WARM INVENTORY ASSIGNMENT (EXCEPTION) ==========');    
    return { success: false, error: error.message };
  }
}

/**
 * Verify and heal business Twilio assignment
 * Checks if the business's assigned Twilio number is still owned by Twilio
 * If not, invalidates the assignment and triggers reprovisioning
 */
export async function verifyAndHealBusinessTwilioAssignment(businessId: string): Promise<{ success: boolean; reprovisioned?: boolean; error?: string }> {
  console.log(`[SELF-HEAL] ========== START BUSINESS TWILIO ASSIGNMENT VERIFICATION ==========`);
  console.log(`[SELF-HEAL] Verifying business ${businessId} Twilio assignment...`);

  if (!supabase) {
    console.error('[SELF-HEAL] ERROR: Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  try {
    // Get business with Twilio assignment
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      console.error('[SELF-HEAL] ERROR: Failed to fetch business:', businessError);
      return { success: false, error: 'Failed to fetch business' };
    }

    if (!business.twilio_phone_number_sid) {
      console.log('[SELF-HEAL] Business has no Twilio number assigned, nothing to verify');
      return { success: true, reprovisioned: false };
    }

    console.log(`[SELF-HEAL] Business has assigned number: ${business.twilio_phone_number} (SID: ${business.twilio_phone_number_sid})`);

    // Verify Twilio still owns the number
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[SELF-HEAL] ERROR: Missing Twilio credentials for ownership verification');
      return { success: false, error: 'Missing Twilio credentials' };
    }

    const client = Twilio(accountSid, authToken);

    try {
      await client.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch();
      console.log(`[SELF-HEAL] Twilio ownership verified: ${business.twilio_phone_number}`);
      return { success: true, reprovisioned: false };
    } catch (twilioError: any) {
      console.error(`[SELF-HEAL] Twilio ownership check failed for ${business.twilio_phone_number}:`, twilioError);
      if (twilioError.code === 20404 || twilioError.status === 404) {
        console.log(`[SELF-HEAL] Number not found in Twilio Active Numbers - invalidating assignment`);
        
        // Invalidate the assignment in twilio_numbers table
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({
            status: 'retired',
            detached_at: new Date().toISOString(),
            detached_reason: 'twilio_number_not_owned',
            business_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('twilio_sid', business.twilio_phone_number_sid);

        if (updateError) {
          console.error('[SELF-HEAL] ERROR: Failed to invalidate twilio_numbers row:', updateError);
        } else {
          console.log(`[SELF-HEAL] Invalidated twilio_numbers row for ${business.twilio_phone_number}`);
        }

        // Clear business Twilio assignment with forwarding state reset
        const { error: businessUpdateError } = await supabase
          .from('businesses')
          .update({
            twilio_phone_number: null,
            twilio_phone_number_sid: null,
            twilio_messaging_service_sid: null,
            assigned_twilio_number_id: null,
            provisioning_status: null,
            provisioning_error: 'Previous number not owned by Twilio',
            provisioned_at: null,
            // Reset forwarding state when number is detached
            forwarding_verified: false,
            forwarding_verified_at: null,
            call_forwarding_enabled: false,
            phone_setup_completed_at: null,
          })
          .eq('id', businessId);

        if (businessUpdateError) {
          console.error('[SELF-HEAL] ERROR: Failed to clear business Twilio assignment:', businessUpdateError);
          return { success: false, error: 'Failed to clear business assignment' };
        }

        console.log(`[SELF-HEAL] Cleared business Twilio assignment`);
        console.log(`[SELF-HEAL] Business should reprovision on next access`);
        return { success: true, reprovisioned: true };
      }

      return { success: false, error: 'Twilio ownership check failed' };
    }
  } catch (error: any) {
    console.error('[SELF-HEAL] EXCEPTION: Exception during verification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Recycle a Twilio number back to warm inventory
 * Detaches from business, clears references, marks as available
 * Used during account deletion instead of releasing from Twilio
 */
export async function recycleTwilioNumberToInventory(
  phoneNumber: string,
  phoneNumberSid: string,
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[RECYCLE] ========== START NUMBER RECYCLING ==========');
  console.log(`[RECYCLE] Recycling number: ${phoneNumber}`);
  console.log(`[RECYCLE] Phone SID: ${phoneNumberSid}`);
  console.log(`[RECYCLE] From business: ${businessId}`);

  // PROTECT: Block recycling of ReplyFlow system number
  if (isSystemPhoneNumber(phoneNumber)) {
    console.log('[RECYCLE] Refusing to recycle protected ReplyFlow system number:', phoneNumber);
    return {
      success: false,
      error: 'Protected ReplyFlow system number cannot be recycled'
    };
  }

  if (!supabase) {
    console.error('[RECYCLE] ERROR: Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  try {
    // STEP 1: Verify Twilio-side configuration before marking as ready
    console.log('[RECYCLE] STEP 1: Verifying Twilio-side configuration before recycling...');
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    
    let isGenuinelyReady = false;
    let verificationDetails: any = {};
    
    if (accountSid && authToken) {
      const client = Twilio(accountSid, authToken);
      
      try {
        // Verify Twilio still owns the number
        console.log('[RECYCLE] Verifying Twilio ownership...');
        await client.incomingPhoneNumbers(phoneNumberSid).fetch();
        verificationDetails.twilioOwnership = 'verified';
        console.log('[RECYCLE] Twilio ownership verified');
        
        // Verify sender pool attachment if messaging service configured
        if (messagingServiceSid) {
          console.log('[RECYCLE] Verifying sender pool attachment...');
          const senderPool = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .list({ limit: 100 });
          const isInSenderPool = senderPool.some(pn => pn.sid === phoneNumberSid);
          
          if (isInSenderPool) {
            verificationDetails.senderPool = 'attached';
            console.log('[RECYCLE] Sender pool attachment verified');
          } else {
            verificationDetails.senderPool = 'not_attached';
            console.log('[RECYCLE] Number not in sender pool');
          }
        } else {
          verificationDetails.senderPool = 'not_configured';
          console.log('[RECYCLE] Messaging service not configured, skipping sender pool check');
        }
        
        // Check current provisioning status from database
        console.log('[RECYCLE] Checking current provisioning status...');
        const { data: currentNumber, error: fetchError } = await supabase
          .from('twilio_numbers')
          .select('provisioning_status, sms_status')
          .eq('twilio_sid', phoneNumberSid)
          .single();
        
        if (!fetchError && currentNumber) {
          verificationDetails.provisioningStatus = currentNumber.provisioning_status;
          verificationDetails.currentSmsStatus = currentNumber.sms_status;
          console.log('[RECYCLE] Current provisioning status:', currentNumber.provisioning_status);
          console.log('[RECYCLE] Current sms_status:', currentNumber.sms_status);
          
          // Determine readiness based on canonical logic
          // Number is ready if: Twilio owns it, sender pool attached (if configured), provisioning_status is 'ready'
          const senderPoolVerified = !messagingServiceSid || verificationDetails.senderPool === 'attached';
          const provisioningReady = currentNumber.provisioning_status === 'ready';
          
          isGenuinelyReady = senderPoolVerified && provisioningReady;
          
          console.log('[RECYCLE] Readiness determination:', {
            senderPoolVerified,
            provisioningReady,
            isGenuinelyReady
          });
        } else {
          console.error('[RECYCLE] Failed to fetch current number status:', fetchError);
          verificationDetails.fetchError = fetchError?.message;
        }
        
      } catch (verifyError: any) {
        console.error('[RECYCLE] Verification failed:', verifyError);
        verificationDetails.verificationError = verifyError?.message;
        isGenuinelyReady = false;
      }
    } else {
      console.error('[RECYCLE] Missing Twilio credentials for verification');
      verificationDetails.credentialsError = 'missing_credentials';
      isGenuinelyReady = false;
    }
    
    console.log('[RECYCLE] Verification complete:', verificationDetails);
    console.log('[RECYCLE] Final readiness determination:', isGenuinelyReady ? 'ready' : 'pending');
    
    // STEP 2: Fetch current state for compare-and-swap validation
    console.log('[RECYCLE] STEP 2: Fetching current state for compare-and-swap validation...');
    const { data: currentNumber, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status, sms_status, assigned_at, detached_at, detached_reason')
      .eq('twilio_sid', phoneNumberSid)
      .single();

    if (fetchError || !currentNumber) {
      console.error('[RECYCLE] ERROR: Failed to fetch current number state:', fetchError);
      return { success: false, error: 'Failed to fetch current number state for validation' };
    }

    // P0 FIX 1: Compare-and-swap validation
    if (currentNumber.business_id !== businessId) {
      console.error('[RECYCLE] ERROR: Business ID mismatch - concurrent modification detected', {
        expected: businessId,
        actual: currentNumber.business_id
      });
      return { success: false, error: 'Business ID mismatch - concurrent modification detected' };
    }

    if (currentNumber.twilio_sid !== phoneNumberSid) {
      console.error('[RECYCLE] ERROR: Twilio SID mismatch - concurrent modification detected', {
        expected: phoneNumberSid,
        actual: currentNumber.twilio_sid
      });
      return { success: false, error: 'Twilio SID mismatch - concurrent modification detected' };
    }

    // P0 FIX 2: Protected account check - block recycling if business is protected
    console.log('[RECYCLE] Checking if business is protected...');
    const { data: business, error: businessFetchError } = await supabase
      .from('businesses')
      .select('id, name, is_protected_account')
      .eq('id', businessId)
      .single();

    if (businessFetchError) {
      console.error('[RECYCLE] ERROR: Failed to fetch business for protection check:', businessFetchError);
      return { success: false, error: 'Failed to fetch business for protection check' };
    }

    if (business && business.is_protected_account === true) {
      console.error('[RECYCLE] PROTECTED_ACCOUNT_NUMBER_RECYCLE_BLOCKED: Business is protected', {
        businessId: business.id,
        businessName: business.name,
        phoneNumber: phoneNumber
      });
      return {
        success: false,
        error: 'Cannot recycle number from protected business'
      };
    }

    if (!business) {
      console.error('[RECYCLE] ERROR: Business not found for protection check', { businessId });
      return { success: false, error: 'Business not found for protection check' };
    }

    // STEP 3: Detach from business in twilio_numbers table with compare-and-swap
    console.log('[RECYCLE] STEP 3: Detaching number from business with compare-and-swap...');
    const { error: detachError, count: detachCount } = await supabase
      .from('twilio_numbers')
      .update({
        business_id: null,
        status: 'available',
        sms_status: isGenuinelyReady ? 'ready' : 'pending',
        assigned_at: null,
        detached_at: new Date().toISOString(),
        detached_reason: 'account_deletion',
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentNumber.id)
      .eq('twilio_sid', phoneNumberSid)
      .eq('business_id', businessId)
      .in('status', ['assigned', 'active']);

    if (detachError) {
      console.error('[RECYCLE] ERROR: Failed to detach number from business:', detachError);
      console.error('[RECYCLE] ERROR Details:', JSON.stringify(detachError, null, 2));
      return { success: false, error: 'Failed to detach number from business' };
    }

    if (detachCount === 0) {
      console.error('[RECYCLE] ERROR: Compare-and-swap failed - zero rows updated');
      return { success: false, error: 'Compare-and-swap failed - concurrent modification detected' };
    }

    console.log('[RECYCLE] SUCCESS: Number detached from business');

    // STEP 4: Clear business references with compare-and-swap and forwarding field reset
    console.log('[RECYCLE] STEP 4: Clearing business references with forwarding field reset...');
    const { error: businessUpdateError, count: businessUpdateCount } = await supabase
      .from('businesses')
      .update({
        assigned_twilio_number_id: null,
        twilio_phone_number: null,
        twilio_phone_number_sid: null,
        twilio_messaging_service_sid: null,
        provisioning_status: null,
        provisioning_error: null,
        provisioned_at: null,
        // P0 FIX 1: Reset forwarding state (only columns that exist in schema)
        forwarding_verified: false,
        forwarding_verified_at: null,
        call_forwarding_enabled: false,
        phone_setup_completed_at: null,
      })
      .eq('id', businessId)
      .eq('twilio_phone_number', phoneNumber)
      .eq('twilio_phone_number_sid', phoneNumberSid);

    if (businessUpdateError) {
      console.error('[RECYCLE] ERROR: Failed to clear business references:', businessUpdateError);
      console.error('[RECYCLE] ERROR Details:', JSON.stringify(businessUpdateError, null, 2));
      
      // SAFETY FIX: Compensation rollback with compare-and-swap and full field restoration
      console.error('[RECYCLE] COMPENSATION: Rolling back twilio_numbers update due to business update failure');
      const { error: rollbackError, count: rollbackCount } = await supabase
        .from('twilio_numbers')
        .update({
          business_id: businessId,
          status: currentNumber.status,
          sms_status: currentNumber.sms_status || null,
          assigned_at: currentNumber.assigned_at || null,
          detached_at: null,
          detached_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentNumber.id)
        .eq('business_id', null) // Ensure we're rolling back from the detached state
        .in('status', ['available']);
      
      if (rollbackError || rollbackCount === 0) {
        console.error('[RECYCLE] CRITICAL: Compensation rollback failed - data may be inconsistent', {
          rollbackError: rollbackError?.message,
          rollbackCount
        });
        return { 
          success: false, 
          error: 'CRITICAL: Failed to clear business references AND compensation rollback failed - data may be inconsistent' 
        };
      }
      
      console.error('[RECYCLE] COMPENSATION: Rollback successful');
      return { success: false, error: 'Failed to clear business references - transaction rolled back' };
    }

    if (businessUpdateCount === 0) {
      console.error('[RECYCLE] ERROR: Compare-and-swap failed on business update - zero rows updated');
      
      // SAFETY FIX: Compensation rollback with compare-and-swap and full field restoration
      console.error('[RECYCLE] COMPENSATION: Rolling back twilio_numbers update due to business compare-and-swap failure');
      const { error: rollbackError, count: rollbackCount } = await supabase
        .from('twilio_numbers')
        .update({
          business_id: businessId,
          status: currentNumber.status,
          sms_status: currentNumber.sms_status || null,
          assigned_at: currentNumber.assigned_at || null,
          detached_at: null,
          detached_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentNumber.id)
        .eq('business_id', null) // Ensure we're rolling back from the detached state
        .in('status', ['available']);
      
      if (rollbackError || rollbackCount === 0) {
        console.error('[RECYCLE] CRITICAL: Compensation rollback failed - data may be inconsistent', {
          rollbackError: rollbackError?.message,
          rollbackCount
        });
        return { 
          success: false, 
          error: 'CRITICAL: Compare-and-swap failed on business update AND compensation rollback failed - data may be inconsistent' 
        };
      }
      
      console.error('[RECYCLE] COMPENSATION: Rollback successful');
      return { success: false, error: 'Compare-and-swap failed on business update - transaction rolled back' };
    }

    console.log('[RECYCLE] SUCCESS: Business references cleared and forwarding state reset');

    console.log(`[RECYCLE] Number recycled to warm inventory: ${phoneNumber}`);
    console.log('[RECYCLE] ========== END NUMBER RECYCLING (SUCCESS) ==========');
    return { success: true };

  } catch (error: any) {
    console.error('[RECYCLE] EXCEPTION: Exception recycling number');
    console.error('[RECYCLE] EXCEPTION Details:', JSON.stringify(error, null, 2));
    console.error('[RECYCLE] ========== END NUMBER RECYCLING (EXCEPTION) ==========');
    return { success: false, error: error.message };
  }
}

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  // Network-related transient errors
  if (errorMessage.includes('fetch failed')) return true;
  if (errorMessage.includes('und_err_socket')) return true;
  if (errorMessage.includes('econnreset')) return true;
  if (errorMessage.includes('connection reset')) return true;
  if (errorMessage.includes('connection closed')) return true;
  if (errorMessage.includes('timeout')) return true;
  if (errorMessage.includes('etimedout')) return true;
  if (errorMessage.includes('enotfound')) return true;
  if (errorMessage.includes('econnrefused')) return true;
  if (errorMessage.includes('network')) return true;
  
  // Specific error codes
  if (errorCode.includes('5')) return true; // 5xx server errors
  if (errorCode === '503') return true;
  if (errorCode === '502') return true;
  if (errorCode === '504') return true;
  
  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic for transient errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<{ success: boolean; result?: T; error?: string }> {
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error: any) {
      lastError = error.message || String(error);
      
      console.error(`[RETRY] Attempt ${attempt}/${maxAttempts} failed:`, lastError);
      
      // Don't retry non-transient errors
      if (!isTransientError(error)) {
        console.error('[RETRY] Non-transient error, not retrying');
        break;
      }
      
      // Don't wait after last attempt
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[RETRY] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }
  
  return { success: false, error: lastError };
}

/**
 * Clean up excess inventory by releasing/retiring safe extra unused numbers
 * Only releases numbers that are:
 * - status='available'
 * - business_id IS NULL
 * - sms_status='ready'
 * - NOT the protected system number
 * - Newest created_at (to release newest first, keep oldest)
 * 
 * SAFE ORDERING:
 * 1. Mark as retired in database FIRST
 * 2. Release from Twilio SECOND
 * 3. If database update fails, do NOT release from Twilio
 * 4. Never leave Twilio released while database shows active/available
 * 
 * Marks numbers as retired in database with detached_at and detached_reason
 * instead of deleting them, for audit trail
 */
export async function cleanupExcessInventory(): Promise<CleanupResult> {
  console.log('[CLEANUP] ========== START EXCESS INVENTORY CLEANUP ==========');

  const result: CleanupResult = {
    success: true,
    partialFailure: false,
    numbersEligible: 0,
    numbersRetired: 0,
    numbersReleased: 0,
    numbersFailed: 0,
    failures: []
  };

  if (!supabase) {
    console.error('[CLEANUP] ERROR: Supabase client not configured');
    return {
      success: false,
      partialFailure: false,
      numbersEligible: 0,
      numbersRetired: 0,
      numbersReleased: 0,
      numbersFailed: 0,
      failures: [],
      error: 'Supabase client not configured'
    };
  }

  try {
    const metrics = await getInventoryMetrics();
    const availableCount = metrics.availableCount;
    const targetAvailable = metrics.desiredAvailableBuffer;
    
    console.log(`[INVENTORY] target_available: ${targetAvailable}`);
    console.log(`[INVENTORY] available_ready_count: ${availableCount}`);
    
    if (availableCount <= targetAvailable) {
      console.log('[CLEANUP] No excess inventory to clean up');
      return {
        success: true,
        partialFailure: false,
        numbersEligible: 0,
        numbersRetired: 0,
        numbersReleased: 0,
        numbersFailed: 0,
        failures: []
      };
    }

    const excessCount = availableCount - targetAvailable;
    console.log(`[INVENTORY] excess_count: ${excessCount}`);
    console.log(`[CLEANUP] Total managed: ${metrics.totalManaged}`);
    console.log(`[CLEANUP] Desired total: ${metrics.desiredTotal}`);

    // Get protected system phone number (if configured)
    const systemPhoneNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER;
    console.log(`[CLEANUP] Protected system phone: ${systemPhoneNumber || 'none'}`);

    // Fetch all healthy available numbers (we will deterministically select newest extras to release)
    const { data: healthyNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .eq('provisioning_status', 'ready')
      .order('created_at', { ascending: false }); // Newest first

    if (fetchError) {
      console.error('[CLEANUP] ERROR: Failed to fetch excess numbers:', fetchError);
      return {
        success: false,
        partialFailure: false,
        numbersEligible: 0,
        numbersRetired: 0,
        numbersReleased: 0,
        numbersFailed: 0,
        failures: [],
        error: 'Failed to fetch excess numbers'
      };
    }

    if (!healthyNumbers || healthyNumbers.length === 0) {
      console.log('[CLEANUP] No excess numbers found to release');
      return {
        success: true,
        partialFailure: false,
        numbersEligible: 0,
        numbersRetired: 0,
        numbersReleased: 0,
        numbersFailed: 0,
        failures: []
      };
    }

    // Filter out protected system number from cleanup candidates
    const eligibleNumbers = healthyNumbers.filter(n => !isSystemPhoneNumber(n.phone_number));
    if (eligibleNumbers.length !== healthyNumbers.length) {
      const filteredCount = healthyNumbers.length - eligibleNumbers.length;
      console.log(`[CLEANUP] Filtered out ${filteredCount} protected system number(s) from cleanup`);
    }

    const excessNumbers = selectExcessNumbersForTrim(eligibleNumbers, targetAvailable);
    if (excessNumbers.length === 0) {
      console.log('[CLEANUP] Computed no excess after selection, nothing to release');
      return {
        success: true,
        partialFailure: false,
        numbersEligible: 0,
        numbersRetired: 0,
        numbersReleased: 0,
        numbersFailed: 0,
        failures: []
      };
    }

    result.numbersEligible = excessNumbers.length;
    console.log(`[CLEANUP] Found ${excessNumbers.length} excess numbers to potentially release`);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[CLEANUP] ERROR: Missing Twilio credentials');
      return {
        success: false,
        partialFailure: false,
        numbersEligible: result.numbersEligible,
        numbersRetired: 0,
        numbersReleased: 0,
        numbersFailed: result.numbersEligible,
        failures: excessNumbers.map(n => ({
          phoneNumber: n.phone_number,
          stage: 'db_update' as const,
          message: 'Missing Twilio credentials'
        })),
        error: 'Missing Twilio credentials'
      };
    }

    const client = Twilio(accountSid, authToken);

    for (const number of excessNumbers) {
      // Skip protected system number
      if (systemPhoneNumber && number.phone_number === systemPhoneNumber) {
        console.log(`[PROTECTED] Skipping protected system phone: ${number.phone_number}`);
        continue;
      }

      console.log(`[CLEANUP] Selected number for release: ${number.phone_number} (SID: ${number.twilio_sid})`);

      try {
        // Guard: ensure we don't over-release if pool already reached target due to prior iterations or races
        const currentHealthy = await getAvailableWarmNumberCount();
        if (currentHealthy <= targetAvailable) {
          console.log('[CLEANUP] Current healthy count at or below target, stopping further releases');
          break;
        }

        // Re-validate immediately before action to avoid races
        const { data: latest, error: refetchError } = await supabase
          .from('twilio_numbers')
          .select('id, phone_number, twilio_sid, business_id, status, sms_status, provisioning_status')
          .eq('id', number.id)
          .single();
        if (refetchError || !latest) {
          console.warn('[CLEANUP] Skipping due to refetch error/missing row');
          result.numbersFailed++;
          result.failures.push({
            phoneNumber: number.phone_number,
            stage: 'db_update',
            message: refetchError?.message || 'Row not found'
          });
          result.partialFailure = true;
          continue;
        }
        const isHealthy = (
          latest.business_id === null &&
          latest.status === 'available' &&
          latest.sms_status === 'ready' &&
          latest.provisioning_status === 'ready'
        );
        if (!isHealthy) {
          console.log('[CLEANUP] Skipping due to failing healthy revalidation');
          continue;
        }

        // STEP 1: Mark as retired in database FIRST (safe ordering)
        // This must succeed before we touch Twilio
        const updateResult = await retryWithBackoff(async () => {
          const { error } = await supabase
            .from('twilio_numbers')
            .update({
              status: 'retired',
              detached_at: new Date().toISOString(),
              detached_reason: 'excess_inventory_cleanup',
              updated_at: new Date().toISOString(),
            })
            .eq('id', number.id);
          
          if (error) throw error;
        }, 3, 1000);

        if (!updateResult.success) {
          console.error(`[CLEANUP] ERROR: Failed to mark as retired in database after retries:`, updateResult.error);
          result.numbersFailed++;
          result.failures.push({
            phoneNumber: number.phone_number,
            stage: 'db_update',
            message: updateResult.error || 'Database update failed'
          });
          result.partialFailure = true;
          // CRITICAL: Do NOT proceed to Twilio release if DB update failed
          continue;
        }

        console.log(`[CLEANUP] Marked retired in database`);
        result.numbersRetired++;

        // STEP 2: Only after DB update succeeds, proceed with Twilio release
        // Remove from Messaging Service if attached
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (messagingServiceSid) {
          try {
            await client.messaging.v1.services(messagingServiceSid)
              .phoneNumbers(number.twilio_sid)
              .remove();
            console.log(`[CLEANUP] Removed from Messaging Service`);
          } catch (msError: any) {
            console.warn(`[CLEANUP] Failed to remove from Messaging Service (continuing):`, msError);
            result.failures.push({
              phoneNumber: number.phone_number,
              stage: 'messaging_service_removal',
              code: msError.code,
              message: msError.message || 'Failed to remove from messaging service'
            });
            // Don't fail the entire operation for messaging service removal failure
          }
        }

        // Release from Twilio
        try {
          await client.incomingPhoneNumbers(number.twilio_sid).remove();
          console.log(`[CLEANUP] Released from Twilio`);
          result.numbersReleased++;
        } catch (twilioError: any) {
          // If number is already gone in Twilio, still count as success (DB is correct)
          if (twilioError.code === 20404 || twilioError.status === 404) {
            console.log(`[CLEANUP] Number not found in Twilio (already released)`);
            result.numbersReleased++;
          } else {
            console.error(`[CLEANUP] Failed to release from Twilio:`, twilioError);
            result.failures.push({
              phoneNumber: number.phone_number,
              stage: 'twilio_release',
              code: twilioError.code,
              message: twilioError.message || 'Failed to release from Twilio'
            });
            result.partialFailure = true;
            // DB is correct (retired), but Twilio still has the number
            // This is acceptable - it will be cleaned up later
          }
        }
      } catch (releaseError: any) {
        console.error(`[CLEANUP] ERROR: Failed to release number ${number.phone_number}:`, releaseError);
        result.numbersFailed++;
        result.failures.push({
          phoneNumber: number.phone_number,
          stage: 'db_update',
          message: releaseError.message || 'Unknown error'
        });
        result.partialFailure = true;
      }
    }

    // Determine overall success
    result.success = result.numbersFailed === 0 || result.numbersRetired > 0;
    
    console.log(`[CLEANUP] Cleanup complete:`, {
      eligible: result.numbersEligible,
      retired: result.numbersRetired,
      released: result.numbersReleased,
      failed: result.numbersFailed,
      partialFailure: result.partialFailure
    });
    console.log('[CLEANUP] ========== END EXCESS INVENTORY CLEANUP ==========');
    
    return result;

  } catch (error: any) {
    console.error('[CLEANUP] EXCEPTION: Exception during cleanup');
    console.error('[CLEANUP] EXCEPTION Details:', JSON.stringify(error, null, 2));
    console.error('[CLEANUP] ========== END EXCESS INVENTORY CLEANUP (EXCEPTION) ==========');
    return {
      success: false,
      partialFailure: false,
      numbersEligible: 0,
      numbersRetired: 0,
      numbersReleased: 0,
      numbersFailed: 0,
      failures: [],
      error: error.message
    };
  }
}
