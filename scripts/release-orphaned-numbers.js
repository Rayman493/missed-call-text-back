#!/usr/bin/env node

// Script to safely release orphaned Twilio numbers
// Run with: node scripts/release-orphaned-numbers.js

const { createClient } = require('@supabase/supabase-js');
const Twilio = require('twilio');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

if (!supabaseUrl || !supabaseServiceKey || !twilioAccountSid || !twilioAuthToken) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const twilio = Twilio(twilioAccountSid, twilioAuthToken);

async function getOrphanedNumbers() {
  console.log('Fetching orphaned Twilio numbers...');
  
  const { data, error } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, phone_number_sid, created_at')
    .is('business_id', null)
    .eq('status', 'active')
    .order('created_at', 'desc');
  
  if (error) {
    console.error('Error fetching orphaned numbers:', error);
    return [];
  }
  
  console.log(`Found ${data?.length || 0} orphaned numbers`);
  return data || [];
}

async function releaseTwilioNumber(numberId, phoneNumber, phoneNumberSid) {
  console.log(`Releasing Twilio number: ${phoneNumber} (${numberId})`);
  
  try {
    // First update status in database to prevent new assignments
    const { error: updateError } = await supabase
      .from('twilio_numbers')
      .update({ 
        status: 'releasing',
        released_at: new Date().toISOString()
      })
      .eq('id', numberId);
    
    if (updateError) {
      console.error(`Failed to update status for ${phoneNumber}:`, updateError);
      return false;
    }
    
    // Release the number in Twilio
    const releaseResult = await twilio.incomingPhoneNumbers(numberId).remove();
    
    if (releaseResult) {
      console.log(`Successfully released ${phoneNumber} from Twilio`);
      
      // Delete from database after successful Twilio release
      const { error: deleteError } = await supabase
        .from('twilio_numbers')
        .delete()
        .eq('id', numberId);
      
      if (deleteError) {
        console.error(`Failed to delete ${phoneNumber} from database:`, deleteError);
        return false;
      }
      
      console.log(`Successfully deleted ${phoneNumber} from database`);
      return true;
    } else {
      console.error(`Failed to release ${phoneNumber} from Twilio:`, releaseResult);
      
      // Revert status in database
      await supabase
        .from('twilio_numbers')
        .update({ 
          status: 'active',
          released_at: null
        })
        .eq('id', numberId);
      
      return false;
    }
  } catch (error) {
    console.error(`Error releasing ${phoneNumber}:`, error);
    
    // Revert status in database
    await supabase
      .from('twilio_numbers')
      .update({ 
        status: 'active',
        released_at: null
      })
      .eq('id', numberId);
    
    return false;
  }
}

async function main() {
  const orphanedNumbers = await getOrphanedNumbers();
  
  if (orphanedNumbers.length === 0) {
    console.log('No orphaned numbers found');
    return;
  }
  
  console.log(`\nFound ${orphanedNumbers.length} orphaned numbers to release:`);
  orphanedNumbers.forEach((number, index) => {
    console.log(`${index + 1}. ${number.phone_number} (${number.id})`);
  });
  
  // Ask for confirmation before proceeding
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise((resolve) => {
    rl.question(`\nDo you want to release these ${orphanedNumbers.length} numbers? (y/N): `, resolve);
  });
  
  rl.close();
  
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Operation cancelled');
    return;
  }
  
  console.log('\nReleasing orphaned numbers...');
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const number of orphanedNumbers) {
    const success = await releaseTwilioNumber(number.id, number.phone_number, number.phone_number_sid);
    
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }
  
  console.log(`\nRelease complete:`);
  console.log(`✅ Successfully released: ${successCount} numbers`);
  console.log(`❌ Failed to release: ${failureCount} numbers`);
  
  if (failureCount > 0) {
    console.log('\nSome numbers failed to release. Check the logs above for details.');
    process.exit(1);
  }
  
  console.log('\nAll orphaned numbers released successfully!');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
