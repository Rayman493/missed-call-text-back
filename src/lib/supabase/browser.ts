import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null
let isCreating = false

// Singleton browser client - prevents multiple GoTrueClient instances
export function createBrowserClient() {
  if (browserClient) return browserClient
  if (isCreating) {
    // Return null temporarily if client is being created to prevent race conditions
    return null
  }

  isCreating = true

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[browser-client] Missing Supabase browser env vars')
    isCreating = false
    return null
  }

  browserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    }
  })
  console.log('[browser-client] Created singleton Supabase client with persistent session options and localStorage storage')
  isCreating = false
  return browserClient
}

// Legacy export for backward compatibility
export const supabase = createBrowserClient()
