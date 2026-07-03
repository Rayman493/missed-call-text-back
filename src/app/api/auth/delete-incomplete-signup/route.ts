import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[delete-incomplete-signup] Delete request received')

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

    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[delete-incomplete-signup] No authenticated user found')
      return NextResponse.json(
        { error: 'You must be signed in to delete your account' },
        { status: 401 }
      )
    }

    console.log('[delete-incomplete-signup] User:', user.id, 'Email:', user.email)

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { password } = body

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required to confirm account deletion' },
        { status: 400 }
      )
    }

    // Verify password by attempting sign-in
    if (!user.email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      )
    }

    console.log('[delete-incomplete-signup] Verifying password')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (signInError) {
      console.error('[delete-incomplete-signup] Password verification failed:', signInError.message)
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 403 }
      )
    }

    console.log('[delete-incomplete-signup] Password verified')

    // Find the business row for this user
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, subscription_status, user_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (businessError && businessError.code !== 'PGRST116') {
      console.error('[delete-incomplete-signup] Error fetching business:', businessError)
      return NextResponse.json(
        { error: 'Could not fetch business record' },
        { status: 500 }
      )
    }

    // Safety check: only allow deletion for incomplete signup users
    if (business && business.subscription_status) {
      console.error('[delete-incomplete-signup] Cannot delete: user has active subscription status', business.subscription_status)
      return NextResponse.json(
        { error: 'Account cannot be deleted this way because it has an active subscription. Please use the normal account deletion flow.' },
        { status: 403 }
      )
    }

    if (business && business.user_id !== user.id) {
      console.error('[delete-incomplete-signup] Business does not belong to user')
      return NextResponse.json(
        { error: 'Business record does not belong to this user' },
        { status: 403 }
      )
    }

    // Delete business row first (if exists)
    if (business) {
      console.log('[delete-incomplete-signup] Deleting business row:', business.id)
      const { error: deleteBusinessError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .eq('id', business.id)
        .eq('user_id', user.id)

      if (deleteBusinessError) {
        console.error('[delete-incomplete-signup] Error deleting business:', deleteBusinessError)
        return NextResponse.json(
          { error: 'Could not delete business record' },
          { status: 500 }
        )
      }
      console.log('[delete-incomplete-signup] Business row deleted')
    }

    // Delete auth user using admin client
    console.log('[delete-incomplete-signup] Deleting auth user:', user.id)
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteAuthError) {
      console.error('[delete-incomplete-signup] Error deleting auth user:', deleteAuthError)
      return NextResponse.json(
        { error: 'Could not delete auth user' },
        { status: 500 }
      )
    }

    console.log('[delete-incomplete-signup] Auth user deleted successfully')

    return NextResponse.json({ ok: true, message: 'Account deleted successfully' })
  } catch (error: any) {
    console.error('[delete-incomplete-signup] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting your account' },
      { status: 500 }
    )
  }
}
