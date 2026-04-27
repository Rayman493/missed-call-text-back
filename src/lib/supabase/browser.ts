import { createClient } from '@supabase/supabase-js'

// Safe browser client - returns null if env vars are missing (doesn't throw)
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Legacy export for backward compatibility
export const supabase = createBrowserClient()
