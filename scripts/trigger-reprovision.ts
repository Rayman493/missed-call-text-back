/**
 * Trigger canonical provisioning workflow for ReplyFlowHQ Admin business
 * 
 * This script calls /api/business/trigger-provisioning with admin secret
 * to trigger canonical provisioning after clearing stale assignment.
 */

const triggerBusinessId = '4bd736a4-c55f-4451-8858-79e3380e8a1d';
const appUrl = 'http://localhost:3000';
const adminSecret = process.env.PROVISIONING_ADMIN_SECRET;

if (!adminSecret) {
  console.error('[REPROVISION] Missing PROVISIONING_ADMIN_SECRET environment variable');
  process.exit(1);
}

async function executeTriggerProvisioning() {
  console.log('[REPROVISION] ========== TRIGGERING CANONICAL PROVISIONING ==========');
  console.log('[REPROVISION] Business ID:', triggerBusinessId);
  console.log('[REPROVISION] App URL:', appUrl);

  try {
    const response = await fetch(`${appUrl}/api/business/trigger-provisioning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      } as HeadersInit,
      body: JSON.stringify({
        business_id: triggerBusinessId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[REPROVISION] Failed to trigger provisioning:', response.status, errorText);
      process.exit(1);
    }

    const result = await response.json();
    console.log('[REPROVISION] ✓ Provisioning triggered successfully');
    console.log('[REPROVISION] Result:', result);
    console.log('[REPROVISION] ========== PROVISIONING TRIGGERED ==========');
  } catch (error) {
    console.error('[REPROVISION] Error:', error);
    process.exit(1);
  }
}

executeTriggerProvisioning();
