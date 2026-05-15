'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

export default function StorageDebugPage() {
  const [storageInfo, setStorageInfo] = useState<any>(null)
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<string>('unknown')
  const [pathname, setPathname] = useState<string>('')

  const handleClearAll = async () => {
    console.log('[Storage Debug] Clearing ALL site storage')
    
    // Clear localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear()
      console.log('[Storage Debug] localStorage cleared')
    }
    
    // Clear sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.clear()
      console.log('[Storage Debug] sessionStorage cleared')
    }
    
    // Unregister service workers
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        await registration.unregister()
        console.log('[Storage Debug] Service worker unregistered')
      }
    }
    
    // Reload page
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  useEffect(() => {
    const gatherStorageInfo = async () => {
      const supabase = createBrowserClient()
      
      // Get session
      const { data: { session } } = await supabase.auth.getSession()
      
      // Get localStorage
      const localStorageData: Record<string, string> = {}
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key) {
            localStorageData[key] = localStorage.getItem(key) || ''
          }
        }
      }
      
      // Get sessionStorage
      const sessionStorageData: Record<string, string> = {}
      if (typeof window !== 'undefined' && window.sessionStorage) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key) {
            sessionStorageData[key] = sessionStorage.getItem(key) || ''
          }
        }
      }
      
      // Get service worker status
      let swStatus = 'not_supported'
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        if (registrations.length > 0) {
          swStatus = `registered (${registrations.length} workers)`
        } else {
          swStatus = 'none_registered'
        }
      }
      
      setStorageInfo({
        localStorage: localStorageData,
        sessionStorage: sessionStorageData,
        sessionExists: !!session,
        sessionUserId: session?.user?.id,
        sessionEmail: session?.user?.email,
      })
      
      setServiceWorkerStatus(swStatus)
      setPathname(window.location.pathname)
    }
    
    gatherStorageInfo()
  }, [])

  if (!storageInfo) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <p>Loading storage info...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Storage Debug</h1>
        
        <div className="mb-6 space-y-4">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Current Status</h2>
            <div className="space-y-2 font-mono text-sm">
              <p><strong>Pathname:</strong> {pathname}</p>
              <p><strong>Service Worker:</strong> {serviceWorkerStatus}</p>
              <p><strong>Supabase Session:</strong> {storageInfo.sessionExists ? 'YES' : 'NO'}</p>
              {storageInfo.sessionUserId && <p><strong>Session User ID:</strong> {storageInfo.sessionUserId}</p>}
              {storageInfo.sessionEmail && <p><strong>Session Email:</strong> {storageInfo.sessionEmail}</p>}
            </div>
          </div>
          
          <button
            onClick={handleClearAll}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Clear ALL Site Storage (and reload)
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Local Storage ({Object.keys(storageInfo.localStorage).length} items)</h2>
            {Object.keys(storageInfo.localStorage).length === 0 ? (
              <p className="text-gray-500">No localStorage items</p>
            ) : (
              <div className="space-y-2 font-mono text-sm max-h-96 overflow-y-auto">
                {Object.entries(storageInfo.localStorage).map(([key, value]) => (
                  <div key={key} className="p-2 bg-muted rounded">
                    <p className="font-semibold">{key}</p>
                    <p className="text-gray-600 break-all">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Session Storage ({Object.keys(storageInfo.sessionStorage).length} items)</h2>
            {Object.keys(storageInfo.sessionStorage).length === 0 ? (
              <p className="text-gray-500">No sessionStorage items</p>
            ) : (
              <div className="space-y-2 font-mono text-sm max-h-96 overflow-y-auto">
                {Object.entries(storageInfo.sessionStorage).map(([key, value]) => (
                  <div key={key} className="p-2 bg-muted rounded">
                    <p className="font-semibold">{key}</p>
                    <p className="text-gray-600 break-all">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
