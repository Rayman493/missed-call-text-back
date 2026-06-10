'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ForwardingSetupPage() {
  const router = useRouter()

  // Redirect to dashboard - all setup now lives in the dashboard
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return null
}
