import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LEASE_TIMEOUT_MINUTES = 15

export interface LeaseClaim {
  recordId: string
  claimedAt: string
}

export interface LeaseClaimResult {
  success: boolean
  claim?: LeaseClaim
}

/**
 * Atomically claim a meeting record for processing using a lease mechanism.
 * Only succeeds if processing_started_at is NULL or stale (older than 15 minutes).
 * 
 * @param recordId - The meeting record ID to claim
 * @returns LeaseClaimResult with success status and claim details if successful
 */
export async function claimMeetingProcessingLease(recordId: string): Promise<LeaseClaimResult> {
  const now = new Date()
  const nowIso = now.toISOString()
  const staleThreshold = new Date(now.getTime() - LEASE_TIMEOUT_MINUTES * 60 * 1000).toISOString()
  
  const { data: claimed, error: claimError } = await supabase
    .from('meeting_records')
    .update({ processing_started_at: nowIso })
    .eq('id', recordId)
    .or(`processing_started_at.is.null,processing_started_at.lte.${staleThreshold}`)
    .select('id, processing_started_at')
    .single()
  
  if (claimError || !claimed) {
    return { success: false }
  }
  
  return { 
    success: true, 
    claim: { 
      recordId: claimed.id, 
      claimedAt: claimed.processing_started_at 
    } 
  }
}

/**
 * Release a meeting processing lease, ensuring ownership safety.
 * Only clears the lease if the current processing_started_at matches the claimed timestamp.
 * This prevents a stale worker from clearing a newer worker's reclaimed lease.
 * 
 * @param recordId - The meeting record ID to release
 * @param claimedAt - The timestamp when the lease was claimed (from claim result)
 * @returns true if the lease was released, false if it was already cleared or owned by another worker
 */
export async function releaseMeetingProcessingLease(recordId: string, claimedAt: string): Promise<boolean> {
  const { error } = await supabase
    .from('meeting_records')
    .update({ processing_started_at: null })
    .eq('id', recordId)
    .eq('processing_started_at', claimedAt)
  
  // If no rows were updated, the lease was already cleared or owned by another worker
  return !error
}
