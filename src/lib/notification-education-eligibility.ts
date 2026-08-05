import { Preferences } from '@capacitor/preferences'

const STORAGE_KEYS = {
  LAST_SHOWN_AT: 'notification_permission_modal_last_shown_at',
  LAST_KNOWN_STATUS: 'notification_permission_last_known_status',
  DISMISSED_AT: 'notification_permission_modal_dismissed_at'
} as const

const COOLDOWN_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
const SESSION_DURATION = 5 * 60 * 1000 // 5 minutes - consider same session if within this window

// In-memory session guard for duplicate mounts (e.g., React Strict Mode)
let lastSessionCheckTime: number | null = null

/**
 * Reset the in-memory session guard (for testing only).
 */
export function resetSessionGuard(): void {
  lastSessionCheckTime = null
}

export interface EligibilityResult {
  eligible: boolean
  reason: string
  diagnostic: {
    platform: string
    isNative: boolean
    nativeStatus: string
    lastKnownStatus: string | null
    lastShownAt: string | null
    dismissedAt: string | null
    cooldownRemaining: number | null
    now: number
  }
}

export interface EligibilityInput {
  platform: string
  isNative: boolean
  nativePermissionStatus: string
  permissionLockActive: boolean
}

/**
 * Centralized eligibility function for notification permission education modal.
 * Returns a deterministic decision and reason.
 */
export async function shouldShowNotificationEducation(input: EligibilityInput): Promise<EligibilityResult> {
  const { platform, isNative, nativePermissionStatus, permissionLockActive } = input
  const now = Date.now()

  const diagnostic: EligibilityResult['diagnostic'] = {
    platform,
    isNative,
    nativeStatus: nativePermissionStatus,
    lastKnownStatus: null,
    lastShownAt: null,
    dismissedAt: null,
    cooldownRemaining: null,
    now
  }

  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] ===== STARTING ELIGIBILITY CHECK =====')
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Input:', { platform, isNative, nativePermissionStatus, permissionLockActive })

  // Rule 1: Only on native platforms
  if (!isNative) {
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: not native platform')
    return { eligible: false, reason: 'not_native', diagnostic }
  }

  // Rule 2: If another permission is active, block
  if (permissionLockActive) {
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: another permission active')
    return { eligible: false, reason: 'permission_lock_active', diagnostic }
  }

  // Rule 3: If permission is already granted, never show
  if (nativePermissionStatus === 'granted') {
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: permission already granted')
    // Persist granted status
    await Preferences.set({ key: STORAGE_KEYS.LAST_KNOWN_STATUS, value: 'granted' })
    const { value: verifyWrite } = await Preferences.get({ key: STORAGE_KEYS.LAST_KNOWN_STATUS })
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Verify LAST_KNOWN_STATUS write:', verifyWrite)
    diagnostic.lastKnownStatus = 'granted'
    return { eligible: false, reason: 'permission_granted', diagnostic }
  }

  // Load all persisted values
  const { value: lastKnownStatus } = await Preferences.get({ key: STORAGE_KEYS.LAST_KNOWN_STATUS })
  const { value: lastShownAt } = await Preferences.get({ key: STORAGE_KEYS.LAST_SHOWN_AT })
  const { value: dismissedAt } = await Preferences.get({ key: STORAGE_KEYS.DISMISSED_AT })

  diagnostic.lastKnownStatus = lastKnownStatus
  diagnostic.lastShownAt = lastShownAt
  diagnostic.dismissedAt = dismissedAt

  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Storage values:', {
    lastKnownStatus,
    lastShownAt,
    dismissedAt
  })

  // Rule 4: If granted in storage, never show
  if (lastKnownStatus === 'granted') {
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: permission granted in storage')
    return { eligible: false, reason: 'permission_granted_storage', diagnostic }
  }

  // Rule 5: Check if already checked in this session (within 5 minutes) - in-memory guard
  if (lastSessionCheckTime) {
    const timeSinceSessionCheck = now - lastSessionCheckTime
    if (timeSinceSessionCheck < SESSION_DURATION) {
      console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: already checked this session')
      console.log(`[NOTIFICATION_EDUCATION_ELIGIBILITY] Session checked ${timeSinceSessionCheck}ms ago (< ${SESSION_DURATION}ms)`)
      return { eligible: false, reason: 'already_checked_session', diagnostic }
    }
  }

  // Rule 6: Check cooldown from dismissal
  if (dismissedAt) {
    const dismissedTime = parseInt(dismissedAt, 10)
    if (isNaN(dismissedTime)) {
      console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Invalid dismissed_at timestamp, failing closed')
      return { eligible: false, reason: 'invalid_timestamp', diagnostic }
    }
    const timeSinceDismissal = now - dismissedTime
    const cooldownRemaining = COOLDOWN_DURATION - timeSinceDismissal
    diagnostic.cooldownRemaining = cooldownRemaining

    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Cooldown check:', {
      dismissedAt: new Date(dismissedTime).toISOString(),
      timeSinceDismissal,
      cooldownDuration: COOLDOWN_DURATION,
      cooldownRemaining
    })

    if (timeSinceDismissal < COOLDOWN_DURATION) {
      console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: cooldown active')
      return { eligible: false, reason: 'cooldown_active', diagnostic }
    }
  }

  // Rule 7: If permission is denied, only show after cooldown expires
  if (nativePermissionStatus === 'denied' || nativePermissionStatus === 'blocked') {
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10)
      const timeSinceDismissal = now - dismissedTime
      if (timeSinceDismissal >= COOLDOWN_DURATION) {
        console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] ELIGIBLE: denied but cooldown expired')
        return { eligible: true, reason: 'denied_cooldown_expired', diagnostic }
      }
    }
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: permission denied')
    return { eligible: false, reason: 'permission_denied', diagnostic }
  }

  // Rule 8: If permission is prompt (not yet determined), show if not recently dismissed
  if (nativePermissionStatus === 'prompt' || nativePermissionStatus === 'unknown') {
    console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] ELIGIBLE: permission not yet determined')
    return { eligible: true, reason: 'permission_prompt', diagnostic }
  }

  // Default: not eligible
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] BLOCKED: unknown status')
  return { eligible: false, reason: 'unknown_status', diagnostic }
}

