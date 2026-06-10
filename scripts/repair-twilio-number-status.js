/**
 * Admin script to repair twilio_numbers status mismatch
 * 
 * This script repairs records where:
 * - business_id is not null (assigned to a business)
 * - status = 'available' (should be 'assigned' or 'active')
 * 
 * It will set status to 'active' for these records and log the changes.
 * 
 * Usage:
 * node scripts/repair-twilio-number-status.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  if (!supabaseUrl) console.error('- NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function repairTwilioNumberStatus() {
  console.log('Starting twilio_numbers status repair...');
  console.log('Supabase URL:', supabaseUrl);
  
  // Find all records where business_id is not null but status is 'available'
  const { data: mismatchedRecords, error: fetchError } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, business_id, status, assigned_at, created_at')
    .not('business_id', 'is', null)
    .eq('status', 'available');
  
  if (fetchError) {
    console.error('Error fetching mismatched records:', fetchError);
    process.exit(1);
  }
  
  if (!mismatchedRecords || mismatchedRecords.length === 0) {
    console.log('No mismatched records found');
    return;
  }
  
  console.log(`Found ${mismatchedRecords.length} mismatched records`);
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const record of mismatchedRecords) {
    console.log(`\nRepairing record: ${record.phone_number} (ID: ${record.id})`);
    console.log(`  Current status: ${record.status}`);
    console.log(`  Business ID: ${record.business_id}`);
    console.log(`  Assigned at: ${record.assigned_at}`);
    
    try {
      // Update the status to 'active'
      const { error: updateError } = await supabase
        .from('twilio_numbers')
        .update({
          status: 'active',
          // Ensure assigned_at is set if not already
          assigned_at: record.assigned_at || new Date().toISOString(),
        })
        .eq('id', record.id);
      
      if (updateError) {
        console.error(`✗ Failed to update ${record.phone_number}:`, updateError);
        failureCount++;
      } else {
        console.log(`✓ Successfully updated ${record.phone_number}`);
        console.log(`  New status: active`);
        successCount++;
      }
    } catch (error) {
      console.error(`✗ Failed to update ${record.phone_number}:`, error.message);
      failureCount++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total mismatched records: ${mismatchedRecords.length}`);
  console.log(`Successfully repaired: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
}

repairTwilioNumberStatus()
  .then(() => {
    console.log('\nScript completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
