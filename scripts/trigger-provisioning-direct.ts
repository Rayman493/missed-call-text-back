/**
 * Direct provisioning trigger for ReplyFlowHQ Admin business
 * 
 * This script directly calls the provisionTwilioNumber function instead of
 * going through the HTTP API endpoint to avoid URL configuration issues.
 */

const adminBusinessId = '4bd736a4-c55f-4451-8858-79e3380e8a1d';
const correlationId = `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

async function triggerProvisioning() {
  console.log('[PROVISIONING] ========== TRIGGERING DIRECT PROVISIONING ==========');
  console.log('[PROVISIONING] Business ID:', adminBusinessId);
  console.log('[PROVISIONING] Correlation ID:', correlationId);

  try {
    // Import the provisioning function
    const { provisionTwilioNumber } = await import('../src/lib/twilio');
    
    console.log('[PROVISIONING] Calling provisionTwilioNumber...');
    const result = await provisionTwilioNumber(adminBusinessId, correlationId);
    
    console.log('[PROVISIONING] ✓ Provisioning completed successfully');
    console.log('[PROVISIONING] Result:', {
      success: !!result,
      phoneNumber: result?.phoneNumber,
      phoneNumberSid: result?.phoneNumberSid,
      messagingServiceAttached: result?.messagingServiceAttached,
      messagingServiceError: result?.messagingServiceError,
      fromWarmInventory: result?.fromWarmInventory,
    });
    
    if (result?.phoneNumber) {
      console.log('[PROVISIONING] ✓ Phone number assigned:', result.phoneNumber);
    }
    
    if (result?.phoneNumberSid) {
      console.log('[PROVISIONING] ✓ Phone number SID:', result.phoneNumberSid);
    }
    
    console.log('[PROVISIONING] ========== PROVISIONING COMPLETE ==========');
  } catch (error) {
    console.error('[PROVISIONING] Error:', error);
    process.exit(1);
  }
}

triggerProvisioning();
