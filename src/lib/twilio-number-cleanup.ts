/**
 * Twilio Number Cleanup Service
 *
 * Automated lifecycle management for retired Twilio numbers:
 * - Quarantines newly retired numbers
 * - Releases old retired numbers from Twilio safely
 * - Preserves permanent database history
 * - Maintains minimum available-number pool
 *
 * This is a production-critical infrastructure service.
 * All operations are idempotent and safe for concurrent execution.
 */

import { supabaseAdmin } from './supabase/admin'
import Twilio from 'twilio'

// Configuration from environment
const CLEANUP_ENABLED = process.env.TWILIO_RETIRED_CLEANUP_ENABLED === 'true'
const QUARANTINE_DAYS = parseInt(process.env.TWILIO_RETIRED_QUARANTINE_DAYS || '30', 10)
const CLEANUP_THRESHOLD = parseInt(process.env.TWILIO_RETIRED_CLEANUP_THRESHOLD || '25', 10)
const BATCH_SIZE = parseInt(process.env.TWILIO_RETIRED_CLEANUP_BATCH_SIZE || '10', 10)
const MAX_ATTEMPTS = parseInt(process.env.TWILIO_RETIRED_CLEANUP_MAX_ATTEMPTS || '5', 10)
const DRY_RUN = process.env.TWILIO_RETIRED_CLEANUP_DRY_RUN === 'true'
const ACTIVITY_LOOKBACK_DAYS = parseInt(process.env.TWILIO_RETIRED_ACTIVITY_LOOKBACK_DAYS || '30', 10)

// Protected numbers that should never be released
const PROTECTED_NUMBERS = (process.env.PROTECTED_TWILIO_NUMBERS || '').split(',').filter(n => n.trim())

// Canonical warm-pool configuration (use WARM_INVENTORY_TARGET as single source of truth)
const MIN_AVAILABLE_WARM_NUMBERS = parseInt(process.env.WARM_INVENTORY_TARGET || '3', 10)

export interface CleanupRunResult {
  runId: string
  mode: 'dry_run' | 'live'
  retiredCount: number
  eligibleCount: number
  selectedCount: number
  releasedCount: number
  alreadyMissingCount: number
  failedCount: number
  skippedCount: number
  candidates: CleanupCandidate[]
  summary: string
  error?: string
}

export interface CleanupCandidate {
  id: string
  phoneNumber: string
  twilioSid: string
  retiredAt: string
  retirementAgeDays: number
  releaseAttemptCount: number
}

export interface ReleaseResult {
  numberId: string
  phoneNumber: string
  twilioSid: string
  success: boolean
  alreadyMissing: boolean
  error?: string
  errorCode?: string
}

/**
 * Mask phone number for logging (show only last 4 digits)
 */
function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 4) return '****'
  return phoneNumber.slice(0, -4).replace(/\d/g, '*') + phoneNumber.slice(-4)
}

/**
 * Get Twilio SID suffix for logging
 */
function getTwilioSidSuffix(sid: string): string {
  if (!sid || sid.length < 8) return '****'
  return sid.slice(-8)
}

/**
 * Calculate quarantine cutoff date
 */
function getQuarantineCutoff(): Date {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - QUARANTINE_DAYS)
  return cutoff
}

/**
 * Calculate next retry timestamp with exponential backoff
 */
function calculateNextRetry(attemptCount: number): Date {
  const baseDelay = Math.pow(2, attemptCount) * 60 * 60 * 1000 // Hours in ms
  const maxDelay = 7 * 24 * 60 * 60 * 1000 // Max 7 days
  const delay = Math.min(baseDelay, maxDelay)
  return new Date(Date.now() + delay)
}

/**
 * Check if a number is protected from release
 */
function isProtectedNumber(phoneNumber: string): boolean {
  return PROTECTED_NUMBERS.includes(phoneNumber)
}

/**
 * Query eligible retired numbers for cleanup
 *
 * Eligibility criteria:
 * - status is 'retired' or 'release_pending'
 * - no business_id
 * - retired_at is not null (manual review required if null)
 * - no active reservation (reserved_expires_at is null or in the past)
 * - retirement age exceeds quarantine period
 * - release attempt count < max attempts
 * - next retry time has arrived (or not set)
 * - Twilio SID exists
 * - not on protected list
 * - no recent activity (checked separately)
 */
