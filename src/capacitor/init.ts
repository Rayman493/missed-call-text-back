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
import { pushService } from '@/lib/push-service';

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

  try {
    // Initialize Status Bar
    await StatusBar.setStyle({ style: Style.Dark })
    console.log('[Capacitor] Status bar configured');
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
    console.log('[Capacitor] Status bar configured');

    // Hide splash screen
    await SplashScreen.hide();
    console.log('[Capacitor] Splash screen hidden');

    // Set up app state listeners
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App state changed:', isActive ? 'active' : 'inactive');
      // Could be used for session restoration, pause/resume logic, etc.
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
  } catch (error) {
    console.error('[Capacitor] Error initializing native plugins:', error);
  }
}

/**
 * Handle deep links from external sources
 * Deep links can be:
 * - Custom scheme: replyflow://dashboard/leads/123
 * - Universal/App Links: https://www.replyflowhq.com/dashboard/leads/123
 */
function handleDeepLink(url: string) {
  console.log('[Capacitor] Handling deep link:', url);

  try {
    const urlObj = new URL(url);
    
    // Handle custom scheme (replyflow://)
    if (urlObj.protocol === 'replyflow:') {
      // Convert custom scheme to web URL
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
  // If there's navigation history, let the WebView handle it
  if (canGoBack) {
    console.log('[Capacitor] Allowing WebView to handle back button');
    // The WebView will handle navigation back
    return;
  }

  // If no navigation history, this is the root - could show exit confirmation
  console.log('[Capacitor] At root, back button pressed');
  // For now, don't exit immediately - let user confirm or handle differently
  // Could show a confirmation dialog before exiting
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
