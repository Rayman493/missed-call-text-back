'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Network } from '@capacitor/network'
import OfflineScreen from './OfflineScreen'
import { isCapacitorNative } from '@/capacitor/init'

interface NativeOfflineBoundaryProps {
  children: React.ReactNode
}

export default function NativeOfflineBoundary({ children }: NativeOfflineBoundaryProps) {
  const router = useRouter()
  const [isOffline, setIsOffline] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isNative, setIsNative] = useState(false)

  // Check if running in native Capacitor environment
  useEffect(() => {
    setIsNative(isCapacitorNative())
  }, [])

  // Initial network status check
  useEffect(() => {
    if (!isNative) return

    const checkInitialStatus = async () => {
      try {
        const status = await Network.getStatus()
        setIsOffline(!status.connected)
      } catch (error) {
        console.error('[OFFLINE BOUNDARY] Failed to get initial network status:', error)
        // Default to online if we can't check status
        setIsOffline(false)
      }
    }

    checkInitialStatus()
  }, [isNative])

  // Listen for network status changes
  useEffect(() => {
    if (!isNative) return

    const networkListener = Network.addListener('networkStatusChange', (status) => {
      setIsOffline(!status.connected)
      
      // Auto-recover when connectivity returns
      if (status.connected && isOffline) {
        setTimeout(() => {
          window.location.reload()
        }, 500)
      }
    })

    return () => {
      networkListener.then(listener => listener.remove())
    }
  }, [isNative, isOffline])

  const handleRetry = async () => {
    setIsRetrying(true)
    
    try {
      const status = await Network.getStatus()
      
      if (status.connected) {
        window.location.reload()
      } else {
        setIsRetrying(false)
      }
    } catch (error) {
      console.error('[OFFLINE BOUNDARY] Failed to check network status on retry:', error)
      setIsRetrying(false)
    }
  }

  // Only render offline boundary in native Capacitor environment
  if (!isNative) {
    return <>{children}</>
  }

  // Show offline screen when offline
  if (isOffline) {
    return <OfflineScreen onRetry={handleRetry} isRetrying={isRetrying} />
  }

  // Render children normally when online
  return <>{children}</>
}
