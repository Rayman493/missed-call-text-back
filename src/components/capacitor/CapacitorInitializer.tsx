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

  useEffect(() => {
    const init = async () => {
      // Prevent multiple initialization attempts
      if (initializedRef.current) {
        return;
      }

      const isNative = isCapacitorNative();
      console.log('[CapacitorInitializer] Native platform:', isNative);

      if (isNative) {
        console.log('[CapacitorInitializer] Initializing Capacitor');
        initializedRef.current = true;
        try {
          await initializeCapacitor();
          console.log('[CapacitorInitializer] Initialization completed');
        } catch (error) {
          console.error('[CapacitorInitializer] Initialization failed:', error);
        }
      } else {
        console.log('[CapacitorInitializer] Web platform, skipping');
      }
    };

    init();
  }, []); // Empty dependency array - run once on mount

  // This component doesn't render anything
  return null;
}
