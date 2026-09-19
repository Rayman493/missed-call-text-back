import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicBookingRequest, RESELECTABLE_STATUSES } from '@/lib/booking/requests'
import ReselectSection from './ReselectSection'
import AcceptProposedSection from './AcceptProposedSection'
import type { BookingRequestStatus } from '@/lib/booking/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Booking Request',
  robots: { index: false, follow: false },
}

interface RequestPageProps {
  params: Promise<{ slug: string; token: string }>
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Request not found</h1>
        <p className="text-slate-600">
          This booking request link is invalid or has expired. Please contact the business directly.
        </p>
      </div>
    </div>
  )
}

const STATUS_CONTENT: Record<
  BookingRequestStatus,
  { title: string; body: string; tone: 'neutral' | 'good' | 'bad' | 'action' }
> = {
  pending: {
    title: 'Booking request sent',
    body: 'The business will confirm your time or suggest another one. Keep this page — you can check back here anytime.',
    tone: 'neutral',
  },
  business_proposed: {
    title: 'A new time was suggested',
    body: 'The business suggested a different time. Review it below — you can also choose another available time on this same request.',
    tone: 'action',
  },
  customer_reselected: {
    title: 'You picked a new time',
    body: 'The business will review your new time and confirm or suggest another one.',
    tone: 'neutral',
  },
  accepted: {
    title: 'Booking confirmed',
    body: 'Your time is confirmed. The business will see you then!',
    tone: 'good',
  },
  declined: {
    title: 'Request declined',
    body: 'The business could not take this request. Please contact them directly to find another time.',
    tone: 'bad',
  },
  cancelled: {
    title: 'Request cancelled',
    body: 'This booking request was cancelled.',
    tone: 'bad',
  },
  expired: {
    title: 'Request expired',
    body: 'This booking request expired before it was confirmed. Please contact the business or request a new time.',
    tone: 'bad',
  },
}

const TONE_STYLES: Record<string, string> = {
  neutral: 'bg-blue-50 text-blue-700 border-blue-200',
  good: 'bg-green-50 text-green-700 border-green-200',
  bad: 'bg-red-50 text-red-700 border-red-200',
  action: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default async function BookingRequestPage({ params }: RequestPageProps) {
  const { token } = await params
  const view = await getPublicBookingRequest(token)
  if (!view) return <NotFound />

  const content = STATUS_CONTENT[view.status] ?? STATUS_CONTENT.pending
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: view.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const requestedLabel = `${fmt.format(new Date(view.requestedStart))} – ${new Intl.DateTimeFormat('en-US', {
    timeZone: view.timezone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(view.requestedEnd))}`

  const shortProposedLabel = view.proposedStart && view.proposedEnd
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: view.timezone,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(view.proposedStart))
    : null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-slate-500">{view.businessName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{content.title}</h1>

          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${TONE_STYLES[content.tone]}`}>
            {content.body}
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            {view.service && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Service</dt>
                <dd className="font-medium text-slate-900 text-right">{view.service}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Requested time</dt>
              <dd className="font-medium text-slate-900 text-right">{requestedLabel}</dd>
            </div>
            {view.proposedStart && view.proposedEnd && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Suggested time</dt>
                <dd className="font-medium text-amber-700 text-right">
                  {`${fmt.format(new Date(view.proposedStart))} – ${new Intl.DateTimeFormat('en-US', {
                    timeZone: view.timezone, hour: 'numeric', minute: '2-digit',
                  }).format(new Date(view.proposedEnd))}`}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900 text-right">{view.customerName}</dd>
            </div>
          </dl>

          {/* Customer accepts the business-proposed time. */}
          {view.businessSlug && view.status === 'business_proposed' && shortProposedLabel && (
            <div className="mt-6">
              <AcceptProposedSection
                token={token}
                slug={view.businessSlug}
                businessName={view.businessName}
                proposedLabel={shortProposedLabel}
              />
            </div>
          )}

          {/* Same-request reselection — one negotiation stays one request.
              Only active statuses may re-pick a time on this identity. */}
          {view.businessSlug && RESELECTABLE_STATUSES.includes(view.status) && (
            <div className="mt-6">
              <ReselectSection
                slug={view.businessSlug}
                token={token}
                timezone={view.timezone}
                durationMinutes={view.durationMinutes}
              />
            </div>
          )}
        </div>

        {/* Fresh requests only for TERMINAL negotiations — an active request
            is renegotiated in place above, never duplicated through /book/[slug]. */}
        {view.businessSlug && !RESELECTABLE_STATUSES.includes(view.status) && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Need a different time?{' '}
            <Link href={`/book/${view.businessSlug}`} className="font-medium text-blue-600 hover:text-blue-700">
              Request a new time
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
