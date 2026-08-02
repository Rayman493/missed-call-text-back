import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Rate limiting: simple in-memory counter
const changeEmailAttempts = new Map<string, { count: number; lastAttempt: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 3

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = changeEmailAttempts.get(userId)

  if (!record) {
    changeEmailAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    changeEmailAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false
  }

  record.count++
  return true
}

function validateEmailFormat(email: string): { valid: boolean; error?: string } {
  if (!email) {
    return { valid: false, error: 'Email is required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }

  if (email.length > 255) {
    return { valid: false, error: 'Email is too long' }
  }

  return { valid: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const body = await request.json()
    const { newEmail, supportReason } = body

    if (!newEmail) {
      return NextResponse.json({ success: false, error: 'New email is required' }, { status: 400 })
    }

    if (!supportReason) {
      return NextResponse.json({ success: false, error: 'Support reason is required' }, { status: 400 })
    }

    // Validate email format
    const emailValidation = validateEmailFormat(newEmail)
    if (!emailValidation.valid) {
      return NextResponse.json({ success: false, error: emailValidation.error }, { status: 400 })
    }

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
        { success: false, error: 'Too many email change attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Verify the target user exists
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (fetchError || !targetUser?.user) {
      console.error('[ADMIN CHANGE EMAIL] User not found:', { userId, error: fetchError })
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const oldEmail = targetUser.user.email

    // Check if new email is already taken
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers()
    const emailExists = usersList?.users.some(u => u.email === newEmail && u.id !== userId)

    if (emailExists) {
      return NextResponse.json({ success: false, error: 'Email already in use' }, { status: 409 })
    }

    // Update email
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
    })

    if (updateError) {
      console.error('[ADMIN CHANGE EMAIL] Failed to update email:', {
        userId,
        oldEmail,
        newEmail,
        error: updateError.message,
        code: updateError.status
      })
      return NextResponse.json({ success: false, error: 'Failed to update email' }, { status: 500 })
    }

    // Audit log
    console.log('[ADMIN AUDIT] Login email changed', {
      action: 'admin_login_email_changed',
      actingAdminUserId: user.id,
      actingAdminEmail: user.email,
      targetUserId: userId,
      oldEmail,
      newEmail,
      supportReason,
      timestamp: new Date().toISOString(),
      success: true
    })

    return NextResponse.json({
      success: true,
      userId,
      oldEmail,
      newEmail
    })
  } catch (error: any) {
    console.error('[ADMIN CHANGE EMAIL] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}