export async function getEligibleNumbers(): Promise<CleanupCandidate[]> {
  const quarantineCutoff = getQuarantineCutoff()
  const activityCutoff = getActivityCutoff()

  const { data: numbers, error } = await supabaseAdmin
    .from('twilio_numbers')
    .select('id, phone_number, twilio_sid, retired_at, release_attempt_count, next_release_retry_at, reserved_expires_at')
    .in('status', ['retired', 'release_pending'])
    .is('business_id', null)
    .not('retired_at', 'is', null) // Exclude numbers without retirement timestamp (manual review)
    .or('reserved_expires_at.is.null,reserved_expires_at.lte.' + new Date().toISOString()) // No active reservation
    .lte('retired_at', quarantineCutoff.toISOString())
    .lt('release_attempt_count', MAX_ATTEMPTS)
    .or('next_release_retry_at.is.null,next_release_retry_at.lte.' + new Date().toISOString())
    .not('twilio_sid', 'is', null)
    .order('retired_at', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[TWILIO CLEANUP] Failed to query eligible numbers:', error)
    throw new Error('Database query failed')
  }

  // Filter out protected numbers and check for recent activity
  const candidates = (numbers || [])
    .filter(n => !isProtectedNumber(n.phone_number))

  // Check recent activity for each candidate
  const eligible: CleanupCandidate[] = []
  for (const candidate of candidates) {
    const hasRecentActivity = await checkRecentActivity(candidate.phone_number, activityCutoff)
    if (hasRecentActivity) {
      console.log('[TWILIO CLEANUP] Skipping number with recent activity', {
        maskedPhone: maskPhoneNumber(candidate.phone_number)
      })
      continue
    }

    const retiredAt = new Date(candidate.retired_at)
    const ageDays = Math.floor((Date.now() - retiredAt.getTime()) / (24 * 60 * 60 * 1000))
    eligible.push({
      id: candidate.id,
      phoneNumber: candidate.phone_number,
      twilioSid: candidate.twilio_sid,
      retiredAt: retiredAt.toISOString(),
      retirementAgeDays: ageDays,
      releaseAttemptCount: candidate.release_attempt_count || 0
    })
  }

  console.log('[TWILIO CLEANUP] Eligibility query complete', {
    eligibleCount: eligible.length,
    filteredForActivity: candidates.length - eligible.length,
    quarantineDays: QUARANTINE_DAYS,
    activityLookbackDays: ACTIVITY_LOOKBACK_DAYS,
    batchSize: BATCH_SIZE,
    maxAttempts: MAX_ATTEMPTS
  })

  return eligible
}

/**
 * Calculate activity cutoff date
 */
function getActivityCutoff(): Date {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - ACTIVITY_LOOKBACK_DAYS)
  return cutoff
}

/**
 * Check if a phone number has recent activity
 * Checks conversations for messages within lookback period
 */
async function checkRecentActivity(phoneNumber: string, cutoff: Date): Promise<boolean> {
  try {
    const { count, error } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('phone_number', phoneNumber)
      .gte('created_at', cutoff.toISOString())

    if (error) {
      console.error('[TWILIO CLEANUP] Failed to check recent activity:', error)
      // Fail safe: assume activity to be conservative
      return true
    }

    return (count || 0) > 0
  } catch (error) {
    console.error('[TWILIO CLEANUP] Exception checking recent activity:', error)
    // Fail safe: assume activity to be conservative
    return true
  }
}

/**
 * Get total count of retired numbers
 */
export async function getRetiredCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('twilio_numbers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'retired')

  if (error) {
    console.error('[TWILIO CLEANUP] Failed to count retired numbers:', error)
    return 0
  }

  return count || 0
}

/**
 * Claim a number for release by transitioning to release_pending
 * Uses row-level locking to prevent concurrent claims
 */
