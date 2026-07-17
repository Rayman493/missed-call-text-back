/**
 * Capacitor OAuth Helper
 *
 * This file provides Capacitor-specific OAuth handling for external browser flows.
 * For native environments, uses Capacitor Browser plugin to open OAuth in system browser.
 * For web environments, uses standard browser navigation.
 */

import { isCapacitorNative } from './init';

/**
 * Open OAuth URL in external browser
 *
 * For web: Opens in same window/tab
 * For Capacitor: Opens in system browser using Capacitor Browser plugin
 *
 * @param url - The OAuth URL to open
 * @param callbackUrl - The URL to redirect back to after OAuth completion (for deep-link return)
 */
export async function openOAuthFlow(url: string, callbackUrl: string): Promise<void> {
  console.log('[OAuth] Opening OAuth flow:', { url, callbackUrl, isNative: isCapacitorNative() });

  if (isCapacitorNative()) {
    // Native environment: Use Capacitor Browser plugin to open in system browser
    try {
      const { Browser } = await import('@capacitor/browser');
      console.log('[OAuth] Opening in system browser using Capacitor Browser plugin');
      
      // Open OAuth URL in system browser
      await Browser.open({ url });
      
      console.log('[OAuth] System browser opened successfully');
    } catch (error) {
      console.error('[OAuth] Failed to open system browser:', error);
      console.log('[OAuth] Falling back to window.open');
      // Fallback to window.open if Browser plugin fails
      window.open(url, '_blank');
    }
  } else {
    // Web: Open in same window
    window.location.href = url;
  }
}

/**
 * Check if OAuth return URL is valid for Capacitor deep linking
 * 
 * For Capacitor, the return URL should use custom scheme or universal links
 * For web, the return URL is the normal web URL
 */
export function isValidOAuthReturnUrl(url: string): boolean {
  // For now, accept all URLs since we're using hosted approach
  // Later, this will validate custom scheme (replyflow://) or universal links
  return true;
}

/**
 * Convert web OAuth return URL to Capacitor deep link format
 * 
 * For example:
 * Web: https://www.replyflowhq.com/api/google/calendar/callback?code=...
 * Capacitor: replyflow://api/google/calendar/callback?code=...
 */
export function convertToCapacitorDeepLink(url: string): string {
  if (!isCapacitorNative()) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // Convert to custom scheme if it's a ReplyFlow URL
    if (urlObj.hostname.includes('replyflowhq.com')) {
      const deepLink = url.replace('https://www.replyflowhq.com/', 'replyflow://');
      console.log('[OAuth] Converted to deep link:', deepLink);
      return deepLink;
    }
    
    return url;
  } catch (error) {
    console.error('[OAuth] Error converting to deep link:', error);
    return url;
  }
}

/**
 * Handle OAuth callback for Capacitor
 * 
 * This will be called when the app is opened via deep link after OAuth completion
 */
export function handleOAuthCallback(url: string): void {
  console.log('[OAuth] Handling OAuth callback:', url);
  
  // For hosted approach, just navigate to the URL
  // The server will handle the OAuth callback normally
  window.location.href = url;
}
