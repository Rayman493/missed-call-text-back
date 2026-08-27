import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { deleteAccountLifecycle, DeletionResult } from '@/lib/account-deletion-service'

interface DeleteResult extends DeletionResult {}

export async function POST(request: NextRequest) {
  try {
    // Check for dry-run mode
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const password = body.password
    const deleteConfirmation = body.deleteConfirmation

    if (dryRun) {
      console.log('[delete-account] DRY RUN MODE - No actual deletions will occur')
    }

    // Check required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[delete-account] Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('[delete-account] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 }
      )
    }

    // Authenticate user using server-side client with RLS
    const cookieStore = await cookies()
    console.log('[delete-account] Cookie store obtained, creating server client')
    console.log('[SUPABASE SSR SOURCE] account-delete')

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            const allCookies = cookieStore.getAll()
            console.log('[delete-account] Retrieved cookies:', allCookies.length, 'cookies')
            return allCookies
          },
          setAll(cookiesToSet) {
            console.log('[delete-account] Setting cookies:', cookiesToSet.length, 'cookies')
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    console.log('[delete-account] Server client created, attempting to get user')

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('[delete-account] User retrieval result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message,
      authErrorCode: authError?.code,
    })

    if (authError || !user) {
      console.error('[delete-account] Authentication failed:', authError)
      return NextResponse.json(
        { ok: false, step: 'auth', error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('[delete-account] Authenticated user:', user.id)

    // Verify password before any deletion logic
    if (!password || typeof password !== 'string' || !password.trim()) {
      console.error('[delete-account] Password not provided')
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Password is required' },
        { status: 400 }
      )
    }

    console.log('[delete-account] Verifying password for user:', user.id)

    // Verify password by attempting to sign in
    // This is the standard way to verify credentials in Supabase
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email || '',
      password: password.trim(),
    })

    if (signInError || !signInData.user) {
      console.error('[delete-account] Password verification failed:', signInError)
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Incorrect password. Please try again.' },
        { status: 401 }
      )
    }

    // Verify the authenticated user matches the signed-in user
    if (signInData.user.id !== user.id) {
      console.error('[delete-account] User ID mismatch during password verification')
      return NextResponse.json(
        { ok: false, step: 'password_verification', error: 'Authentication failed' },
        { status: 401 }
      )
    }

    console.log('[delete-account] Password verified successfully')

    // EXPLICIT CONFIRMATION CHECK: Require DELETE confirmation for self-service deletion
    if (!dryRun) {
      if (!deleteConfirmation || deleteConfirmation !== 'DELETE') {
        console.error('[delete-account] CONFIRMATION_CHECK: DELETE confirmation failed', {
          expected: 'DELETE',
          received: deleteConfirmation,
        })
        return NextResponse.json(
          {
            ok: false,
            step: 'confirmation_check',
            error: 'Please type DELETE to confirm account deletion',
          },
          { status: 400 }
        )
      }

      console.log('[delete-account] CONFIRMATION_CHECK: DELETE confirmed')
    }

    // Call shared deletion lifecycle service
    console.log('[delete-account] Calling shared deletion lifecycle service')
    const result = await deleteAccountLifecycle({
      userId: user.id,
      userEmail: user.email,
      deletionSource: 'self_service',
      dryRun,
    })

    if (!result.ok) {
      console.error('[delete-account] Deletion lifecycle failed:', result.error)
      return NextResponse.json(
        {
          ok: false,
          step: result.step,
          error: result.error,
          details: result.details,
          businessId: (result as any).businessId,
          errorType: (result as any).errorType,
        },
        { status: result.step === 'protected_account_check' ? 403 : result.step === 'preflight_validation' ? 409 : 500 }
      )
    }

    console.log('[delete-account] Deletion lifecycle succeeded')

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[delete-account] Unexpected error:', error)
    console.error('[delete-account] Error stack:', error.stack)
    return NextResponse.json(
      {
        ok: false,
        step: 'unexpected',
        error: 'An unexpected error occurred. Please try again or contact support.',
        details: error.message,
      },
      { status: 500 }
    )
  }
}