/**
 * Mark the current session as checked to prevent duplicate checks (in-memory guard).
 */
export function markSessionChecked(): void {
  lastSessionCheckTime = Date.now()
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Session marked as checked (in-memory):', new Date(lastSessionCheckTime).toISOString())
}

/**
 * Record that the modal was shown.
 */
export async function recordModalShown(): Promise<void> {
  const now = Date.now()
  await Preferences.set({ key: STORAGE_KEYS.LAST_SHOWN_AT, value: now.toString() })
  markSessionChecked()
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Modal shown recorded:', new Date(now).toISOString())
}

/**
 * Record that the modal was dismissed (user clicked Not Now).
 */
export async function recordModalDismissed(): Promise<void> {
  const now = Date.now()
  await Preferences.set({ key: STORAGE_KEYS.DISMISSED_AT, value: now.toString() })
  markSessionChecked()
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Modal dismissed recorded:', new Date(now).toISOString())
  console.log(`[NOTIFICATION_EDUCATION_ELIGIBILITY] Cooldown set until ${new Date(now + COOLDOWN_DURATION).toISOString()}`)
}

/**
 * Record that permission was granted.
 */
export async function recordPermissionGranted(): Promise<void> {
  await Preferences.set({ key: STORAGE_KEYS.LAST_KNOWN_STATUS, value: 'granted' })
  await Preferences.remove({ key: STORAGE_KEYS.DISMISSED_AT })
  markSessionChecked()
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Permission granted recorded')
}

/**
 * Record that permission was denied.
 */
export async function recordPermissionDenied(status: string): Promise<void> {
  await Preferences.set({ key: STORAGE_KEYS.LAST_KNOWN_STATUS, value: status })
  markSessionChecked()
  console.log('[NOTIFICATION_EDUCATION_ELIGIBILITY] Permission denied recorded:', status)
}
