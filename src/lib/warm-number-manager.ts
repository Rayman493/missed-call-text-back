/**
 * Warm Number Manager
 * Lightweight automatic warm-number replenishment for onboarding reliability
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const MIN_AVAILABLE_WARM_NUMBERS = 2;

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
}

/**
 * Get count of available warm numbers
 * Counts numbers with status='available' OR 'active' (legacy), business_id IS NULL, sms_status='ready' OR 'pending' (legacy)
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
      .or('status.eq.available,status.eq.active')
      .or('sms_status.eq.ready,sms_status.eq.pending');

    if (error) {
      console.error('[Warm Inventory] Error fetching available warm numbers:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`[Warm Inventory] Available warm numbers: ${count} (legacy compatibility mode active)`);
    return count;
  } catch (error) {
    console.error('[Warm Inventory] Exception fetching available warm numbers:', error);
    return 0;
  }
}

/**
 * Get comprehensive warm number statistics
 */
export async function getWarmNumberStats(): Promise<WarmNumberStats> {
  if (!supabase) {
    console.error('[Warm Inventory] Supabase client not configured');
    return {
      availableCount: 0,
      assignedCount: 0,
      failedCount: 0,
      quarantinedCount: 0,
    };
  }

  try {
    const { data: available } = await supabase
      .from('twilio_numbers')
      .select('id')
      .is('business_id', null)
      .or('status.eq.available,status.eq.active')
      .or('sms_status.eq.ready,sms_status.eq.pending');

    const { data: assigned } = await supabase
      .from('twilio_numbers')
      .select('id')
      .or('status.eq.assigned,status.eq.active')
      .not('business_id', 'is', null);

    const { data: failed } = await supabase
      .from('twilio_numbers')
      .select('id')
      .or('status.eq.failed,status.eq.error');

    const { data: quarantined } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'quarantined');

    return {
      availableCount: available?.length || 0,
      assignedCount: assigned?.length || 0,
      failedCount: failed?.length || 0,
      quarantinedCount: quarantined?.length || 0,
    };
  } catch (error) {
    console.error('[Warm Inventory] Exception fetching warm number stats:', error);
    return {
      availableCount: 0,
      assignedCount: 0,
      failedCount: 0,
      quarantinedCount: 0,
    };
  }
}

/**
 * Provision a new warm number
 * Buys local Twilio number, configures webhooks, adds to Messaging Service, stores as available
 */
export async function provisionWarmNumber(): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
  console.log('[Warm Inventory] Starting warm number provisioning...');

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
 */
export async function ensureWarmNumberMinimum(): Promise<{ success: boolean; numbersAdded: number; availableBefore: number; availableAfter: number }> {
  console.log('[Warm Inventory] Checking warm number minimum...');

  const availableBefore = await getAvailableWarmNumberCount();
  console.log(`[Warm Inventory] Available before: ${availableBefore}`);

  if (availableBefore >= MIN_AVAILABLE_WARM_NUMBERS) {
    console.log('[Warm Inventory] Minimum already satisfied, no action needed');
    return {
      success: true,
      numbersAdded: 0,
      availableBefore,
      availableAfter: availableBefore,
    };
  }

  const numbersNeeded = MIN_AVAILABLE_WARM_NUMBERS - availableBefore;
  console.log(`[Warm Inventory] Need to provision ${numbersNeeded} warm number(s)`);

  let numbersAdded = 0;
  let lastError: string | undefined;

  for (let i = 0; i < numbersNeeded; i++) {
    console.log(`[Warm Inventory] Provisioning warm number ${i + 1} of ${numbersNeeded}...`);
    const result = await provisionWarmNumber();

    if (result.success) {
      numbersAdded++;
      console.log(`[Warm Inventory] Successfully provisioned warm number ${numbersAdded}`);
    } else {
      console.error(`[Warm Inventory] Failed to provision warm number ${i + 1}:`, result.error);
      lastError = result.error;
      // Continue trying to provision remaining numbers
    }
  }

  const availableAfter = await getAvailableWarmNumberCount();
  console.log(`[Warm Inventory] Available after: ${availableAfter}`);

  const success = numbersAdded === numbersNeeded;
  
  if (success) {
    console.log(`[Warm Inventory] Replenish complete: added ${numbersAdded} number(s)`);
  } else {
    console.error(`[Warm Inventory] Replenish partially failed: added ${numbersAdded}/${numbersNeeded} number(s)`);
    if (lastError) {
      console.error(`[Warm Inventory] Last error: ${lastError}`);
    }
  }

  return {
    success,
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
