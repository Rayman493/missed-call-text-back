import type { Metadata } from 'next'
import { getPublicBookingBusiness } from '@/lib/booking/settings'
import PublicBookingClient from './PublicBookingClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Request a Booking',
  robots: { index: false, follow: false },
}

interface BookPageProps {
  params: Promise<{ slug: string }>
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params
  const business = await getPublicBookingBusiness(slug)

  // Invalid slug and disabled booking are indistinguishable publicly.
  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Booking unavailable</h1>
          <p className="text-slate-600">
            This booking page is not available. Please contact the business directly.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PublicBookingClient
      slug={slug}
      businessName={business.name}
      logoUrl={business.logoUrl}
      timezone={business.settings.timezone}
      durationMinutes={business.settings.default_duration_minutes}
    />
  )
}
