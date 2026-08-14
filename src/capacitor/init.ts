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
import { createBrowserClient } from '@/lib/supabase/browser';
import { handleExternalReturn, handleAppResume } from '@/lib/external-return-handler';

// Import production web checkout plugin for native iOS Stripe checkout
// This provides automatic return-to-app behavior using ASWebAuthenticationSession
import '@/lib/web-checkout';

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

  // In Capacitor native environment, NEXT_PUBLIC_* variables are embedded in the bundle
  // at build time by Next.js and are not available as process.env at runtime.
  // The actual Supabase client configuration is authoritative.
  // Skip this runtime process.env check for native clients.
  if (Capacitor.isNativePlatform()) {
    console.log('[Config] Native client - skipping runtime process.env validation (values embedded at build time)');
    return;
  }

  console.log('[Config] Validating production configuration...');

  // Check for required environment variables (server/desktop only)
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
    App.addListener('appStateChange', async ({ isActive }) => {
      console.log('[Capacitor] App state changed:', isActive ? 'active' : 'inactive');

      // Handle external return reconciliation on app resume
      if (isActive) {
        await handleAppResume();
        // Warm up Tap to Pay when app returns to foreground
        warmUpTapToPay();
      }
    });

    // Set up URL/open URL listeners for deep links
    App.addListener('appUrlOpen', async (data) => {
      console.log('[Capacitor] App opened with URL:', data.url);

      // Handle external return reconciliation for Stripe flows
      await handleExternalReturn(data.url);

      // Handle deep links
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

    // Opportunistic Tap to Pay warm-up (now with eligibility checks)
    console.log('[TTP WARMUP] checking eligibility...');
    warmUpTapToPay();
  } catch (error) {
    console.error('[Capacitor] Error initializing native plugins:', error);
  }
}

/**
 * Check if Tap to Pay warm-up prerequisites are met
 * Returns true only when all conditions for successful Terminal initialization are satisfied
 */
async function isTapToPayWarmUpEligible(): Promise<{ eligible: boolean; reason?: string }> {
  try {
    // Check for authenticated session
    const supabase = createBrowserClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { eligible: false, reason: 'no_session' }
    }

    // Check for business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (businessError || !business) {
      return { eligible: false, reason: 'no_business' }
    }

    // Check for Stripe Connect account
    if (!business.stripe_connect_account_id) {
      return { eligible: false, reason: 'no_stripe_account' }
    }

    // Check Stripe Connect status
    if (business.stripe_connect_status !== 'connected') {
      return { eligible: false, reason: 'stripe_not_connected' }
    }

    // Check charges enabled
    if (!business.stripe_charges_enabled) {
      return { eligible: false, reason: 'stripe_charges_not_enabled' }
    }

    return { eligible: true }
  } catch (error) {
    // If we can't check eligibility, skip warm-up rather than risk errors
    console.log('[TTP WARMUP] Eligibility check failed, skipping warm-up:', error)
    return { eligible: false, reason: 'eligibility_check_failed' }
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
    console.log('[TTP WARMUP] skipped (already in progress)');
    return;
  }

  warmUpInFlight = true;
  try {
    // Check eligibility before initializing
    const { eligible, reason } = await isTapToPayWarmUpEligible()

    if (!eligible) {
      console.log('[TTP WARMUP] skipped reason=', reason);
      return;
    }

    const terminalService = TerminalBridgeService.getInstance();
    if (!terminalService) {
      console.log('[TTP WARMUP] skipped (not available on this platform)');
      return;
    }

    console.log('[TTP WARMUP] eligible=true, proceeding with warm-up');
    const t0 = Date.now();
    await terminalService.initialize();
    const durationMs = Date.now() - t0;
    console.log('[TTP WARMUP] completed in', durationMs, 'ms');
    if (durationMs > 300) {
      console.log('[TTP WARMUP] initialization exceeded 300ms threshold:', durationMs, 'ms');
    }
  } catch (error) {
    // Warm-up is opportunistic - failures are silent
    // Payment flow will initialize normally when modal opens
    console.log('[TTP WARMUP] failed (opportunistic, will retry on modal open):', error);
  } finally {
    warmUpInFlight = false;
  }
}

// Simple deduplication for deep link callbacks
let lastProcessedDeepLink: string | null = null;
let lastProcessedTime: number = 0;
const DEEP_LINK_DEDUP_WINDOW_MS = 2000; // Ignore same URL within 2 seconds

/**
 * Handle deep links from external sources
 * Deep links can be:
 * - Custom scheme: replyflow://calendar?status=connected
 * - Custom scheme: replyflow://dashboard/leads/123
 * - Universal/App Links: https://www.replyflowhq.com/dashboard/leads/123
 */
function handleDeepLink(url: string) {
  console.log('[APP URL OPEN] Received deep link:', url);

  // Deduplication: ignore duplicate URLs within time window
  const now = Date.now();
  if (lastProcessedDeepLink === url && (now - lastProcessedTime) < DEEP_LINK_DEDUP_WINDOW_MS) {
    console.log('[APP URL OPEN] Duplicate callback ignored (dedup window)');
    return;
  }
  lastProcessedDeepLink = url;
  lastProcessedTime = now;

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
      timestamp: now
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

    // Handle universal/app links (https://www.replyflowhq.com/* or https://links.replyflowhq.com/*)
    // SECURITY: Only accept exact approved hostnames to prevent open redirects
    const approvedHostnames = ['www.replyflowhq.com', 'links.replyflowhq.com']
    if (urlObj.protocol === 'https:' && approvedHostnames.includes(urlObj.hostname)) {
      console.log('[UNIVERSAL LINK] Approved hostname detected:', urlObj.hostname)

      // Special handling for billing/success Universal Link (iOS Stripe checkout return)
      if (urlObj.pathname === '/billing/success' || urlObj.pathname.startsWith('/billing/success')) {
        const urlParams = urlObj.searchParams
        const sessionId = urlParams.get('session_id')
        const isFromLinksHost = urlObj.hostname === 'links.replyflowhq.com'

        console.log('[UNIVERSAL LINK] Stripe billing/success detected', {
          hostname: urlObj.hostname,
          hasSessionId: !!sessionId,
          isFromLinksHost
        })

        // Add recovery marker to prevent duplicate recovery attempts
        urlParams.set('recovery', '1')

        // Canonicalize to www.replyflowhq.com for internal WebView
        // This ensures the internal WebView always runs on the canonical host
        const canonicalHostname = 'www.replyflowhq.com'
        const recoveredPath = `https://${canonicalHostname}/billing/success?${urlParams.toString()}`

        console.log('[UNIVERSAL LINK] Canonicalizing internal WebView to:', canonicalHostname)

        window.location.href = recoveredPath
        return
      }

      // For other Universal Links, navigate normally
      const path = urlObj.pathname + urlObj.search + urlObj.hash
      console.log('[UNIVERSAL LINK] Navigating to path:', path)
      window.location.pathname = path
      return
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
