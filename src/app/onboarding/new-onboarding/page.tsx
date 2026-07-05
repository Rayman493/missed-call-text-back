'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewOnboardingPage() {
  const router = useRouter()

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const searchParams = currentUrl.searchParams.toString()
    const targetUrl = searchParams ? `/setup/forwarding?${searchParams}` : '/setup/forwarding'

    router.replace(targetUrl)
  }, [router])

  return null
}
