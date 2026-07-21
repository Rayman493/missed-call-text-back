import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface GoogleAccess {
  accessToken: string
  scope: string | null
  expiresAt: string | null
}

export async function getGoogleAccessToken(businessId: string): Promise<GoogleAccess> {
  const { data: integration, error } = await supabase
    .from('calendar_integrations')
    .select('id, access_token, refresh_token, expires_at, scope')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .single()

  if (error || !integration) {
    throw new Error('google_integration_not_found')
  }

  let accessToken: string = integration.access_token
  let expiresAt: string | null = integration.expires_at

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false

  if (isExpired) {
    if (!integration.refresh_token) throw new Error('google_refresh_token_missing')

    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshResponse.ok) {
      throw new Error('google_token_refresh_failed')
    }

    const tokenData = await refreshResponse.json()
    accessToken = tokenData.access_token
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    await supabase
      .from('calendar_integrations')
      .update({ access_token: accessToken, expires_at: newExpiresAt })
      .eq('id', integration.id)

    expiresAt = newExpiresAt
  }

  return { accessToken, scope: integration.scope || null, expiresAt }
}
