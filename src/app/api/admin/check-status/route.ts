import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

// Admin user IDs who can access admin features
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()).filter(id => id.length > 0) || []

console.log('[ADMIN CHECK API] Admin user IDs from environment:', {
  envVar: process.env.ADMIN_USER_IDS,
  adminIds: ADMIN_USER_IDS,
  count: ADMIN_USER_IDS.length
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.log('[ADMIN CHECK API] No user authenticated')
      return NextResponse.json({ isAdmin: false, userId: null })
    }

    const isAdmin = ADMIN_USER_IDS.includes(user.id)

    console.log('[ADMIN CHECK API] Admin check result:', {
      userId: user.id,
      email: user.email,
      adminIds: ADMIN_USER_IDS,
      isAdmin
    })

    return NextResponse.json({
      isAdmin,
      userId: user.id,
      email: user.email
    })
  } catch (error: any) {
    console.error('[ADMIN CHECK API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
