/**
 * Warm Number Manager
 * Lightweight automatic warm-number replenishment for onboarding reliability
 * Dynamic inventory management: total = assigned_count + warm_buffer (3)
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const MIN_AVAILABLE_WARM_NUMBERS = 3; // Warm buffer target

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

interface InventoryMetrics {
  assignedCount: number;
  availableCount: number;
  desiredAvailableBuffer: number;
  desiredTotal: number;
  totalManaged: number;
  purchaseNeeded: number;
  excessCount: number;
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
      .eq('sms_status', 'ready');

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
    
    // Available: status='available', business_id IS NULL, sms_status='ready'
    const { data: available } = await supabase
      .from('twilio_numbers')
      .select('id')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready');

    console.log(`[Warm Inventory] Available count: ${available?.length || 0} (status=available, business_id IS NULL, sms_status=ready)`);

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
      excessCount: 0,
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
      excessCount,
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
      excessCount: 0,
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
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: `${appUrl}/api/twilio/voice`,
      statusCallback: `${appUrl}/api/twilio/voice-status`,
      statusCallbackMethod: 'POST',
      smsUrl: `${appUrl}/api/twilio/incoming-sms`,
      smsMethod: 'POST',
    });

    console.log(`[Warm Inventory] Purchased number: ${purchasedNumber.phoneNumber}, SID: ${purchasedNumber.sid}`);

    // Step 3: Add to Messaging Service if configured
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
          // Release the number
          await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
          return { success: false, error: 'Failed to verify sender pool membership' };
        }

        console.log('[Warm Inventory] Sender pool membership verified');
      } catch (error) {
        console.error('[Warm Inventory] Failed to add to Messaging Service:', error);
        // Release the number on failure
        await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
        return { success: false, error: 'Failed to add to Messaging Service' };
      }
    }

    // Step 4: Store in twilio_numbers table as available
    console.log('[Warm Inventory] Storing number in twilio_numbers table...');
    const { error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        phone_number: purchasedNumber.phoneNumber,
        twilio_sid: purchasedNumber.sid,
        number_type: 'both',
        status: 'available',
        sms_status: 'ready',
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
    const metrics = await getInventoryMetrics();
    const availableBefore = metrics.availableCount;

    console.log(`[INVENTORY] Current available: ${availableBefore}, Buffer target: ${metrics.desiredAvailableBuffer}`);

    if (availableBefore >= metrics.desiredAvailableBuffer) {
      console.log('[INVENTORY] Sufficient inventory, no purchase needed');
      return {
        success: true,
        numbersAdded: 0,
        availableBefore,
        availableAfter: availableBefore,
      };
    }

    const numbersNeeded = metrics.purchaseNeeded;
    console.log(`[INVENTORY] Purchasing ${numbersNeeded} number(s) to restore buffer...`);

    let numbersAdded = 0;
    let lastError: string | undefined;

    for (let i = 0; i < numbersNeeded; i++) {
      const result = await provisionWarmNumber();

      if (result.success) {
        numbersAdded++;
        console.log(`[PURCHASE] Purchased new Twilio number: ${result.phoneNumber}`);
      } else {
        lastError = result.error;
        console.error(`[PURCHASE] Failed to purchase number ${i + 1}/${numbersNeeded}:`, lastError);
      }
    }

    const availableAfter = await getAvailableWarmNumberCount();
    console.log(`[INVENTORY] Inventory restored: ${availableAfter}/${metrics.desiredAvailableBuffer}`);

    const success = numbersAdded === numbersNeeded;

    return {
      success,
      numbersAdded,
      availableBefore,
      availableAfter,
    };
  } finally {
    isReplenishing = false;
  }
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
    // STEP 1: Get available count
    console.log(`[Warm Inventory] STEP 1: Checking for available numbers...`);
    const countResult = await getAvailableWarmNumberCount();
    console.log(`[Warm Inventory] Available count: ${countResult}`);

    if (countResult === 0) {
      console.log(`[Warm Inventory] No warm numbers available, returning failure`);
      return { success: false, error: 'No warm numbers available' };
    }

    // STEP 2: Fetch the oldest available warm number (NO legacy compatibility)
    console.log(`[Warm Inventory] STEP 2: Fetching oldest available warm number...`);
    console.log(`[Warm Inventory] Query criteria: status=available, business_id IS NULL, sms_status=ready`);
    const { data: availableNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error('[Warm Inventory] ERROR: Failed to fetch available warm numbers:', fetchError);
      console.error('[Warm Inventory] ERROR Details:', JSON.stringify(fetchError, null, 2));
      return { success: false, error: 'Failed to fetch available warm numbers' };
    }

    if (!availableNumbers || availableNumbers.length === 0) {
      console.log('[Warm Inventory] No warm numbers found in query result');
      return { success: false, error: 'No warm numbers available' };
    }

    const warmNumber = availableNumbers[0];
    console.log(`[Warm Inventory] First available number: ${warmNumber.phone_number}`);
    console.log(`[Warm Inventory] First available SID: ${warmNumber.twilio_sid}`);
    console.log(`[Warm Inventory] First available status: ${warmNumber.status}`);
    console.log(`[Warm Inventory] First available sms_status: ${warmNumber.sms_status}`);
    console.log(`[Warm Inventory] First available id: ${warmNumber.id}`);

    // STEP 3: Update twilio_numbers table
    console.log(`[Warm Inventory] STEP 3: Assigning number to business...`);
    console.log(`[Warm Inventory] Business ID: ${businessId}`);
    console.log(`[Warm Inventory] Phone Number: ${warmNumber.phone_number}`);
    console.log(`[Warm Inventory] Phone SID: ${warmNumber.twilio_sid}`);

    const { error: updateError } = await supabase
      .from('twilio_numbers')
      .update({
        status: 'assigned',
        business_id: businessId,
        assigned_at: new Date().toISOString(),
        sms_status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', warmNumber.id);

    if (updateError) {
      console.error('[Warm Inventory] ERROR: Assignment DB update failed');
      console.error('[Warm Inventory] ERROR Details:', JSON.stringify(updateError, null, 2));
      return { success: false, error: 'Failed to assign warm number' };
    }

    console.log(`[Warm Inventory] SUCCESS: Assignment DB update successful`);
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

  if (!supabase) {
    console.error('[RECYCLE] ERROR: Supabase client not configured');
    return { success: false, error: 'Supabase client not configured' };
  }

  try {
    // STEP 1: Detach from business in twilio_numbers table
    console.log('[RECYCLE] STEP 1: Detaching number from business...');
    const { error: detachError } = await supabase
      .from('twilio_numbers')
      .update({
        business_id: null,
        status: 'available',
        sms_status: 'ready',
        assigned_at: null,
        detached_at: new Date().toISOString(),
        detached_reason: 'account_deletion',
        updated_at: new Date().toISOString(),
      })
      .eq('twilio_sid', phoneNumberSid)
      .eq('business_id', businessId);

    if (detachError) {
      console.error('[RECYCLE] ERROR: Failed to detach number from business:', detachError);
      console.error('[RECYCLE] ERROR Details:', JSON.stringify(detachError, null, 2));
      return { success: false, error: 'Failed to detach number from business' };
    }

    console.log('[RECYCLE] SUCCESS: Number detached from business');

    // STEP 2: Clear assigned_twilio_number_id in businesses table
    console.log('[RECYCLE] STEP 2: Clearing assigned_twilio_number_id in businesses table...');
    const { error: businessUpdateError } = await supabase
      .from('businesses')
      .update({
        assigned_twilio_number_id: null,
        twilio_phone_number: null,
        twilio_phone_number_sid: null,
        twilio_messaging_service_sid: null,
        provisioning_status: null,
        provisioning_error: null,
        provisioned_at: null,
      })
      .eq('id', businessId);

    if (businessUpdateError) {
      console.error('[RECYCLE] WARNING: Failed to clear business references:', businessUpdateError);
      console.error('[RECYCLE] WARNING Details:', JSON.stringify(businessUpdateError, null, 2));
      // Don't fail - number is already recycled, this is cleanup
    } else {
      console.log('[RECYCLE] SUCCESS: Business references cleared');
    }

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
 * Clean up excess inventory by releasing/retiring safe extra unused numbers
 * Only releases numbers that are:
 * - status='available'
 * - business_id IS NULL
 * - sms_status='ready'
 * - NOT the protected system number
 * - Oldest created_at (to release newest first, keep oldest)
 */
