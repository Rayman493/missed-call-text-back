'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PhoneForwardingPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard - call forwarding setup is now handled via modal
    router.replace('/dashboard')
  }, [router])

  return null
}