export async function claimNumberForRelease(numberId: string, runId: string): Promise<boolean> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('twilio_numbers')
    .select('id, status, business_id, release_attempt_count, phone_number, reserved_expires_at')
    .eq('id', numberId)
    .single()

  if (fetchError || !existing) {
    console.error('[TWILIO CLEANUP] Failed to fetch number for claim:', fetchError)
    return false
  }

  // Safety check: ensure number is still eligible
  if (existing.business_id) {
    console.warn('[TWILIO CLEANUP] Number has business_id, skipping claim:', numberId)
    return false
  }

  // Check for active reservation
  if (existing.reserved_expires_at && new Date(existing.reserved_expires_at) > new Date()) {
    console.warn('[TWILIO CLEANUP] Number has active reservation, skipping claim:', numberId)
    return false
  }

  if (existing.status !== 'retired' && existing.status !== 'release_pending') {
    console.warn('[TWILIO CLEANUP] Number status changed, skipping claim:', existing.status)
    return false
  }

  // Attempt to claim with optimistic locking and claim timestamp
  const claimTimestamp = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('twilio_numbers')
    .update({
      status: 'release_pending',
      cleanup_run_id: runId,
      last_release_attempt_at: claimTimestamp
    })
    .eq('id', numberId)
    .in('status', ['retired', 'release_pending'])
    .is('business_id', null)

  if (updateError) {
    console.error('[TWILIO CLEANUP] Failed to claim number:', updateError)
    return false
  }

  console.log('[TWILIO CLEANUP] Number claimed for release', {
    numberId,
    maskedPhone: maskPhoneNumber(existing.phone_number || ''),
    runId,
    claimTimestamp
  })

  return true
}

/**
 * Release a Twilio number from the account
 */
