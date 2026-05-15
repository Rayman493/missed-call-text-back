'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

export default function SessionDebugPage() {
  const [debugInfo, setDebugInfo] = useState<any>(null)

  useEffect(() => {
    const gatherDebugInfo = async () => {
      const supabase = createBrowserClient()
      
      // Get session and user
      const { data: sessionData, error: sessionError } = await supabase?.auth.getSession()
      const { data: userData, error: userError } = await supabase?.auth.getUser()
      
      // Get localStorage keys related to auth
      const localStorageKeys: string[] = []
      if (typeof window !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
            localStorageKeys.push(key)
          }
        }
      }

      // Get cookie names
      const cookieNames = document.cookie.split(';').map(c => c.trim().split('=')[0])

      setDebugInfo({
        currentUrl: window.location.href,
        userAgent: navigator.userAgent,
        sessionExists: !!sessionData?.session,
        userId: sessionData?.session?.user?.id || userData?.user?.id,
        sessionError: sessionError?.message,
        userError: userError?.message,
        localStorageKeys,
        cookieNames,
        sessionData: {
          access_token: sessionData?.session?.access_token ? 'exists' : 'missing',
          refresh_token: sessionData?.session?.refresh_token ? 'exists' : 'missing',
          expires_at: sessionData?.session?.expires_at,
          user_id: sessionData?.session?.user?.id,
        },
        userData: {
          id: userData?.user?.id,
          email: userData?.user?.email,
        },
      })
    }

    gatherDebugInfo()
  }, [])

  if (!debugInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p>Loading debug info...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Session Debug</h1>
        
        <div className="space-y-6">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">URL & User Agent</h2>
            <div className="space-y-2 font-mono text-sm">
              <p><strong>Current URL:</strong> {debugInfo.currentUrl}</p>
              <p><strong>User Agent:</strong> {debugInfo.userAgent}</p>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Session Status</h2>
            <div className="space-y-2 font-mono text-sm">
              <p><strong>Session Exists:</strong> {debugInfo.sessionExists ? '✅ YES' : '❌ NO'}</p>
              <p><strong>User ID:</strong> {debugInfo.userId || 'N/A'}</p>
              {debugInfo.sessionError && <p className="text-red-500"><strong>Session Error:</strong> {debugInfo.sessionError}</p>}
              {debugInfo.userError && <p className="text-red-500"><strong>User Error:</strong> {debugInfo.userError}</p>}
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Session Data</h2>
            <div className="space-y-2 font-mono text-sm">
              <p><strong>Access Token:</strong> {debugInfo.sessionData.access_token}</p>
              <p><strong>Refresh Token:</strong> {debugInfo.sessionData.refresh_token}</p>
              <p><strong>Expires At:</strong> {debugInfo.sessionData.expires_at}</p>
              <p><strong>User ID:</strong> {debugInfo.sessionData.user_id}</p>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">User Data</h2>
            <div className="space-y-2 font-mono text-sm">
              <p><strong>ID:</strong> {debugInfo.userData.id || 'N/A'}</p>
              <p><strong>Email:</strong> {debugInfo.userData.email || 'N/A'}</p>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">LocalStorage Keys (Auth Related)</h2>
            <div className="font-mono text-sm">
              {debugInfo.localStorageKeys.length > 0 ? (
                <ul className="list-disc list-inside space-y-1">
                  {debugInfo.localStorageKeys.map((key: string) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              ) : (
                <p>No auth-related localStorage keys found</p>
              )}
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Cookie Names</h2>
            <div className="font-mono text-sm">
              {debugInfo.cookieNames.length > 0 ? (
                <ul className="list-disc list-inside space-y-1">
                  {debugInfo.cookieNames.map((name: string) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p>No cookies found</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
