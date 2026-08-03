/**
 * Permission Request Lock
 * 
 * Prevents overlapping native permission requests by coordinating
 * permission dialogs across the app. This ensures:
 * - Notification permission doesn't overlap with Tap to Pay location permission
 * - Only one native permission dialog is active at a time
 * - Permission requests respect app state (not backgrounded, not transitioning)
 */

type PermissionType = 'notification' | 'location' | 'other'

class PermissionLock {
  private activePermission: PermissionType | null = null
  private isAppBackgrounded = false
  private isScreenTransitioning = false
  private tapToPayActive = false

  /**
   * Request exclusive access to request a permission
   * Returns true if access is granted, false if another permission is active
   */
  requestPermission(type: PermissionType): boolean {
    if (this.activePermission !== null) {
      console.log(`[PERMISSION LOCK] Permission request blocked - ${this.activePermission} is already active`)
      return false
    }

    if (this.isAppBackgrounded) {
      console.log('[PERMISSION LOCK] Permission request blocked - app is backgrounded')
      return false
    }

    if (this.isScreenTransitioning) {
      console.log('[PERMISSION LOCK] Permission request blocked - screen is transitioning')
      return false
    }

    if (this.tapToPayActive && type === 'notification') {
      console.log('[PERMISSION LOCK] Notification permission blocked - Tap to Pay is active')
      return false
    }

    console.log(`[PERMISSION LOCK] Permission request granted - ${type}`)
    this.activePermission = type
    return true
  }

  /**
   * Release the permission lock
   */
  releasePermission(type: PermissionType): void {
    if (this.activePermission === type) {
      console.log(`[PERMISSION LOCK] Permission released - ${type}`)
      this.activePermission = null
    }
  }

  /**
   * Set the app background state
   */
  setAppBackgrounded(backgrounded: boolean): void {
    console.log(`[PERMISSION LOCK] App background state: ${backgrounded}`)
    this.isAppBackgrounded = backgrounded
  }

  /**
   * Set the screen transition state
   */
  setScreenTransitioning(transitioning: boolean): void {
    console.log(`[PERMISSION LOCK] Screen transition state: ${transitioning}`)
    this.isScreenTransitioning = transitioning
  }

  /**
   * Set Tap to Pay active state
   */
  setTapToPayActive(active: boolean): void {
    console.log(`[PERMISSION LOCK] Tap to Pay state: ${active}`)
    this.tapToPayActive = active
  }

  /**
   * Check if a permission type is currently active
   */
  isPermissionActive(type: PermissionType): boolean {
    return this.activePermission === type
  }

  /**
   * Check if any permission is active
   */
  isAnyPermissionActive(): boolean {
    return this.activePermission !== null
  }
}

// Singleton instance
export const permissionLock = new PermissionLock()