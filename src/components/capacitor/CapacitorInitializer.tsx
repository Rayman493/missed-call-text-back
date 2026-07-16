'use client';

import { useEffect } from 'react';
import { initializeCapacitor, isCapacitorNative } from '@/capacitor/init';

/**
 * CapacitorInitializer Component
 * 
 * This component initializes Capacitor native plugins when the app loads.
 * It should be placed in the root layout to ensure initialization happens early.
 * 
 * Only initializes when running in a native Capacitor environment (Android/iOS).
 * Does nothing when running in a regular web browser.
 */
export function CapacitorInitializer() {
  useEffect(() => {
    // Initialize Capacitor only in native environment
    const init = async () => {
      if (isCapacitorNative()) {
        console.log('[CapacitorInitializer] Initializing Capacitor in native environment');
        await initializeCapacitor();
      } else {
        console.log('[CapacitorInitializer] Running in web browser, skipping Capacitor initialization');
      }
    };

    init();
  }, []);

  // This component doesn't render anything
  return null;
}
