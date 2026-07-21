import { createClient } from '@supabase/supabase-js'

// Server-only client for reading calendar integration scopes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type MeetCapability = 'available' | 'reauthorization_required'

export async function getMeetCapability(businessId: string): Promise<MeetCapability> {
  const { data: integration, error } = await supabase
    .from('calendar_integrations')
    .select('scope')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .maybeSingle()

  if (error || !integration) return 'reauthorization_required'

  const scopeStr: string = integration.scope || ''
  const hasMeet = scopeStr.split(/[\s,]+/).includes('https://www.googleapis.com/auth/meetings.space.readonly')
  return hasMeet ? 'available' : 'reauthorization_required'
}
