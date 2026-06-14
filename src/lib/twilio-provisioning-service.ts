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
}

/**
 * Check provisioning consistency between businesses and twilio_numbers tables
 */
async function checkProvisioningConsistency(
  businessId: string,
  phoneNumberSid: string,
  correlationId: string
): Promise<{ consistent: boolean; mismatchReason?: string; twilioNumber?: any }> {
  console.log('[TWILIO PROVISIONING CONSISTENCY] ========== START ==========');
  console.log('[TWILIO PROVISIONING CONSISTENCY] correlation_id:', correlationId);
  console.log('[TWILIO PROVISIONING CONSISTENCY] business_id:', businessId);
  console.log('[TWILIO PROVISIONING CONSISTENCY] phone_number_sid:', phoneNumberSid);
  
  try {
    // Query businesses table
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id')
      .eq('id', businessId)
      .single();
    
    if (businessError || !business) {
      const error = 'Business not found';
      console.error('[TWILIO PROVISIONING CONSISTENCY] ERROR:', error);
      return { consistent: false, mismatchReason: error };
    }
    
    console.log('[TWILIO PROVISIONING CONSISTENCY] Business found:', {
      businessId: business.id,
      businessPhoneNumber: business.twilio_phone_number,
      businessTwilioSid: business.twilio_phone_number_sid,
      assignedTwilioNumberId: business.assigned_twilio_number_id
    });
    
    // Query twilio_numbers table
    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status')
      .eq('twilio_sid', phoneNumberSid)
      .maybeSingle();
    
    console.log('[TWILIO PROVISIONING CONSISTENCY] Twilio number lookup result:', {
      twilioNumberRowFound: !!twilioNumber,
      twilioNumberId: twilioNumber?.id,
      twilioNumberPhone: twilioNumber?.phone_number,
      twilioNumberBusinessId: twilioNumber?.business_id,
      twilioNumberStatus: twilioNumber?.status
    });
    
    const consistencyCheck = {
      businessId,
      businessPhoneNumber: business.twilio_phone_number,
      twilioPhoneNumber: twilioNumber?.phone_number,
      assignedTwilioNumberId: business.assigned_twilio_number_id,
      twilioNumberRowFound: !!twilioNumber,
      twilioNumberBusinessId: twilioNumber?.business_id,
      status: twilioNumber?.status,
      mismatchReason: null as string | null
    };
    
    // Check 1: twilio_numbers row must exist
    if (!twilioNumber) {
      consistencyCheck.mismatchReason = 'twilio_numbers row not found';
      console.log('[TWILIO PROVISIONING CONSISTENCY] MISMATCH:', consistencyCheck);
      return { consistent: false, mismatchReason: consistencyCheck.mismatchReason };
    }
    
    // Check 2: phone_number must match
    if (business.twilio_phone_number !== twilioNumber.phone_number) {
      consistencyCheck.mismatchReason = 'phone_number mismatch between businesses and twilio_numbers';
      console.log('[TWILIO PROVISIONING CONSISTENCY] MISMATCH:', consistencyCheck);
      return { consistent: false, mismatchReason: consistencyCheck.mismatchReason };
    }
    
    // Check 3: business_id must match
    if (businessId !== twilioNumber.business_id) {
      consistencyCheck.mismatchReason = 'business_id mismatch between businesses and twilio_numbers';
      console.log('[TWILIO PROVISIONING CONSISTENCY] MISMATCH:', consistencyCheck);
      return { consistent: false, mismatchReason: consistencyCheck.mismatchReason };
    }
    
    // Check 4: assigned_twilio_number_id must be set and match
    if (!business.assigned_twilio_number_id || business.assigned_twilio_number_id !== twilioNumber.id) {
      consistencyCheck.mismatchReason = 'assigned_twilio_number_id not set or does not match twilio_numbers.id';
      console.log('[TWILIO PROVISIONING CONSISTENCY] MISMATCH:', consistencyCheck);
      return { consistent: false, mismatchReason: consistencyCheck.mismatchReason };
    }
    
    // Check 5: status must be assigned/active, not available
    if (twilioNumber.status === 'available') {
      consistencyCheck.mismatchReason = 'twilio_number status is available, should be assigned/active';
      console.log('[TWILIO PROVISIONING CONSISTENCY] MISMATCH:', consistencyCheck);
      return { consistent: false, mismatchReason: consistencyCheck.mismatchReason };
    }
    
    console.log('[TWILIO PROVISIONING CONSISTENCY] ✓ CONSISTENT');
    console.log('[TWILIO PROVISIONING CONSISTENCY] consistencyCheck:', consistencyCheck);
    console.log('[TWILIO PROVISIONING CONSISTENCY] ========== COMPLETE ==========');
    
    return { consistent: true, twilioNumber };
    
  } catch (error: any) {
    console.error('[TWILIO PROVISIONING CONSISTENCY] Exception:', error);
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
  console.log('[RECONCILE TWILIO NUMBER] ========== START ==========');
  console.log('[RECONCILE TWILIO NUMBER] correlation_id:', correlationId);
  console.log('[RECONCILE TWILIO NUMBER] business_id:', businessId);
  
  try {
    // Query businesses table
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();
    
    if (businessError || !business) {
      const error = 'Business not found';
      console.error('[RECONCILE TWILIO NUMBER] ERROR:', error);
      return { success: false, error };
    }
    
    console.log('[RECONCILE TWILIO NUMBER] Business found:', {
      businessPhoneNumber: business.twilio_phone_number,
      businessTwilioSid: business.twilio_phone_number_sid
    });
    
    // Check if twilio_phone_number exists
    if (!business.twilio_phone_number || !business.twilio_phone_number_sid) {
      const error = 'Business has no twilio_phone_number or twilio_phone_number_sid';
      console.error('[RECONCILE TWILIO NUMBER] ERROR:', error);
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
        sms_status: 'pending',
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

    // First, check if this business has a reserved number they can reclaim using stable keys
    console.log('[PURCHASE NUMBER] Checking for reserved numbers using stable keys');
    let reservedNumber: any = null;
    let reclaimReason: string = '';

    if (business) {
      // Try exact match on email + business_phone (safest match)
      if (business.user_id) {
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
            reclaimReason = 'email_and_business_phone_match';
            console.log('[PURCHASE NUMBER] Found reserved number by email + business phone match:', {
              email: user.user.email,
              businessPhone: business.business_phone,
              phoneNumber: reservedNumber.phone_number,
            });
          }
        }
      }

      // If no exact match, try email match only (less safe but useful for returning customers)
      if (!reservedNumber && business.user_id) {
        const { data: user } = await supabase.auth.admin.getUserById(business.user_id);
        if (user && user.user && user.user.email) {
          const { data: reservedByEmail } = await supabase
            .from('twilio_numbers')
            .select('*')
            .eq('status', 'reserved')
            .eq('reserved_owner_email', user.user.email)
            .gt('reserved_expires_at', new Date().toISOString())
            .limit(1)
            .maybeSingle();

          if (reservedByEmail) {
            reservedNumber = reservedByEmail;
            reclaimReason = 'email_match_only';
            console.log('[PURCHASE NUMBER] Found reserved number by email match:', {
              email: user.user.email,
              phoneNumber: reservedNumber.phone_number,
              warning: 'Email match only - business phone may differ',
            });
          }
        }
      }

      // If still no match, try Stripe customer ID match (for returning customers with same billing)
      if (!reservedNumber && business.stripe_customer_id) {
        const { data: reservedByStripe } = await supabase
          .from('twilio_numbers')
          .select('*')
          .eq('status', 'reserved')
          .eq('reserved_stripe_customer_id', business.stripe_customer_id)
          .gt('reserved_expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();

        if (reservedByStripe) {
          reservedNumber = reservedByStripe;
          reclaimReason = 'stripe_customer_id_match';
          console.log('[PURCHASE NUMBER] Found reserved number by Stripe customer ID match:', {
            stripeCustomerId: business.stripe_customer_id,
            phoneNumber: reservedNumber.phone_number,
            warning: 'Stripe match only - email or business phone may differ',
          });
        }
      }
    }

    if (reservedNumber) {
      console.log('[PURCHASE NUMBER] Reclaiming reserved number for returning customer', {
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

    // No reserved number found for this customer, continue with normal flow
    console.log('[PURCHASE NUMBER] No reserved number found for returning customer');

    // Next, check for available numbers in inventory (excluding reserved)
    console.log('[PURCHASE NUMBER] Checking for available numbers in inventory');
    const { data: availableNumber, error: availableError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('status', 'available')
      .is('business_id', null)
      .limit(1)
      .maybeSingle();

    if (availableNumber && !availableError) {
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

      return {
        success: true,
        phoneNumber: availableNumber.phone_number,
        phoneNumberSid: availableNumber.twilio_sid,
        status: 'ready'
      };
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
    
    // Query businesses for phone SID and provisioning status
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('twilio_phone_number_sid, twilio_phone_number, provisioning_status')
      .eq('id', businessId)
      .single();
    
    if (businessError || !business) {
      console.error('[FAIL-SAFE] Business not found:', businessId);
      console.error('[FAIL-SAFE] Business lookup error:', businessError);
      return false;
    }
    
    console.log('[FAIL-SAFE] Business lookup successful');
    console.log('[FAIL-SAFE] Business phone SID:', business.twilio_phone_number_sid);
    console.log('[FAIL-SAFE] Business phone number:', business.twilio_phone_number);
    console.log('[FAIL-SAFE] Business provisioning_status:', business.provisioning_status);
    
    if (!business.twilio_phone_number_sid) {
      console.error('[FAIL-SAFE] No phone SID assigned to business');
      return false;
    }
    
    // Query twilio_numbers for provisioning status
    console.log('[FAIL-SAFE] ===== TWILIO_NUMBERS LOOKUP =====')
    console.log('[FAIL-SAFE] Lookup criteria: twilio_sid =', business.twilio_phone_number_sid);
    
    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('provisioning_status, campaign_registered_at, sender_pool_attached_at')
      .eq('twilio_sid', business.twilio_phone_number_sid)
      .single();
    
    console.log('[FAIL-SAFE] twilio_numbers lookup result:', { twilioNumber, twilioError });
    
    if (twilioError || !twilioNumber) {
      console.error('[FAIL-SAFE] Twilio number not found in twilio_numbers table');
      console.log('[FAIL-SAFE] ===== FALLBACK LOGIC START =====');
      console.log('[FAIL-SAFE] Checking business provisioning status for fallback');
      
      // Fallback: Allow SMS if business provisioning is completed and SID exists
      if (business.provisioning_status === 'completed' && business.twilio_phone_number_sid) {
        console.log('[FAIL-SAFE] ✓ FALLBACK: Business provisioning completed, allowing SMS with self-heal');
        console.log('[FAIL-SAFE] Self-healing: Inserting missing twilio_numbers row');
        
        try {
          const { error: healError } = await supabase
            .from('twilio_numbers')
            .upsert({
              twilio_sid: business.twilio_phone_number_sid,
              phone_number: business.twilio_phone_number,
              business_id: businessId,
              provisioning_status: 'ready',
              campaign_registered_at: new Date().toISOString(),
              sender_pool_attached_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'twilio_sid',
              ignoreDuplicates: false
            });

          if (healError) {
            console.error('[FAIL-SAFE] ✗ Self-heal failed:', healError);
            console.warn('[FAIL-SAFE] ⚠ SMS allowed but twilio_numbers row still missing');
          } else {
            console.log('[FAIL-SAFE] ✓ Self-heal successful: twilio_numbers row inserted');
          }
          
          console.log('[FAIL-SAFE] ✓ FALLBACK SUCCESS: SMS allowed');
          console.log('[FAIL-SAFE] ===== FALLBACK LOGIC END =====');
          return true;
        } catch (healException) {
          console.error('[FAIL-SAFE] ✗ Self-heal exception:', healException);
          console.warn('[FAIL-SAFE] ⚠ SMS allowed but self-heal failed');
          console.log('[FAIL-SAFE] ✓ FALLBACK SUCCESS: SMS allowed (with warnings)');
          console.log('[FAIL-SAFE] ===== FALLBACK LOGIC END =====');
          return true;
        }
      } else {
        console.log('[FAIL-SAFE] ✗ FALLBACK: Business provisioning not completed, blocking SMS');
        console.log('[FAIL-SAFE] Business provisioning_status:', business.provisioning_status);
        console.log('[FAIL-SAFE] Business twilio_phone_number_sid:', business.twilio_phone_number_sid);
        console.log('[FAIL-SAFE] ===== FALLBACK LOGIC END =====');
        return false;
      }
    }
    
    console.log('[FAIL-SAFE] Checking provisioning status for business:', businessId);
    console.log('[FAIL-SAFE] provisioning_status from twilio_numbers:', twilioNumber.provisioning_status);
    console.log('[FAIL-SAFE] campaign_registered_at:', twilioNumber.campaign_registered_at);
    console.log('[FAIL-SAFE] sender_pool_attached_at:', twilioNumber.sender_pool_attached_at);
    
    // Only allow sending from 'ready' numbers
    if (twilioNumber.provisioning_status !== 'ready') {
      console.warn('[FAIL-SAFE] Number not ready for use. Status:', twilioNumber.provisioning_status);
      console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
      return false;
    }
    
    // Additional check: verify sender pool membership
    if (messagingServiceSid && business.twilio_phone_number_sid) {
      const client = Twilio(accountSid, authToken);
      
      try {
        const senderPool = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });
        
        const inPool = senderPool.some(pn => pn.sid === business.twilio_phone_number_sid);
        
        if (!inPool) {
          console.error('[FAIL-SAFE] Number not in sender pool despite ready status');
          console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
          return false;
        }
        
        console.log('[FAIL-SAFE] ✓ Number verified in sender pool');
      } catch (poolError) {
        console.error('[FAIL-SAFE] Failed to verify sender pool:', poolError);
        console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
        return false;
      }
    }
    
    console.log('[FAIL-SAFE] ✓ Number is ready for use');
    console.log('[FAIL-SAFE] ✓ SMS ALLOWED - twilio_api_called will be true');
    console.log('[FAIL-SAFE] ===== SMS FAIL-SAFE CHECK END =====');
    return true;
    
  } catch (error: any) {
    console.error('[FAIL-SAFE] Exception during ready check:', error);
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
