/**
 * Standalone script to fix all Twilio voice webhook methods to POST
 * This script bypasses authentication and directly updates Twilio numbers
 * 
 * Usage: node scripts/fix-voice-webhook-method.js
 */

const { createClient } = require('@supabase/supabase-js');
const Twilio = require('twilio');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.replyflowhq.com';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing Supabase environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!twilioAccountSid || !twilioAuthToken) {
  console.error('ERROR: Missing Twilio environment variables');
  console.error('Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(80));
  console.log('FIX VOICE WEBHOOK METHOD SCRIPT');
  console.log('='.repeat(80));
  console.log('App URL:', appUrl);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Twilio Account:', twilioAccountSid);
  console.log('='.repeat(80));

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const twilio = Twilio(twilioAccountSid, twilioAuthToken);

  const voiceWebhookUrl = `${appUrl}/api/twilio/voice`;
  const voiceStatusWebhookUrl = `${appUrl}/api/twilio/voice-status`;
  const messagingWebhookUrl = `${appUrl}/api/twilio/incoming-sms`;

  console.log('Voice webhook URL:', voiceWebhookUrl);
  console.log('Voice status webhook URL:', voiceStatusWebhookUrl);
  console.log('Messaging webhook URL:', messagingWebhookUrl);
  console.log('='.repeat(80));

  try {
    // Fetch all businesses with Twilio numbers
    console.log('\n[STEP 1] Fetching businesses with Twilio numbers...');
    const { data: businesses, error: businessesError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, business_name')
      .not('twilio_phone_number_sid', 'is', null)
      .not('twilio_phone_number', 'is', null);

    if (businessesError) {
      console.error('ERROR: Failed to fetch businesses:', businessesError);
      process.exit(1);
    }

    console.log(`Found ${businesses.length} businesses with Twilio numbers`);
    console.log('='.repeat(80));

    const results = {
      total: businesses.length,
      fixed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    for (const business of businesses) {
      console.log(`\n[PROCESSING] ${business.business_name || business.id}`);
      console.log(`  Phone: ${business.twilio_phone_number}`);
      console.log(`  SID: ${business.twilio_phone_number_sid}`);

      try {
        // Fetch current Twilio number configuration
        console.log('  Fetching current configuration...');
        const currentNumber = await twilio.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch();

        console.log('  Current configuration:');
        console.log(`    Voice URL: ${currentNumber.voiceUrl}`);
        console.log(`    Voice Method: ${currentNumber.voiceMethod}`);
        console.log(`    SMS URL: ${currentNumber.smsUrl}`);
        console.log(`    SMS Method: ${currentNumber.smsMethod}`);

        // Check if already configured correctly
        if (currentNumber.voiceMethod === 'POST' && currentNumber.smsMethod === 'POST') {
          console.log('  ✓ Already configured with POST - skipping');
          results.skipped++;
          continue;
        }

        // Update Twilio number webhook configuration
        console.log('  Updating webhook configuration to POST...');
        const updatedNumber = await twilio.incomingPhoneNumbers(business.twilio_phone_number_sid).update({
          voiceUrl: voiceWebhookUrl,
          voiceMethod: 'POST',
          statusCallback: voiceStatusWebhookUrl,
          statusCallbackMethod: 'POST',
          smsUrl: messagingWebhookUrl,
          smsMethod: 'POST'
        });

        console.log('  ✓ Updated successfully');
        console.log('  New configuration:');
        console.log(`    Voice URL: ${updatedNumber.voiceUrl}`);
        console.log(`    Voice Method: ${updatedNumber.voiceMethod}`);
        console.log(`    SMS URL: ${updatedNumber.smsUrl}`);
        console.log(`    SMS Method: ${updatedNumber.smsMethod}`);

        results.fixed++;
      } catch (error) {
        console.error('  ✗ Failed:', error.message);
        results.failed++;
        results.errors.push({
          businessId: business.id,
          businessName: business.business_name,
          phoneNumber: business.twilio_phone_number,
          error: error.message
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    console.log(`Total businesses: ${results.total}`);
    console.log(`Fixed: ${results.fixed}`);
    console.log(`Skipped (already correct): ${results.skipped}`);
    console.log(`Failed: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log('\nERRORS:');
      results.errors.forEach((err, index) => {
        console.log(`  ${index + 1}. ${err.businessName || err.businessId}`);
        console.log(`     Phone: ${err.phoneNumber}`);
        console.log(`     Error: ${err.error}`);
      });
    }

    console.log('='.repeat(80));

    if (results.failed > 0) {
      console.log('\n⚠ Some numbers failed to update. Please review errors above.');
      process.exit(1);
    } else {
      console.log('\n✓ All Twilio numbers updated successfully!');
    }

  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    process.exit(1);
  }
}

main();
