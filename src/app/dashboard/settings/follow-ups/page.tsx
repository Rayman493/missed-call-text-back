'use client'

import { useRouter } from 'next/navigation'
import FollowUpSettings from '@/components/FollowUpSettings'

export default function FollowUpsSettingsPage() {
  const router = useRouter()

  const handleClose = () => {
    router.push('/dashboard/settings')
  }

  return (
    <FollowUpSettings
      isOpen={true}
      onClose={handleClose}
      onSave={() => {
        router.push('/dashboard/settings')
      }}
    />
  )
}
