/**
 * Capacitor Initialization
 * 
 * This file initializes Capacitor plugins and handles app lifecycle events.
 * It should be imported early in the app initialization (e.g., in layout.tsx or a dedicated init component).
 */

import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { pushService } from '@/lib/push-service';
import { TerminalBridgeService } from '@/lib/terminal/service';

/**
 * Validate critical production configuration
 * Fails fast with clear diagnostics if configuration is invalid
 */
function validateProductionConfiguration() {
  if (typeof window === 'undefined') return; // Skip on server

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log('[Config] Development mode - skipping production validation');
    return;
  }

  console.log('[Config] Validating production configuration...');

  // Check for required environment variables
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('[Config] CRITICAL: Missing required environment variables:', missingVars);
    console.error('[Config] Production cannot start without these variables');
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log('[Config] Production configuration validated successfully');
}

/**
 * Initialize Capacitor plugins and set up event listeners
 */
export async function initializeCapacitor() {
  // Only initialize if running in Capacitor native environment
  const isCapacitor = Capacitor.isNativePlatform();

  if (!isCapacitor) {
    console.log('[Capacitor] Not running in native environment, skipping initialization');
    return;
  }

  console.log('[Capacitor] Initializing native plugins...');

  // Validate production configuration before initializing plugins
  validateProductionConfiguration();

  try {
    // Initialize Status Bar
    const platform = Capacitor.getPlatform();
    
    // iOS: Prevent WebView from extending beneath status bar
    if (platform === 'ios') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: '#020617' }); // Match dark theme background
    }
    
    await StatusBar.setStyle({ style: Style.Dark })
    console.log('[Capacitor] Status bar configured');

    // Hide splash screen
    await SplashScreen.hide();
    console.log('[Capacitor] Splash screen hidden');

    // Set up app state listeners
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App state changed:', isActive ? 'active' : 'inactive');
      // Warm up Tap to Pay when app returns to foreground
      if (isActive) {
        warmUpTapToPay();
      }
    });

    // Set up URL/open URL listeners for deep links
    App.addListener('appUrlOpen', (data) => {
      console.log('[Capacitor] App opened with URL:', data.url);
      // Handle deep links here
      handleDeepLink(data.url);
    });

    // Set up back button listener for Android
    App.addListener('backButton', (data) => {
      console.log('[Capacitor] Back button pressed, canGoBack:', data.canGoBack);
      handleBackButton(data.canGoBack);
    });

    // Set up keyboard listeners
    Keyboard.addListener('keyboardWillShow', (info) => {
      console.log('[Capacitor] Keyboard will show, height:', info.keyboardHeight);
      document.body.classList.add('keyboard-open');
    });

    Keyboard.addListener('keyboardWillHide', () => {
      console.log('[Capacitor] Keyboard will hide');
      document.body.classList.remove('keyboard-open');
    });

    console.log('[Capacitor] Native plugins initialized successfully');

    // Initialize push notification service
    console.log('[Capacitor] Initializing push notification service');
    await pushService.initialize();

    // Opportunistic Tap to Pay warm-up
    console.log('[Capacitor] Opportunistic Tap to Pay warm-up');
    warmUpTapToPay();
  } catch (error) {
    console.error('[Capacitor] Error initializing native plugins:', error);
  }
}

/**
 * Opportunistic Tap to Pay warm-up
 * Initializes TerminalBridgeService SDK plumbing in the background to reduce latency when payment modal opens
 * Does NOT connect or prepare the Tap to Pay reader
 * Completely idempotent - safe to call repeatedly
 * Never reconnects readers, never creates PaymentIntents, never shows UI
 * Failures are silent - payment flow will initialize normally when modal opens
 */
let warmUpInFlight = false;
async function warmUpTapToPay() {
  // Guard against concurrent warm-up calls
  if (warmUpInFlight) {
    console.log('[Capacitor] Tap to Pay warm-up skipped (already in progress)');
    return;
  }

  warmUpInFlight = true;
  try {
    const terminalService = TerminalBridgeService.getInstance();
    if (!terminalService) {
      console.log('[Capacitor] Tap to Pay warm-up skipped (not available on this platform)');
      return;
    }
    const t0 = Date.now();
    await terminalService.initialize();
    const durationMs = Date.now() - t0;
    console.log('[Capacitor] Tap to Pay warm-up completed in', durationMs, 'ms');
    if (durationMs > 300) {
      console.log('[Capacitor] Tap to Pay initialization exceeded 300ms threshold:', durationMs, 'ms');
    }
  } catch (error) {
    // Warm-up is opportunistic - failures are silent
    // Payment flow will initialize normally when modal opens
    console.log('[Capacitor] Tap to Pay warm-up failed (opportunistic, will retry on modal open):', error);
  } finally {
    warmUpInFlight = false;
  }
}

/**
 * Handle deep links from external sources
 * Deep links can be:
 * - Custom scheme: replyflow://calendar?status=connected
 * - Custom scheme: replyflow://dashboard/leads/123
 * - Universal/App Links: https://www.replyflowhq.com/dashboard/leads/123
 */
