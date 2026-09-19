/**
 * Online Booking — shared authenticated-route helper.
 * Bearer token → user → owned business. Mirrors the send-sms route pattern.
 */

import { createClient } from '@supabase/supabase-js'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

export type AuthedBusiness =
  | { ok: true; businessId: string; userId: string }
  | { ok: false; status: number; error: string }

export async function getAuthedBusiness(request: Request): Promise<AuthedBusiness> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { ok: false, status: 401, error: 'Unauthorized' }

  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) return { ok: false, status: 401, error: 'Unauthorized' }

  const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
  if (!authResult.success) {
    return { ok: false, status: authResult.statusCode, error: authResult.error }
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!business) return { ok: false, status: 404, error: 'Business not found' }

  return { ok: true, businessId: business.id, userId: user.id }
}