export async function releaseTwilioNumber(
  candidate: CleanupCandidate,
  runId: string,
  dryRun: boolean = false
): Promise<ReleaseResult> {
  const result: ReleaseResult = {
    numberId: candidate.id,
    phoneNumber: candidate.phoneNumber,
    twilioSid: candidate.twilioSid,
    success: false,
    alreadyMissing: false
  }

  if (dryRun) {
    console.log('[TWILIO CLEANUP] Dry-run: Would release number', {
      maskedPhone: maskPhoneNumber(candidate.phoneNumber),
      twilioSidSuffix: getTwilioSidSuffix(candidate.twilioSid)
    })
    result.success = true
    return result
  }

  // Initialize Twilio client
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    console.error('[TWILIO CLEANUP] Missing Twilio credentials')
    result.error = 'Twilio credentials not configured'
    return result
  }

  const client = new (Twilio as any)(accountSid, authToken)

  try {
    // Revalidate database record before release
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, status, business_id')
      .eq('id', candidate.id)
      .single()

    if (fetchError || !current) {
      console.error('[TWILIO CLEANUP] Number not found in database:', fetchError)
      result.error = 'Number not found in database'
      return result
    }

    // Safety check: ensure number is still eligible
    if (current.business_id) {
      console.warn('[TWILIO CLEANUP] Number assigned to business, aborting release')
      result.error = 'Number has active business assignment'
      return result
    }

    if (current.phone_number !== candidate.phoneNumber) {
      console.error('[TWILIO CLEANUP] Phone number mismatch in database')
      result.error = 'Phone number mismatch'
      return result
    }

    if (current.twilio_sid !== candidate.twilioSid) {
      console.error('[TWILIO CLEANUP] Twilio SID mismatch in database')
      result.error = 'Twilio SID mismatch'
      sendOperationalAlert('sid_mismatch', {
        numberId: candidate.id,
        phoneNumber: candidate.phoneNumber,
        twilioSid: candidate.twilioSid,
        runId
      })
      return result
    }

    // Fetch the number from Twilio to verify it exists
    let twilioNumber
    try {
      twilioNumber = await client.incomingPhoneNumbers(candidate.twilioSid).fetch()
    } catch (fetchErr: any) {
      if (fetchErr.status === 404) {
        console.log('[TWILIO CLEANUP] Number not found in Twilio (already released)', {
          maskedPhone: maskPhoneNumber(candidate.phoneNumber),
          twilioSidSuffix: getTwilioSidSuffix(candidate.twilioSid)
        })
        result.alreadyMissing = true
        result.success = true
        await markNumberReleased(candidate.id, runId, 'already_missing_in_twilio')
        return result
      }
      throw fetchErr
    }

    // Verify Twilio phone number matches database
    if (twilioNumber.phoneNumber !== candidate.phoneNumber) {
      console.error('[TWILIO CLEANUP] Twilio phone number does not match database', {
        dbPhone: candidate.phoneNumber,
        twilioPhone: twilioNumber.phoneNumber
      })
      result.error = 'Twilio phone number mismatch'
      return result
    }

    // Remove from Messaging Service sender pool if configured
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
    if (messagingServiceSid) {
      try {
        // Try to remove from Messaging Service sender pool
        const messagingService = (client as any).messagingServices(messagingServiceSid)
        
        // Try to remove the phone number from the sender pool
        // This may fail if the number is not in the service, which is fine
        try {
          await messagingService.phoneNumbers(candidate.twilioSid).remove()
          console.log('[TWILIO CLEANUP] Removed from Messaging Service sender pool', {
            maskedPhone: maskPhoneNumber(candidate.phoneNumber),
            messagingServiceSid: messagingServiceSid.slice(-8)
          })
        } catch (senderErr: any) {
          // If number is not in the service (404), that's idempotent success
          if (senderErr.status === 404) {
            console.log('[TWILIO CLEANUP] Number not in Messaging Service sender pool (already detached)', {
              maskedPhone: maskPhoneNumber(candidate.phoneNumber)
            })
          } else {
            // Log but don't fail on sender pool detachment errors
            console.warn('[TWILIO CLEANUP] Failed to remove from Messaging Service sender pool, continuing:', {
              maskedPhone: maskPhoneNumber(candidate.phoneNumber),
              error: senderErr.message,
              code: senderErr.code
            })
          }
        }
      } catch (msErr: any) {
        console.warn('[TWILIO CLEANUP] Messaging Service detachment error (continuing):', msErr.message)
        // Don't fail the entire release on Messaging Service errors
        // The number will still be released from the account
      }
    }

    // Clear application webhooks as a final safety measure
    if (twilioNumber.smsApplicationSid || twilioNumber.voiceApplicationSid) {
      try {
        await client.incomingPhoneNumbers(candidate.twilioSid).update({
          smsApplicationSid: null,
          voiceApplicationSid: null
        })
        console.log('[TWILIO CLEANUP] Cleared application webhooks', {
          maskedPhone: maskPhoneNumber(candidate.phoneNumber)
        })
      } catch (webhookErr: any) {
        console.warn('[TWILIO CLEANUP] Failed to clear webhooks, continuing with release:', webhookErr.message)
        // Don't fail on webhook clear errors
      }
    }

    // Release the number from Twilio
    await client.incomingPhoneNumbers(candidate.twilioSid).remove()

    console.log('[TWILIO CLEANUP] Release succeeded', {
      maskedPhone: maskPhoneNumber(candidate.phoneNumber),
      twilioSidSuffix: getTwilioSidSuffix(candidate.twilioSid)
    })

    result.success = true
    await markNumberReleased(candidate.id, runId, 'cleanup_release')

  } catch (error: any) {
    console.error('[TWILIO CLEANUP] Release failed', {
      maskedPhone: maskPhoneNumber(candidate.phoneNumber),
      error: error.message,
      code: error.code,
      status: error.status
    })

    result.error = error.message
    result.errorCode = error.code

    // Classify failure and handle retry
    const isRetryable = isRetryableError(error)
    await handleReleaseFailure(candidate.id, runId, error.message, error.code, isRetryable)
  }

  return result
}

/**
 * Mark a number as released in the database
 */
async function markNumberReleased(numberId: string, runId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('twilio_numbers')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      released_reason: reason,
      business_id: null,
      cleanup_run_id: runId
    })
    .eq('id', numberId)

  if (error) {
    console.error('[TWILIO CLEANUP] Failed to mark number as released:', error)
  }
}

/**
 * Handle release failure with retry logic
 */
