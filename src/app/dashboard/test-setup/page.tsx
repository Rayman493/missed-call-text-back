'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TestSetupPage() {
  const router = useRouter()

  // Redirect to dashboard with setup mode flag - all setup now lives in the dashboard
  useEffect(() => {
    router.replace('/dashboard?setup=1')
  }, [router])

  return null
}
