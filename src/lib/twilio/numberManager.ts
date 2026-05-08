import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';
import { validateTwilioForVoice } from './env';

// Validate Twilio environment for voice operations
const voiceValidation = validateTwilioForVoice();
if (!voiceValidation.isValid) {
  console.error('[Number Manager] Twilio validation failed:', voiceValidation.error);
}

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

// Initialize Supabase client for DB operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TwilioNumber {
  id: string;
  business_id: string | null;
  phone_number: string;
  twilio_sid: string;
  number_type: string;
  status: string;
  sms_status: string | null;
  assigned_at: string | null;
  released_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ProvisionResult {
  success: boolean;
  twilioNumber?: TwilioNumber;
  error?: string;
}

interface ReleaseResult {
  success: boolean;
  error?: string;
}

/**
 * Provision a Twilio phone number for a business
 */
export async function provisionNumberForBusiness(businessId: string): Promise<ProvisionResult> {
  // Check if shared mode is explicitly enabled
  const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
  
  if (isSharedModeEnabled()) {
    const sharedNumber = getSharedTwilioNumber()
    console.log('[Twilio Number Manager] Shared mode enabled - using shared toll-free number', sharedNumber)
    console.log('[Twilio Number Manager] Shared mode enabled - NO new number purchases allowed')
    
    // In shared mode, we don't purchase numbers - we just return success with shared number
    return { 
      success: true, 
      error: 'Shared mode enabled - no provisioning needed',
      twilioNumber: {
        id: 'SHARED_MODE',
        business_id: businessId,
        phone_number: sharedNumber,
        twilio_sid: 'SHARED_MODE',
        number_type: 'toll_free',
        status: 'active',
        sms_status: 'active',
        assigned_at: new Date().toISOString(),
        released_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
  }

  console.log('[Twilio Number Manager] Shared mode disabled - proceeding with local number provisioning')
  
  if (!accountSid || !authToken) {
    console.error('[Twilio Number Manager] Credentials missing');
    return { success: false, error: 'Twilio credentials missing' };
  }

  const client = Twilio(accountSid, authToken);

  try {
    console.log('[Twilio Number Manager] Provisioning number for business:', businessId);

    // Load business from Supabase
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, assigned_twilio_number_id, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      console.error('[Twilio Number Manager] Business not found:', businessId);
      return { success: false, error: 'Business not found' };
    }

    // Idempotency: If business already has an active assigned number, return it
    if (business.assigned_twilio_number_id) {
      console.log('[Twilio Number Manager] Business already has assigned number:', business.assigned_twilio_number_id);
      
      const { data: existingNumber } = await supabase
        .from('twilio_numbers')
        .select('*')
        .eq('id', business.assigned_twilio_number_id)
        .eq('status', 'active')
        .single();

      if (existingNumber) {
        console.log('[Twilio Number Manager] Returning existing active number:', existingNumber.phone_number);
        console.log('[Twilio Number Manager] Provisioning: Using existing active number for business:', businessId);
        return { success: true, twilioNumber: existingNumber };
      }
    }

    console.log('[Twilio Number Manager] Provisioning: Purchasing new Twilio number for business:', businessId);
    console.log('[Twilio Number Manager] Searching for available Twilio number');

    // Search for available US local numbers with voice + SMS enabled
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        voiceEnabled: true,
        smsEnabled: true,
        limit: 1,
      });

    if (!availableNumbers || availableNumbers.length === 0) {
      console.error('[Twilio Number Manager] No available numbers found');
      return { success: false, error: 'No available Twilio numbers' };
    }

    const numberToPurchase = availableNumbers[0];
    console.log('[Twilio Number Manager] Selected available number:', numberToPurchase.phoneNumber);

    // Purchase the number
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: 'https://replyflowhq.com/api/twilio/voice',
      smsUrl: 'https://replyflowhq.com/api/twilio/incoming-sms',
    });

    console.log('[Twilio Number Manager] Provisioning: Successfully purchased number:', purchasedNumber.phoneNumber, 'for business:', businessId);
    console.log('[Twilio Number Manager] Purchased number:', purchasedNumber.phoneNumber, 'SID:', purchasedNumber.sid);

    // Insert into twilio_numbers table
    const { data: twilioNumber, error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        business_id: businessId,
        phone_number: purchasedNumber.phoneNumber,
        twilio_sid: purchasedNumber.sid,
        number_type: 'voice',
        status: 'active',
        sms_status: 'pending',
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !twilioNumber) {
      console.error('[Twilio Number Manager] Failed to insert twilio_number record:', insertError);
      // Attempt to release the number from Twilio since we couldn't save it
      try {
        await client.incomingPhoneNumbers(purchasedNumber.sid).remove();
        console.log('[Twilio Number Manager] Cleaned up Twilio number after DB insert failure');
      } catch (cleanupError) {
        console.error('[Twilio Number Manager] Failed to cleanup Twilio number:', cleanupError);
      }
      return { success: false, error: 'Failed to save number to database' };
    }

    console.log('[Twilio Number Manager] Inserted twilio_number record:', twilioNumber.id);

    // Update businesses table
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        assigned_twilio_number_id: twilioNumber.id,
        twilio_phone_number: purchasedNumber.phoneNumber,
        twilio_phone_number_sid: purchasedNumber.sid,
      })
      .eq('id', businessId);

    if (updateError) {
      console.error('[Twilio Number Manager] Failed to update business:', updateError);
      // Don't fail - the number is provisioned and saved, just the business update failed
    } else {
      console.log('[Twilio Number Manager] Updated business with assigned number');
    }

    console.log('[Twilio Number Manager] Provisioning complete for business:', businessId);
    return { success: true, twilioNumber };
  } catch (error) {
    console.error('[Twilio Number Manager] Provisioning failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Release a Twilio phone number for a business
 */
export async function releaseNumberForBusiness(businessId: string): Promise<ReleaseResult> {
  if (!accountSid || !authToken) {
    console.error('[Twilio Number Manager] Credentials missing');
    return { success: false, error: 'Twilio credentials missing' };
  }

  const client = Twilio(accountSid, authToken);

  try {
    console.log('[Twilio Number Manager] Release: Starting number release for business:', businessId);
    console.log('[Twilio Number Manager] Releasing number for business:', businessId);

    // Find the active twilio_numbers row for this business
    const { data: twilioNumber, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .single();

    if (fetchError || !twilioNumber) {
      console.log('[Twilio Number Manager] Release: No active number found for business:', businessId);
      return { success: true }; // Success - nothing to release
    }

    if (twilioNumber.status === 'released') {
      console.log('[Twilio Number Manager] Number already released:', twilioNumber.id);
      return { success: true }; // Success - already released
    }

    console.log('[Twilio Number Manager] Found active number:', twilioNumber.phone_number, 'SID:', twilioNumber.twilio_sid);

    // Call Twilio to release the number
    try {
      console.log('[Twilio Number Manager] Release: Removing number from Twilio account:', twilioNumber.twilio_sid);
      await client.incomingPhoneNumbers(twilioNumber.twilio_sid).remove();
      console.log('[Twilio Number Manager] Release: Successfully released number from Twilio:', twilioNumber.twilio_sid);
      console.log('[Twilio Number Manager] Released number from Twilio:', twilioNumber.twilio_sid);
    } catch (twilioError) {
      console.error('[Twilio Number Manager] Release: Failed to release number from Twilio:', twilioError);
      console.error('[Twilio Number Manager] Failed to release number from Twilio:', twilioError);
      
      // Update last_error but don't throw (called from Stripe webhook)
      await supabase
        .from('twilio_numbers')
        .update({ last_error: twilioError instanceof Error ? twilioError.message : 'Twilio release failed' })
        .eq('id', twilioNumber.id);
      
      return { success: false, error: 'Failed to release number from Twilio' };
    }

    // Update twilio_numbers status
    const { error: updateError } = await supabase
      .from('twilio_numbers')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        business_id: null,
      })
      .eq('id', twilioNumber.id);

    if (updateError) {
      console.error('[Twilio Number Manager] Failed to update twilio_number status:', updateError);
      return { success: false, error: 'Failed to update number status' };
    }

    console.log('[Twilio Number Manager] Updated twilio_number status to released');

    // Clear businesses assigned_twilio_number_id
    const { error: businessUpdateError } = await supabase
      .from('businesses')
      .update({
        assigned_twilio_number_id: null,
        twilio_phone_number: null,
        twilio_phone_number_sid: null,
      })
      .eq('id', businessId);

    if (businessUpdateError) {
      console.error('[Twilio Number Manager] Failed to clear business assignment:', businessUpdateError);
      // Don't fail - the number is released from Twilio and marked as released
    } else {
      console.log('[Twilio Number Manager] Cleared business assignment');
    }

    console.log('[Twilio Number Manager] Release: Successfully completed release for business:', businessId);
    console.log('[Twilio Number Manager] Release complete for business:', businessId);
    return { success: true };
  } catch (error) {
    console.error('[Twilio Number Manager] Release failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Retry Twilio number provisioning for a business
 */
export async function retryNumberProvisioning(businessId: string): Promise<ProvisionResult> {
  console.log('[Twilio Number Manager] Retry: Starting retry provisioning for business:', businessId);
  console.log('[Twilio Number Manager] Retry provisioning for business:', businessId);
  
  // Check if shared mode is explicitly enabled
  const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
  
  if (isSharedModeEnabled()) {
    const sharedNumber = getSharedTwilioNumber()
    console.log('[Twilio Number Manager] Retry: Shared mode enabled - using shared toll-free number', sharedNumber)
    console.log('[Twilio Number Manager] Retry: Shared mode enabled - NO retry provisioning needed')
    
    return { 
      success: true, 
      error: 'Shared mode enabled - no retry provisioning needed',
      twilioNumber: {
        id: 'SHARED_MODE',
        business_id: businessId,
        phone_number: sharedNumber,
        twilio_sid: 'SHARED_MODE',
        number_type: 'toll_free',
        status: 'active',
        sms_status: 'active',
        assigned_at: new Date().toISOString(),
        released_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
  }
  
  console.log('[Twilio Number Manager] Retry: Shared mode disabled - proceeding with local number provisioning')
  
  const result = await provisionNumberForBusiness(businessId);
  
  if (result.success) {
    console.log('[Twilio Number Manager] Retry: Provisioning retry succeeded for business:', businessId);
    console.log('[Twilio Number Manager] Retry provisioning succeeded');
  } else {
    console.error('[Twilio Number Manager] Retry: Provisioning retry failed for business:', businessId, 'Error:', result.error);
    console.error('[Twilio Number Manager] Retry provisioning failed:', result.error);
  }
  
  return result;
}
