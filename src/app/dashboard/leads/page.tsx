'use client'

import { useEffect } from 'react'

export default function LeadsPage() {
  useEffect(() => {
    console.log('[STATIC LEADS TEST] Mounted')
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>Static Leads Test</h1>
      <p>If this page stays visible, routing is working.</p>
    </div>
  )
}

