'use client';

import { useEffect, useRef } from 'react';
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
  const initializedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Prevent multiple initialization attempts
    if (initializedRef.current) {
      return;
    }

    const init = async () => {
      console.log('[CapacitorInitializer] Checking platform');
      
      // Wait for Capacitor to be available (it might load asynchronously)
      const maxRetries = 5;
      let currentRetry = 0;
      
      const checkAndInit = async () => {
        const isNative = isCapacitorNative();
        console.log('[CapacitorInitializer] isCapacitorNative():', isNative, 'attempt:', currentRetry + 1);
        
        if (isNative) {
          console.log('[CapacitorInitializer] Initializing Capacitor');
          initializedRef.current = true;
          try {
            await initializeCapacitor();
            console.log('[CapacitorInitializer] Initialization completed');
          } catch (error) {
            console.error('[CapacitorInitializer] Initialization failed:', error);
          }
        } else if (currentRetry < maxRetries) {
          // Capacitor might not be ready yet, retry
          currentRetry++;
          console.log('[CapacitorInitializer] Retrying in 100ms...');
          timerRef.current = setTimeout(checkAndInit, 100);
        } else {
          console.log('[CapacitorInitializer] Max retries reached, web mode');
        }
      };

      checkAndInit();
    };

    init();

    // Cleanup timer on unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []); // Empty dependency array - run once on mount

  // This component doesn't render anything
  return null;
}