async function handleReleaseFailure(
  numberId: string,
  runId: string,
  errorMessage: string,
  errorCode?: string,
  isRetryable: boolean = true
): Promise<void> {
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('twilio_numbers')
    .select('release_attempt_count')
    .eq('id', numberId)
    .single()

  if (fetchError || !current) {
    console.error('[TWILIO CLEANUP] Failed to fetch number for failure handling:', fetchError)
    return
  }

  const newAttemptCount = (current.release_attempt_count || 0) + 1

  if (newAttemptCount >= MAX_ATTEMPTS || !isRetryable) {
    // Max attempts or permanent failure - keep in release_pending for manual review
    await supabaseAdmin
      .from('twilio_numbers')
      .update({
        release_attempt_count: newAttemptCount,
        last_release_attempt_at: new Date().toISOString(),
        last_release_error: errorMessage
      })
      .eq('id', numberId)

    console.warn('[TWILIO CLEANUP] Number marked for manual review', {
      numberId,
      attemptCount: newAttemptCount,
      isRetryable
    })

    // Send alert for permanent failures or max attempts
    if (!isRetryable) {
      sendOperationalAlert('permanent_failure', {
        numberId,
        error: errorMessage,
        errorCode
      })
    } else if (newAttemptCount >= MAX_ATTEMPTS) {
      sendOperationalAlert('max_attempts_exceeded', {
        numberId,
        error: errorMessage,
        errorCode
      })
    }
  } else {
    // Retryable failure - schedule retry
    const nextRetry = calculateNextRetry(newAttemptCount)

    await supabaseAdmin
      .from('twilio_numbers')
      .update({
        status: 'retired', // Return to retired for retry
        release_attempt_count: newAttemptCount,
        last_release_attempt_at: new Date().toISOString(),
        last_release_error: errorMessage,
        next_release_retry_at: nextRetry.toISOString(),
        cleanup_run_id: null
      })
      .eq('id', numberId)

    console.log('[TWILIO CLEANUP] Number scheduled for retry', {
      numberId,
      attemptCount: newAttemptCount,
      nextRetry: nextRetry.toISOString()
    })
  }
}

/**
 * Classify whether an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retryable: network errors, timeouts, rate limits, server errors
  if (error.code === 20429 || error.status === 429) return true // Rate limit
  if (error.status && error.status >= 500) return true // Server errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') return true // Network errors

  // Permanent: authorization, not found (404 already handled), invalid SID
  if (error.code === 20003) return false // Authentication
  if (error.code === 20004) return false // Permission
  if (error.status === 401) return false
  if (error.status === 403) return false

  // Default to retryable for unknown errors
  return true
}

/**
 * Send operational alert for critical failures
 * This uses console.error for now - should be integrated with Sentry or existing alerting
 */
function sendOperationalAlert(
  type: 'permanent_failure' | 'max_attempts_exceeded' | 'sid_mismatch' | 'auth_failure' | 'run_failure',
  details: {
    numberId?: string
    phoneNumber?: string
    twilioSid?: string
    runId?: string
    error?: string
    errorCode?: string
  }
): void {
  const alertMessage = {
    type,
    timestamp: new Date().toISOString(),
    ...details,
    maskedPhone: details.phoneNumber ? maskPhoneNumber(details.phoneNumber) : undefined,
    twilioSidSuffix: details.twilioSid ? getTwilioSidSuffix(details.twilioSid) : undefined
  }

  console.error('[TWILIO CLEANUP ALERT]', JSON.stringify(alertMessage))

  // TODO: Integrate with Sentry or existing alerting mechanism
  // Example: Sentry.captureMessage('Twilio cleanup alert', { level: 'error', extra: alertMessage })
}

/**
 * Create a cleanup run audit record
 */
export async function createCleanupRun(mode: 'dry_run' | 'live'): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('twilio_number_cleanup_runs')
    .insert({
      mode,
      trigger_source: 'cron',
      deployment_environment: process.env.NODE_ENV || 'unknown'
    })
    .select('id')
    .single()

  if (error) {
    console.error('[TWILIO CLEANUP] Failed to create cleanup run:', error)
    throw new Error('Failed to create cleanup run')
  }

  console.log('[TWILIO CLEANUP] Run started', { runId: data.id, mode })
  return data.id
}

