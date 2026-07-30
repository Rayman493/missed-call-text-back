import { Capacitor } from '@capacitor/core'
import { registerPlugin } from '@capacitor/core'

interface SmsLauncherPlugin {
  openSms(options: { recipient: string; body?: string }): Promise<{ opened: boolean; code?: string; message?: string }>
}

const SmsLauncher = registerPlugin<SmsLauncherPlugin>('SmsLauncher')

interface OpenBusinessSmsOptions {
  recipient: string
  body?: string
  source?: 'manual' | 'payment' | 'reminder' | 'confirmation'
}

/**
 * Shared helper for Business Number SMS launch.
 * Uses the proven working path from BusinessNumberPanel.
 * 
 * @param options - Recipient and optional message body
 * @returns Promise that resolves if launch succeeds, rejects if it fails
 */
export async function openBusinessSms(options: OpenBusinessSmsOptions): Promise<void> {
  const { recipient, body = '', source = 'manual' } = options
  
  console.log('[BUSINESS SMS] source:', source)
  console.log('[BUSINESS SMS] platform:', Capacitor.getPlatform())
  console.log('[BUSINESS SMS] isNativePlatform:', Capacitor.isNativePlatform())
  console.log('[BUSINESS SMS] plugin available:', Capacitor.isPluginAvailable('SmsLauncher'))
  console.log('[BUSINESS SMS] recipient suffix:', recipient.substring(recipient.length - 4))
  console.log('[BUSINESS SMS] body length:', body.length)
  console.log('[BUSINESS SMS] calling shared launcher')

  if (!Capacitor.isNativePlatform()) {
    throw new Error('SMS launch is only supported on native mobile platforms')
  }

  const platform = Capacitor.getPlatform()

  if (platform === 'android') {
    // Try native plugin first
    try {
      console.log('[BUSINESS SMS] calling native plugin')
      const result = await SmsLauncher.openSms({ recipient, body })
      console.log('[BUSINESS SMS] native result:', result)
      
      if (result.opened) {
        console.log('[BUSINESS SMS] completed successfully')
        return
      }
      
      console.log('[BUSINESS SMS] native returned opened=false, using anchor fallback')
    } catch (error) {
      console.error('[BUSINESS SMS] native plugin failed:', error)
      console.log('[BUSINESS SMS] fallback reason: native exception')
    }

    // Fallback: use anchor element (proven working path from BusinessNumberPanel)
    console.log('[BUSINESS SMS] using anchor fallback')
    const smsUrl = `sms:${recipient}${body ? `?body=${encodeURIComponent(body)}` : ''}`
    const link = document.createElement('a')
    link.href = smsUrl
    link.click()
    console.log('[BUSINESS SMS] completed via anchor fallback')
  } else if (platform === 'ios') {
    // Use iOS window.open approach (preserved working behavior)
    const smsUrl = `sms:${recipient}${body ? `&body=${encodeURIComponent(body)}` : ''}`
    
    try {
      const opened = window.open(smsUrl, '_self')
      
      if (!opened) {
        throw new Error('Failed to open SMS app')
      }

      // Give it a moment to see if it worked
      await new Promise((resolve) => setTimeout(resolve, 100))
      console.log('[BUSINESS SMS] completed via iOS window.open')
    } catch (error) {
      console.error('[BUSINESS SMS] iOS launch failed:', error)
      throw new Error('Failed to open messaging app')
    }
  } else {
    throw new Error('SMS launch not supported on this platform')
  }
}

/**
 * Legacy launchSMS function for backward compatibility.
 * Delegates to openBusinessSms.
 */
export async function launchSMS(recipient: string, message: string): Promise<void> {
  return openBusinessSms({ recipient, body: message, source: 'manual' })
}

/**
 * Copy message to clipboard as fallback
 */
export async function copyToClipboard(message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message)
  } catch (error) {
    console.error('[BUSINESS SMS] Failed to copy to clipboard:', error)
    throw new Error('Failed to copy message to clipboard')
  }
}
