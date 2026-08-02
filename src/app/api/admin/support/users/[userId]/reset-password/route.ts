import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

// Rate limiting: simple in-memory counter (for production, consider Redis)
const resetAttempts = new Map<string, { count: number; lastAttempt: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 3

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = resetAttempts.get(userId)

  if (!record) {
    resetAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    resetAttempts.set(userId, { count: 1, lastAttempt: now })
    return true
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false
  }

  record.count++
  return true
}

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password is required' }
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters' }
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' }
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' }
  }

  // Check for at least one number
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
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
    const { password } = body

    if (!password) {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 })
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password)
    if (!passwordValidation.valid) {
      return NextResponse.json({ success: false, error: passwordValidation.error }, { status: 400 })
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
        { success: false, error: 'Too many reset attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Verify the target user exists
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (fetchError || !targetUser?.user) {
      // Generic error to avoid leaking user existence information
      console.error('[ADMIN PASSWORD RESET] User not found:', { userId, error: fetchError })
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
    })

    if (updateError) {
      console.error('[ADMIN PASSWORD RESET] Failed to update password:', {
        userId,
        error: updateError.message,
        code: updateError.status
      })
      return NextResponse.json({ success: false, error: 'Failed to update password' }, { status: 500 })
    }

    // Audit log (without password)
    await logAdminAction({
      acting_admin_user_id: user.id,
      acting_admin_email: user.email || '',
      target_user_id: userId,
      target_email: targetUser.user.email,
      action: 'admin_password_reset',
      success: true
    })

    return NextResponse.json({
      success: true,
      userId,
      email: targetUser.user.email
    })
  } catch (error: any) {
    console.error('[ADMIN PASSWORD RESET] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}