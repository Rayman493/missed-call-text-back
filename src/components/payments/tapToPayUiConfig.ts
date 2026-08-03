/**
 * Tap to Pay UI Configuration
 *
 * Shared presentation flags for Tap to Pay screens.
 * These control visibility of debug/diagnostic UI without affecting payment behavior.
 */

// Diagnostics display flag - set to false for production and Apple review recordings
// Diagnostics are hidden for production but retained for support troubleshooting
export const SHOW_TAP_TO_PAY_DIAGNOSTICS = false;

// Temporary test status flag - shows minimal debug info in modal for device testing
// Set to false for production and Apple review recordings
export const SHOW_TTP_TEST_STATUS = true;
