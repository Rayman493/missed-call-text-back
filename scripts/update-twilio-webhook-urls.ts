/**
 * Admin script to update existing Twilio numbers to use www.replyflowhq.com URL and POST method
 * 
 * This script updates all Twilio numbers to use:
 * - Voice webhook URL: https://www.replyflowhq.com/api/twilio/voice
 * - Voice method: POST
 * - Status callback URL: https://www.replyflowhq.com/api/twilio/voice-status
 * - Status callback method: POST
 * - SMS webhook URL: https://www.replyflowhq.com/api/twilio/incoming-sms
 * - SMS method: POST
 * 
 * Usage:
 * npx ts-node scripts/update-twilio-webhook-urls.ts
 */

import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.replyflowhq.com';

console.log('Using appUrl:', appUrl);

async function updateTwilioNumbers() {
  console.log('Starting Twilio webhook URL update...');
  
  const client = Twilio(accountSid, authToken);
  
  // Get all active Twilio numbers from the database
  const { data: twilioNumbers, error: dbError } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, twilio_sid, business_id')
    .eq('status', 'active')
    .not('twilio_sid', 'is', null);
  
  if (dbError) {
    console.error('Error fetching Twilio numbers from database:', dbError);
    process.exit(1);
  }
  
  if (!twilioNumbers || twilioNumbers.length === 0) {
    console.log('No active Twilio numbers found in database');
    return;
  }
  
  console.log(`Found ${twilioNumbers.length} active Twilio numbers to update`);
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const twilioNumber of twilioNumbers) {
    console.log(`\nUpdating number: ${twilioNumber.phone_number} (SID: ${twilioNumber.twilio_sid})`);
    
    try {
      // Update the Twilio number webhook URLs
      const updatedNumber = await client.incomingPhoneNumbers(twilioNumber.twilio_sid).update({
        voiceUrl: `${appUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${appUrl}/api/twilio/voice-status`,
        statusCallbackMethod: 'POST',
        smsUrl: `${appUrl}/api/twilio/incoming-sms`,
        smsMethod: 'POST',
      });
      
      console.log(`✓ Successfully updated ${twilioNumber.phone_number}`);
      console.log(`  Voice URL: ${updatedNumber.voiceUrl}`);
      console.log(`  Voice Method: ${updatedNumber.voiceMethod}`);
      console.log(`  Status Callback: ${updatedNumber.statusCallback}`);
      console.log(`  Status Callback Method: ${updatedNumber.statusCallbackMethod}`);
      console.log(`  SMS URL: ${updatedNumber.smsUrl}`);
      console.log(`  SMS Method: ${updatedNumber.smsMethod}`);
      
      successCount++;
    } catch (error: any) {
      console.error(`✗ Failed to update ${twilioNumber.phone_number}:`, error.message);
      failureCount++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total numbers: ${twilioNumbers.length}`);
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
}

updateTwilioNumbers()
  .then(() => {
    console.log('\nScript completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
