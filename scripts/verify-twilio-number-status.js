/**
 * Verification script to check twilio_numbers table status
 * 
 * This script verifies the repair was successful by checking:
 * - Specific number status
 * - Business assignment
 * - Assigned timestamp
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyTwilioNumberStatus() {
  console.log('Verifying twilio_numbers status...\n');

  // Check the specific number mentioned in the error log: +18177830134
  const phoneNumber = '+18177830134';
  
  const { data: record, error: fetchError } = await supabase
    .from('twilio_numbers')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();
  
  if (fetchError) {
    console.error('Error fetching record:', fetchError);
    process.exit(1);
  }
  
  if (!record) {
    console.error(`Record not found for phone number: ${phoneNumber}`);
    process.exit(1);
  }
  
  console.log('=== Database Record ===');
  console.log(`Phone: ${record.phone_number}`);
  console.log(`Business ID: ${record.business_id}`);
  console.log(`Status: ${record.status}`);
  console.log(`Assigned At: ${record.assigned_at}`);
  console.log(`Twilio SID: ${record.twilio_sid}`);
  console.log(`Provisioning Status: ${record.provisioning_status}`);
  console.log(`Created At: ${record.created_at}`);
  
  console.log('\n=== Verification Result ===');
  
  if (record.status === 'active') {
    console.log('✓ Status is correctly set to "active"');
  } else {
    console.log(`✗ Status is "${record.status}" (expected "active")`);
  }
  
  if (record.business_id) {
    console.log('✓ Business ID is set');
  } else {
    console.log('✗ Business ID is null');
  }
  
  if (record.assigned_at) {
    console.log('✓ Assigned timestamp is set');
  } else {
    console.log('✗ Assigned timestamp is null');
  }
  
  console.log('\n=== Summary ===');
  console.log(`Number ${phoneNumber} is ${record.status}`);
  console.log(`Assigned to business: ${record.business_id}`);
  console.log(`Assigned at: ${record.assigned_at}`);
}

verifyTwilioNumberStatus()
  .then(() => {
    console.log('\nVerification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
