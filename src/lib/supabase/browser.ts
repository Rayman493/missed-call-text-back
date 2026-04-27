import { createClient } from '@supabase/supabase-js'

let browserClient: ReturnType<typeof createClient> | null = null

// Singleton browser client - prevents multiple GoTrueClient instances
export function createBrowserClient() {
  if (browserClient) return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[browser-client] Missing Supabase browser env vars')
    return null
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey)
  console.log('[browser-client] Created singleton Supabase client')
  return browserClient
}

// Legacy export for backward compatibility
export const supabase = createBrowserClient()
