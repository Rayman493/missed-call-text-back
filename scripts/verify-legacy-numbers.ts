/**
 * Verification script for legacy Twilio numbers
 * Verifies specific Twilio SIDs against Twilio API
 * 
 * Run in production environment with TWILIO credentials configured
 */

import Twilio from "twilio";

// Get environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

// Target numbers to verify
const targetNumbers = [
  { phone: '+19124308655', sid: 'PN27e1d7af453607a159f5124280c1613d' },
  { phone: '+19452958740', sid: 'PNb58f2b9d046a63df8881248bea8774d9' }
];

async function verifyLegacyNumbers() {
  console.log('=== Legacy Number Verification ===');
  console.log('Target numbers:');
  targetNumbers.forEach(num => {
    console.log(`  - ${num.phone}: ${num.sid}`);
  });
  console.log('');

  if (!accountSid || !authToken) {
    console.error('ERROR: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured');
    console.error('This script must be run in production environment with credentials');
    return;
  }

  const client = Twilio(accountSid, authToken);

  // Verify each number against Twilio
  console.log('Verifying against Twilio API...\n');
  
  for (const target of targetNumbers) {
    console.log(`--- Verifying ${target.phone} (${target.sid}) ---`);
    
    try {
      // Check 1: Verify Twilio ownership
      console.log('  Check 1: Twilio ownership...');
      const twilioNumber = await client.incomingPhoneNumbers(target.sid).fetch();
      console.log(`    ✓ Number exists in Twilio account`);
      console.log(`    - Phone number: ${twilioNumber.phoneNumber}`);
      console.log(`    - Status: ${twilioNumber.status}`);
      console.log(`    - Voice URL: ${twilioNumber.voiceUrl || 'none'}`);
      console.log(`    - SMS URL: ${twilioNumber.smsUrl || 'none'}`);
      console.log(`    - Voice fallback URL: ${twilioNumber.voiceFallbackUrl || 'none'}`);
      console.log(`    - SMS fallback URL: ${twilioNumber.smsFallbackUrl || 'none'}`);
      console.log(`    - Status callback: ${twilioNumber.statusCallback || 'none'}`);
      
      // Check 2: Messaging service attachment
      console.log('  Check 2: Messaging service attachment...');
      if (messagingServiceSid) {
        const senderPool = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });
        const isInSenderPool = senderPool.some(pn => pn.sid === target.sid);
        
        if (isInSenderPool) {
          console.log(`    ✓ Number is attached to messaging service ${messagingServiceSid}`);
        } else {
          console.log(`    ✗ Number is NOT attached to messaging service ${messagingServiceSid}`);
        }
      } else {
        console.log(`    ℹ Messaging service not configured, skipping sender pool check`);
      }
      
      // Check 3: Active webhook configuration
      console.log('  Check 3: Active webhook configuration...');
      const hasActiveWebhooks = twilioNumber.voiceUrl || twilioNumber.smsUrl || 
                                twilioNumber.voiceFallbackUrl || twilioNumber.smsFallbackUrl ||
                                twilioNumber.statusCallback;
      if (hasActiveWebhooks) {
        console.log(`    ⚠ Number has active webhook configuration (may indicate production use)`);
      } else {
        console.log(`    ✓ No active webhook configuration`);
      }
      
      // Check 4: Account/subaccount info
      console.log('  Check 4: Account information...');
      console.log(`    - Account SID: ${twilioNumber.accountSid}`);
      console.log(`    - Friendly name: ${twilioNumber.friendlyName}`);
      
      console.log(`  ✓ Verification complete for ${target.phone}`);
      
    } catch (error: any) {
      if (error.code === 20404) {
        console.log(`  ✗ Number NOT found in Twilio account (may have been released)`);
      } else {
        console.log(`  ✗ Error verifying number: ${error.message}`);
        console.log(`  Error code: ${error.code}`);
      }
    }
    
    console.log('');
  }

  console.log('=== Verification Complete ===');
  console.log('');
  console.log('Recommendation:');
  console.log('If both numbers:');
  console.log('  - Do NOT exist in Twilio account (released) OR');
  console.log('  - Exist but have NO active webhooks AND');
  console.log('  - Are NOT attached to messaging service AND');
  console.log('  - Have NO production usage indicators');
  console.log('');
  console.log('Then it is SAFE to retire the corresponding database rows.');
}

verifyLegacyNumbers().catch(console.error);
