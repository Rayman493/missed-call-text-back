import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.replyflowhq.app',
  appName: 'ReplyFlow',
  webDir: 'out',
  server: {
    // For internal preview, point to hosted ReplyFlow application
    // This avoids static export complexity and allows quick iteration
    // Change this URL for different environments (dev, staging, production)
    url: process.env.CAPACITOR_SERVER_URL || 'https://www.replyflowhq.com',
    cleartext: true,
  },
  // Deep link configuration
  // Custom scheme: replyflow://
  // Universal/App Links: https://www.replyflowhq.com/*
  // Note: Deep linking is configured in AndroidManifest.xml (Android) and Info.plist (iOS)
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    webContentsDebuggingEnabled: true,
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
      resizeOnFullScreen: true,
    },
  },
};

export default config;
