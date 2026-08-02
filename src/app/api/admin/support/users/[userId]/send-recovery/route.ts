import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

// Rate limiting: simple in-memory counter
const recoveryAttempts = new Map<string, { count: number; lastAttempt: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = recoveryAttempts.get(userId)

  if (!record) {
    recoveryAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    recoveryAttempts.set(userId, { count: 1, lastAttempt: now })
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
        { success: false, error: 'Too many recovery attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Verify the target user exists
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (fetchError || !targetUser?.user) {
      console.error('[ADMIN RECOVERY EMAIL] User not found:', { userId, error: fetchError })
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Send recovery email using Supabase Auth
    const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(
      targetUser.user.email!,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
      }
    )

    if (recoveryError) {
      console.error('[ADMIN RECOVERY EMAIL] Failed to send recovery email:', {
        userId,
        email: targetUser.user.email,
        error: recoveryError.message,
        code: recoveryError.status
      })
      return NextResponse.json({ success: false, error: 'Failed to send recovery email' }, { status: 500 })
    }

    // Audit log
    await logAdminAction({
      acting_admin_user_id: user.id,
      acting_admin_email: user.email || '',
      target_user_id: userId,
      target_email: targetUser.user.email,
      action: 'admin_send_recovery_email',
      success: true
    })

    return NextResponse.json({
      success: true,
      userId,
      email: targetUser.user.email
    })
  } catch (error: any) {
    console.error('[ADMIN RECOVERY EMAIL] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}