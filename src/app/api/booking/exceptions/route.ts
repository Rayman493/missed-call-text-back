import { NextResponse } from 'next/server'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { bookingAdmin } from '@/lib/booking/settings'

export const dynamic = 'force-dynamic'

/**
 * POST /api/booking/exceptions — add a manual blocked-time exception.
 * Body: { startAt: ISO, endAt: ISO, allDay?: boolean, label?: string }
 * The label is internal-only and never leaves the business surface.
 */
export async function POST(request: Request) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { startAt?: unknown; endAt?: unknown; allDay?: unknown; label?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const start = new Date(String(body.startAt ?? ''))
  const end = new Date(String(body.endAt ?? ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(start < end)) {
    return NextResponse.json({ error: 'A valid start and end time are required' }, { status: 400 })
  }
  if (end.getTime() - start.getTime() > 366 * 86_400_000) {
    return NextResponse.json({ error: 'Exception range is too long' }, { status: 400 })
  }

  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 200)
      : null

  const supabase = bookingAdmin()
  const { data, error } = await supabase
    .from('booking_exceptions')
    .insert({
      business_id: auth.businessId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: body.allDay === true,
      label,
    })
    .select()
    .single()

  if (error) {
    console.error('[BOOKING] exception insert failed:', error)
    return NextResponse.json({ error: 'Could not save exception' }, { status: 500 })
  }

  return NextResponse.json({ exception: data })
}

/** DELETE /api/booking/exceptions?id=<uuid> — owner-scoped delete. */
export async function DELETE(request: Request) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = new URL(request.url).searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid exception id' }, { status: 400 })
  }

  const supabase = bookingAdmin()
  const { error } = await supabase
    .from('booking_exceptions')
    .delete()
    .eq('id', id)
    .eq('business_id', auth.businessId)

  if (error) {
    console.error('[BOOKING] exception delete failed:', error)
    return NextResponse.json({ error: 'Could not delete exception' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
