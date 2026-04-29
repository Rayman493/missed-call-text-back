'use client'

import OnboardingSuccess from '@/components/OnboardingSuccess'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'

export default function OnboardingSuccessPage() {
  return (
    <AuthGuard>
      <BusinessGuard>
        <OnboardingSuccess />
      </BusinessGuard>
    </AuthGuard>
  )
}
