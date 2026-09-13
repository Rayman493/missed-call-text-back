import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null
let browserClientPromise: Promise<ReturnType<typeof createSupabaseBrowserClient> | null> | null = null

// Singleton browser client - prevents multiple GoTrueClient instances.
//
// The previous implementation returned `null` while a client was being
// created (via an `isCreating` flag). This caused callers that hit the
// race window to receive `null` and either crash or skip auth entirely,
// which on Android contributed to inconsistent session state during
// startup. The contract is now: always return the singleton instance
// (or null only if env vars are missing). Synchronous construction is
// safe because `createSupabaseBrowserClient` is itself synchronous.
export function createBrowserClient() {
  if (browserClient) return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[browser-client] Missing Supabase browser env vars')
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
  return browserClient
}

// Legacy export for backward compatibility
export const supabase = createBrowserClient()
