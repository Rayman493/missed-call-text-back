import { CapacitorConfig } from '@capacitor/cli';

// Determine if we're in production build
const isProduction = process.env.NODE_ENV === 'production';

// Validate production URL to prevent accidental misconfiguration
function validateProductionUrl(url: string): string {
  if (!isProduction) {
    // Allow any URL in development
    return url;
  }

  // In production, only allow known production hosts
  const allowedProductionHosts = [
    'www.replyflowhq.com',
    'replyflowhq.com',
  ];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check if hostname is in allowed list
    const isAllowed = allowedProductionHosts.some(allowedHost => 
      hostname === allowedHost || hostname.endsWith('.' + allowedHost)
    );

    if (!isAllowed) {
      console.error(`[CAPACITOR CONFIG] Production build rejected URL: ${url}`);
      console.error(`[CAPACITOR CONFIG] Allowed production hosts: ${allowedProductionHosts.join(', ')}`);
      throw new Error(`Production build cannot use URL: ${url}. Allowed hosts: ${allowedProductionHosts.join(', ')}`);
    }

    return url;
  } catch (error) {
    console.error(`[CAPACITOR CONFIG] Invalid URL: ${url}`, error);
    throw new Error(`Invalid CAPACITOR_SERVER_URL: ${url}`);
  }
}

const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://www.replyflowhq.com';
const validatedUrl = validateProductionUrl(serverUrl);

const config: CapacitorConfig = {
  appId: 'com.replyflowhq.app',
  appName: 'ReplyFlow',
  webDir: 'public',
  server: {
    // For internal preview, point to hosted ReplyFlow application
    // This avoids static export complexity and allows quick iteration
    // Change this URL for different environments (dev, staging, production)
    url: validatedUrl,
    // Production: disable cleartext for security
    // Development: allow cleartext for local development
    cleartext: !isProduction,
  },
  // Deep link configuration
  // Custom scheme: replyflow://
  // Universal/App Links: https://www.replyflowhq.com/*
  // Note: Deep linking is configured in AndroidManifest.xml (Android) and Info.plist (iOS)
  android: {
    // Production: disable mixed content for security
    // Development: allow mixed content for local development
    allowMixedContent: !isProduction,
    captureInput: false,
    // Production: disable WebView debugging for security
    // Development: enable WebView debugging for development
    webContentsDebuggingEnabled: !isProduction,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    // Production: disable WebView debugging for security
    // Development: enable WebView debugging for development
    webContentsDebuggingEnabled: !isProduction,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'horizontal',
      spinnerColor: '#2563eb',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    Keyboard: {
      resizeOnFullScreen: false,
    },
  },
};

export default config;
