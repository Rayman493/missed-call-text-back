import { Capacitor } from '@capacitor/core'
import { registerPlugin } from '@capacitor/core'

interface SmsLauncherPlugin {
  openSms(options: { recipient: string; body?: string }): Promise<{ opened: boolean; code?: string; message?: string }>
}

const SmsLauncher = registerPlugin<SmsLauncherPlugin>('SmsLauncher')

/**
 * Launch the native SMS app with recipient and message body.
 * Uses native Android intent on Android, window.open on iOS.
 *
 * @param recipient - Phone number to send to
 * @param message - Message body to prefill (optional for manual messages)
 * @returns Promise that resolves if launch succeeds, rejects if it fails
 */
export async function launchSMS(recipient: string, message: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('SMS launch is only supported on native mobile platforms')
  }

  const platform = Capacitor.getPlatform()

  if (platform === 'android') {
    // Use native Android plugin
    try {
      const result = await SmsLauncher.openSms({ recipient, body: message })
      
      if (!result.opened) {
        throw new Error(result.message || 'Failed to open messaging app')
      }
    } catch (error) {
      console.error('[SMS Launch] Native plugin failed:', error)
      throw new Error('Failed to open messaging app')
    }
  } else if (platform === 'ios') {
    // Use iOS window.open approach (preserved working behavior)
    const smsUrl = `sms:${recipient}${message ? `&body=${encodeURIComponent(message)}` : ''}`
    
    try {
      const opened = window.open(smsUrl, '_self')
      
      if (!opened) {
        throw new Error('Failed to open SMS app')
      }

      // Give it a moment to see if it worked
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.error('[SMS Launch] iOS launch failed:', error)
      throw new Error('Failed to open messaging app')
    }
  } else {
    throw new Error('SMS launch not supported on this platform')
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