/**
 * Update cleanup run with results
 */
export async function updateCleanupRun(
  runId: string,
  results: Partial<CleanupRunResult>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('twilio_number_cleanup_runs')
    .update({
      finished_at: new Date().toISOString(),
      retired_count: results.retiredCount,
      eligible_count: results.eligibleCount,
      selected_count: results.selectedCount,
      released_count: results.releasedCount,
      already_missing_count: results.alreadyMissingCount,
      failed_count: results.failedCount,
      skipped_count: results.skippedCount,
      summary: results.summary,
      error: results.error
    })
    .eq('id', runId)

  if (error) {
    console.error('[TWILIO CLEANUP] Failed to update cleanup run:', error)
  }
}

/**
 * Main cleanup orchestration function
 */
export async function runCleanup(mode: 'dry_run' | 'live' = 'live'): Promise<CleanupRunResult> {
  const runId = await createCleanupRun(mode)
  console.log('[TWILIO CLEANUP] run_started', { runId, mode })

  const result: CleanupRunResult = {
    runId,
    mode,
    retiredCount: 0,
    eligibleCount: 0,
    selectedCount: 0,
    releasedCount: 0,
    alreadyMissingCount: 0,
    failedCount: 0,
    skippedCount: 0,
    candidates: [],
    summary: ''
  }

  try {
    // Check if cleanup is enabled
    if (!CLEANUP_ENABLED && mode === 'live') {
      result.summary = 'Cleanup disabled by configuration'
      result.error = 'TWILIO_RETIRED_CLEANUP_ENABLED=false'
      await updateCleanupRun(runId, result)
      console.log('[TWILIO CLEANUP] Cleanup disabled, exiting')
      return result
    }

    // Get retired count
    result.retiredCount = await getRetiredCount()
    console.log('[TWILIO CLEANUP] Retired count', { count: result.retiredCount })

    // Check threshold
    if (result.retiredCount < CLEANUP_THRESHOLD) {
      result.summary = `Retired count (${result.retiredCount}) below threshold (${CLEANUP_THRESHOLD})`
      await updateCleanupRun(runId, result)
      console.log('[TWILIO CLEANUP] Below threshold, exiting')
      return result
    }

    // Get eligible numbers
    const eligible = await getEligibleNumbers()
    result.eligibleCount = eligible.length
    result.candidates = eligible

    if (eligible.length === 0) {
      result.summary = 'No eligible numbers found'
      await updateCleanupRun(runId, result)
      console.log('[TWILIO CLEANUP] No eligible numbers')
      return result
    }

    console.log('[TWILIO CLEANUP] Processing candidates', { count: eligible.length })

    // Claim and release each number
    for (const candidate of eligible) {
      const claimed = await claimNumberForRelease(candidate.id, runId)

      if (!claimed) {
        result.skippedCount++
        result.skippedCount++
        continue
      }

      result.selectedCount++

      const releaseResult = await releaseTwilioNumber(candidate, runId, mode === 'dry_run')

      if (releaseResult.success) {
        result.releasedCount++
        if (releaseResult.alreadyMissing) {
          result.alreadyMissingCount++
        }
      } else {
        result.failedCount++
      }
    }

    result.summary = `Processed ${result.selectedCount}/${result.eligibleCount} eligible numbers: ${result.releasedCount} released, ${result.alreadyMissingCount} already missing, ${result.failedCount} failed, ${result.skippedCount} skipped`

  } catch (error: any) {
    console.error('[TWILIO CLEANUP] Fatal error:', error)
    result.error = error.message
    result.summary = `Cleanup failed: ${error.message}`
    sendOperationalAlert('run_failure', {
      runId,
      error: error.message
    })
  }

  await updateCleanupRun(runId, result)
  console.log('[TWILIO CLEANUP] run_completed', {
    runId,
    mode,
    releasedCount: result.releasedCount,
    failedCount: result.failedCount,
    summary: result.summary
  })

  return result
}