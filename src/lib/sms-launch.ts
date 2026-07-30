import { Capacitor } from '@capacitor/core'

/**
 * Launch the native SMS app with recipient and message body.
 * Works on both Android and iOS native platforms.
 *
 * @param recipient - Phone number to send to
 * @param message - Message body to prefill
 * @returns Promise that resolves if launch succeeds, rejects if it fails
 */
export async function launchSMS(recipient: string, message: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('SMS launch is only supported on native mobile platforms')
  }

  const smsUrl = `sms:${recipient}?body=${encodeURIComponent(message)}`

  // Try to launch the SMS app
  try {
    // On Android, window.open with sms: URL should launch the default SMS app
    // On iOS, this also works to launch Messages
    const opened = window.open(smsUrl, '_self')
    
    if (!opened) {
      throw new Error('Failed to open SMS app')
    }

    // Give it a moment to see if it worked
    await new Promise((resolve) => setTimeout(resolve, 100))
  } catch (error) {
    console.error('[SMS Launch] Failed to launch SMS app:', error)
    throw new Error('Failed to open messaging app')
  }
}

/**
 * Copy message to clipboard as fallback
 */
export async function copyToClipboard(message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message)
  } catch (error) {
    console.error('[SMS Launch] Failed to copy to clipboard:', error)
    throw new Error('Failed to copy message to clipboard')
  }
}