function handleDeepLink(url: string) {
  console.log('[APP URL OPEN] Received deep link:', url);

  try {
    const urlObj = new URL(url);

    // Log context for diagnostics
    const urlParams = urlObj.searchParams;
    console.log('[APP URL OPEN] Context', {
      protocol: urlObj.protocol,
      pathname: urlObj.pathname,
      hasSessionId: urlParams.has('session_id'),
      hasRecoveryMarker: urlParams.has('recovery'),
      hasReturnMarker: urlParams.has('return_to_app'),
      timestamp: Date.now()
    });

    // Close any open Browser instance when receiving deep-link callback
    // This ensures that if Stripe opened in external Safari and redirected to custom scheme,
    // we close any in-app browser that might be open (defensive cleanup)
    console.log('[BROWSER] close_requested=true');
    Browser.close().then(() => {
      console.log('[BROWSER] close_result=success');
    }).catch((err) => {
      console.log('[BROWSER] close_result=already_closed_or_error', { error: err?.message || 'unknown' });
    });

    // Handle custom scheme (replyflow://)
    if (urlObj.protocol === 'replyflow:') {
      // Special handling for calendar deep link
      if (urlObj.pathname === '/calendar' || urlObj.pathname === 'calendar') {
        const queryParams = urlObj.search;
        const webUrl = `https://www.replyflowhq.com/dashboard/calendar${queryParams}`;
        console.log('[Capacitor] Calendar deep link, navigating to:', webUrl);
        window.location.href = webUrl;
        return;
      }

      // Special handling for billing/success deep link (iOS Stripe checkout return)
      if (urlObj.pathname === '/billing/success' || urlObj.pathname.startsWith('/billing/success')) {
        const queryParams = urlObj.search;
        const webUrl = `https://www.replyflowhq.com/billing/success${queryParams}`;
        console.log('[Capacitor] Billing success deep link, navigating to:', webUrl);
        window.location.href = webUrl;
        return;
      }

      // Convert other custom schemes to web URL
      const webUrl = url.replace('replyflow://', 'https://www.replyflowhq.com/');
      console.log('[Capacitor] Converting custom scheme to web URL:', webUrl);
      window.location.href = webUrl;
      return;
    }

    // Handle universal/app links (https://www.replyflowhq.com/*)
    if (urlObj.hostname.includes('replyflowhq.com')) {
      // Navigate to the route
      const path = urlObj.pathname + urlObj.search + urlObj.hash;
      console.log('[Capacitor] Navigating to path:', path);
      window.location.pathname = path;
      return;
    }

    // Unsupported external links - open in system browser
    console.log('[Capacitor] Opening external link in system browser:', url);
    // Note: Would need @capacitor/browser plugin for this
    // For now, just navigate in the WebView
    window.location.href = url;
  } catch (error) {
    console.error('[Capacitor] Error handling deep link:', error);
  }
}

/**
 * Handle Android hardware back button
 */
function handleBackButton(canGoBack: boolean) {
  try {
    // If there's navigation history, navigate back in the WebView
    if (canGoBack) {
      console.log('[Capacitor] Navigating back via WebView history');
      window.history.back();
      return;
    }

    // No WebView history available – determine safe fallback behavior
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';

    // If we're on a non-root in-app route without history, fall back to Dashboard
    // Examples: /analytics, /dashboard/leads, /dashboard/calendar, /dashboard/payments, /dashboard/settings, lead detail, etc.
    const isDashboardSubroute = path.startsWith('/dashboard/') || (path.startsWith('/dashboard') && path !== '/dashboard');
    if (path === '/analytics' || isDashboardSubroute) {
      console.log('[Capacitor] No history on in-app route, falling back to /dashboard');
      window.location.href = '/dashboard';
      return;
    }

    // At the true root/home with no history – allow app exit
    if (path === '/dashboard') {
      console.log('[Capacitor] At dashboard root with no history, exiting app');
      App.exitApp();
      return;
    }

    // Default: do nothing special
    console.log('[Capacitor] Back button pressed at root context without specific fallback');
  } catch (error) {
    console.error('[Capacitor] Error handling back button:', error);
  }
}

/**
 * Check if running in Capacitor native environment
 */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get Capacitor platform (android, ios, web)
 */
export function getCapacitorPlatform(): string {
  return Capacitor.getPlatform() || 'web';
}

/**
 * Store data securely using Capacitor Preferences
 * This is more secure than localStorage for native apps
 */
export async function setSecureData(key: string, value: string): Promise<void> {
  if (!isCapacitorNative()) {
    localStorage.setItem(key, value);
    return;
  }
  await Preferences.set({ key, value });
}

/**
 * Retrieve secure data
 */
export async function getSecureData(key: string): Promise<string | null> {
  if (!isCapacitorNative()) {
    return localStorage.getItem(key);
  }
  const { value } = await Preferences.get({ key });
  return value || null;
}

/**
 * Remove secure data
 */
export async function removeSecureData(key: string): Promise<void> {
  if (!isCapacitorNative()) {
    localStorage.removeItem(key);
    return;
  }
  await Preferences.remove({ key });
}

/**
 * Clear all secure data (useful for logout)
 */
export async function clearSecureData(): Promise<void> {
  if (!isCapacitorNative()) {
    localStorage.clear();
    return;
  }
  await Preferences.clear();
}