export async function cleanupExcessInventory(): Promise<{ success: boolean; numbersReleased: number; error?: string }> {
  console.log('[CLEANUP] ========== START EXCESS INVENTORY CLEANUP ==========');

  if (!supabase) {
    console.error('[CLEANUP] ERROR: Supabase client not configured');
    return { success: false, numbersReleased: 0, error: 'Supabase client not configured' };
  }

  try {
    const metrics = await getInventoryMetrics();
    
    if (metrics.excessCount <= 0) {
      console.log('[CLEANUP] No excess inventory to clean up');
      return { success: true, numbersReleased: 0 };
    }

    console.log(`[CLEANUP] Excess count: ${metrics.excessCount}`);
    console.log(`[CLEANUP] Total managed: ${metrics.totalManaged}`);
    console.log(`[CLEANUP] Desired total: ${metrics.desiredTotal}`);

    // Get protected system phone number (if configured)
    const systemPhoneNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER;
    console.log(`[CLEANUP] Protected system phone: ${systemPhoneNumber || 'none'}`);

    // Fetch excess available numbers (oldest first, to keep newest)
    const { data: excessNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')
      .order('created_at', { ascending: true }) // Oldest first
      .limit(metrics.excessCount);

    if (fetchError) {
      console.error('[CLEANUP] ERROR: Failed to fetch excess numbers:', fetchError);
      return { success: false, numbersReleased: 0, error: 'Failed to fetch excess numbers' };
    }

    if (!excessNumbers || excessNumbers.length === 0) {
      console.log('[CLEANUP] No excess numbers found to release');
      return { success: true, numbersReleased: 0 };
    }

    console.log(`[CLEANUP] Found ${excessNumbers.length} excess numbers to potentially release`);

    let numbersReleased = 0;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[CLEANUP] ERROR: Missing Twilio credentials');
      return { success: false, numbersReleased: 0, error: 'Missing Twilio credentials' };
    }

    const client = Twilio(accountSid, authToken);

    for (const number of excessNumbers) {
      // Skip protected system number
      if (systemPhoneNumber && number.phone_number === systemPhoneNumber) {
        console.log(`[PROTECTED] Skipping protected system phone: ${number.phone_number}`);
        continue;
      }

      console.log(`[CLEANUP] Releasing excess number: ${number.phone_number} (SID: ${number.twilio_sid})`);

      try {
        // Remove from Messaging Service if attached
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (messagingServiceSid) {
          try {
            await client.messaging.v1.services(messagingServiceSid)
              .phoneNumbers(number.twilio_sid)
              .remove();
            console.log(`[CLEANUP] Removed from Messaging Service`);
          } catch (msError) {
            console.warn(`[CLEANUP] Failed to remove from Messaging Service (continuing):`, msError);
          }
        }

        // Release from Twilio
        await client.incomingPhoneNumbers(number.twilio_sid).remove();
        console.log(`[CLEANUP] Released from Twilio`);

        // Delete from database
        const { error: deleteError } = await supabase
          .from('twilio_numbers')
          .delete()
          .eq('id', number.id);

        if (deleteError) {
          console.error(`[CLEANUP] ERROR: Failed to delete from database:`, deleteError);
        } else {
          console.log(`[CLEANUP] Deleted from database`);
          numbersReleased++;
        }
      } catch (releaseError: any) {
        console.error(`[CLEANUP] ERROR: Failed to release number ${number.phone_number}:`, releaseError);
        // Continue with next number
      }
    }

    console.log(`[CLEANUP] Released ${numbersReleased} excess numbers`);
    console.log('[CLEANUP] ========== END EXCESS INVENTORY CLEANUP ==========');
    return { success: true, numbersReleased };

  } catch (error: any) {
    console.error('[CLEANUP] EXCEPTION: Exception during cleanup');
    console.error('[CLEANUP] EXCEPTION Details:', JSON.stringify(error, null, 2));
    console.error('[CLEANUP] ========== END EXCESS INVENTORY CLEANUP (EXCEPTION) ==========');
    return { success: false, numbersReleased: 0, error: error.message };
  }
}
