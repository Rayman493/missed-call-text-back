import { useState, useEffect } from 'react'

/**
 * Hook to detect if the current device is a touch device
 * SSR-safe - defaults to false on server
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsTouchDevice(hasTouch)
  }, [])

  return isTouchDevice
}