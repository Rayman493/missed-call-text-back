import { createClient } from '@supabase/supabase-js'

export type MeetCapability = 'available' | 'reauthorization_required'

export function hasMeetScope(scope: string | null | undefined): boolean {
  const scopes = new Set(
    String(scope || '')
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)
  )
  return scopes.has('https://www.googleapis.com/auth/meetings.space.readonly')
}

export async function getMeetCapability(businessId: string): Promise<MeetCapability> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: integration, error } = await supabase
    .from('calendar_integrations')
    .select('scope, updated_at, id')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !integration) return 'reauthorization_required'

  return hasMeetScope(integration.scope) ? 'available' : 'reauthorization_required'
}
