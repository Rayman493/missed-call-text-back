'use server'

import { createClient } from '@supabase/supabase-js'
import { getProvisioningStatus, retryProvisioning } from '@/lib/twilio-provisioning-service'

/**
 * Server action to reconcile warm numbers
 * Keeps the admin secret server-side, never exposed to browser
 */
export async function reconcileWarmNumbers() {
  const adminSecret = process.env.ADMIN_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'

  if (!adminSecret) {
    return { success: false, error: 'Admin secret not configured' }
  }

  try {
    const response = await fetch(`${appUrl}/api/admin/reconcile-warm-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'Reconciliation failed' }
    }

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Reconciliation failed' }
  }
}

/**
 * Server action to get warm inventory stats
 */
export async function getWarmInventoryStats() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return { success: false, error: 'Supabase credentials not configured' }
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Available: status='available', business_id IS NULL, sms_status='ready'
    const { data: available } = await supabase
      .from('twilio_numbers')
      .select('id')
      .is('business_id', null)
      .eq('status', 'available')
      .eq('sms_status', 'ready')

    // Assigned: status='assigned'
    const { data: assigned } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'assigned')

    // Failed: status='failed'
    const { data: failed } = await supabase
      .from('twilio_numbers')
      .select('id')
      .eq('status', 'failed')

    return {
      success: true,
      stats: {
        availableCount: available?.length || 0,
        assignedCount: assigned?.length || 0,
        failedCount: failed?.length || 0,
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get stats' }
  }
}

/**
 * Server action to get provisioning status for a business
 */
export async function getBusinessProvisioningStatus(businessId: string) {
  try {
    const status = await getProvisioningStatus(businessId)
    
    if (!status) {
      return { success: false, error: 'Business not found' }
    }
    
    return { success: true, data: status }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get provisioning status' }
  }
}

/**
 * Server action to retry provisioning for a business
 */
export async function retryBusinessProvisioning(businessId: string) {
  try {
    const result = await retryProvisioning(businessId)
    
    return result
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to retry provisioning' }
  }
}
