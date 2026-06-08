'use client'

import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'

export default function RoutingDebugBanner() {
  const { business, loading: businessLoading, fetchComplete, businessMissingConfirmed, error: businessError } = useBusiness()
  const { user, session } = useAuth()
  const pathname = usePathname()

  // Only show in development or if debug query param is present
  const isDev = process.env.NODE_ENV === 'development'
  const showDebug = isDev || typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('debug')

  if (!showDebug) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: '#ff0000',
      color: 'white',
      padding: '8px',
      fontSize: '12px',
      zIndex: 9999,
      fontFamily: 'monospace',
      overflow: 'auto',
      maxHeight: '200px'
    }}>
      <div><strong>[ROUTING DEBUG BANNER]</strong></div>
      <div>Path: {pathname}</div>
      <div>Auth User ID: {user?.id || 'null'}</div>
      <div>Session Exists: {session ? 'true' : 'false'}</div>
      <div>Business Loading: {businessLoading ? 'true' : 'false'}</div>
      <div>Business Fetch Complete: {fetchComplete ? 'true' : 'false'}</div>
      <div>Business Found: {business ? `true (${business.id})` : 'false'}</div>
      <div>Business Missing Confirmed: {businessMissingConfirmed ? 'true' : 'false'}</div>
      <div>Business Error Code: {businessError || 'null'}</div>
      <div>Business Name: {business?.name || 'null'}</div>
      <div style={{ marginTop: '4px', color: '#ffff00' }}>
        {business ? '→ Should go to DASHBOARD' : businessMissingConfirmed ? '→ Should go to ONBOARDING (PGRST116)' : '→ Loading or error, should wait'}
      </div>
    </div>
  )
}
