import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Rate limiting: simple in-memory counter
const verificationAttempts = new Map<string, { count: number; lastAttempt: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = verificationAttempts.get(userId)

  if (!record) {
    verificationAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    verificationAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false
  }

  record.count++
  return true
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    // Get user from session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Ignore setAll errors from Server Components
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Verify the target user exists
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (fetchError || !targetUser?.user) {
      console.error('[ADMIN RESEND VERIFICATION] User not found:', { userId, error: fetchError })
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Resend verification email using Supabase Auth
    const { error: verificationError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      targetUser.user.email!
    )

    if (verificationError) {
      console.error('[ADMIN RESEND VERIFICATION] Failed to send verification email:', {
        userId,
        email: targetUser.user.email,
        error: verificationError.message,
        code: verificationError.status
      })
      return NextResponse.json({ success: false, error: 'Failed to send verification email' }, { status: 500 })
    }

    // Audit log
    console.log('[ADMIN AUDIT] Verification email resent', {
      action: 'admin_resend_verification_email',
      actingAdminUserId: user.id,
      actingAdminEmail: user.email,
      targetUserId: userId,
      targetEmail: targetUser.user.email,
      timestamp: new Date().toISOString(),
      success: true
    })

    return NextResponse.json({
      success: true,
      userId,
      email: targetUser.user.email
    })
  } catch (error: any) {
    console.error('[ADMIN RESEND VERIFICATION] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}