'use client';

import { useEffect, useState } from 'react';
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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Initialize Capacitor only in native environment
    const init = async () => {
      console.log('[CapacitorInitializer] Component mounted, checking platform');
      console.log('[CapacitorInitializer] window.Capacitor:', (window as any).Capacitor);
      
      // Wait for Capacitor to be available (it might load asynchronously)
      const maxRetries = 5;
      let currentRetry = 0;
      
      const checkAndInit = async () => {
        const isNative = isCapacitorNative();
        console.log('[CapacitorInitializer] isCapacitorNative():', isNative, 'attempt:', currentRetry + 1);
        
        if (isNative) {
          console.log('[CapacitorInitializer] Initializing Capacitor in native environment');
          try {
            await initializeCapacitor();
            console.log('[CapacitorInitializer] Capacitor initialization completed');
          } catch (error) {
            console.error('[CapacitorInitializer] Capacitor initialization failed:', error);
          }
        } else if (currentRetry < maxRetries) {
          // Capacitor might not be ready yet, retry
          currentRetry++;
          setRetryCount(currentRetry);
          console.log('[CapacitorInitializer] Capacitor not ready, retrying in 100ms...');
          setTimeout(checkAndInit, 100);
        } else {
          console.log('[CapacitorInitializer] Max retries reached, running in web browser or Capacitor not available');
        }
      };

      checkAndInit();
    };

    init();
  }, [retryCount]);

  // This component doesn't render anything
  return null;
}
