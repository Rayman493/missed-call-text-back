import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db, supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[complete-signup] route hit')

  try {
    const body = await request.json()
    const { email, password, businessName, businessPhone } = body

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { ok: false, step: 'validation', error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (!businessName || !businessPhone) {
      return NextResponse.json(
        { ok: false, step: 'validation', error: 'Business name and phone are required' },
        { status: 400 }
      )
    }

    // Password requirements
    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, step: 'validation', error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    console.log('[complete-signup] Creating account for email:', email)

    // Check if user already exists by trying to get user by email
    const { data: existingUsers, error: checkError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (checkError) {
      console.error('[complete-signup] Error checking existing user:', checkError)
      return NextResponse.json(
        { ok: false, step: 'check_user', error: 'Failed to check existing user' },
        { status: 500 }
      )
    }

    const existingUser = existingUsers.users.find((u: any) => u.email === email)
    
    if (existingUser) {
      console.log('[complete-signup] User already exists for email:', email)
      // Check if user has a business
      const businessLookup = await db.getBusinessByUserId(existingUser.id)
      
      if (businessLookup.found) {
        return NextResponse.json(
          { ok: false, step: 'user_exists', hasBusiness: true, error: 'This email already has an account. Please sign in.' },
          { status: 409 }
        )
      } else {
        return NextResponse.json(
          { ok: false, step: 'user_exists', hasBusiness: false, error: 'This account was started but not completed. Please sign in to finish setup.' },
          { status: 409 }
        )
      }
    }

    // Normalize phone number
    const normalizedPhone = businessPhone.replace(/\D/g, '')
    if (normalizedPhone.length < 10) {
      return NextResponse.json(
        { ok: false, step: 'validation', error: 'Invalid phone number' },
        { status: 400 }
      )
    }

    // Step 1: Create Supabase Auth user
    console.log('[complete-signup] Creating auth user...')
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for immediate signup
      user_metadata: {
        email_confirmed_at: new Date().toISOString(),
      }
    })

    if (authError) {
      console.error('[complete-signup] Auth user creation failed:', authError)
      return NextResponse.json(
        { ok: false, step: 'create_auth', error: authError.message || 'Failed to create account' },
        { status: 500 }
      )
    }

    if (!authData.user) {
      console.error('[complete-signup] Auth user creation returned no user')
      return NextResponse.json(
        { ok: false, step: 'create_auth', error: 'Failed to create account' },
        { status: 500 }
      )
    }

    const userId = authData.user.id
    console.log('[complete-signup] Auth user created:', userId)

    // Step 2: Create business row
    try {
      console.log('[complete-signup] Creating business row...')
      const business = await db.createBusiness({
        user_id: userId,
        name: businessName,
        business_phone_number: normalizedPhone,
        auto_reply_message: `Hi, this is ${businessName}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
        sms_type: 'local_a2p',
        messaging_status: 'active',
        onboarding_status: 'profile_created',
        twilio_phone_number: null, // Will be set during provisioning
        subscription_status: null, // Will be set by Stripe webhook
        stripe_customer_id: null,
      })

      if (!business) {
        throw new Error('Business creation returned null')
      }

      console.log('[complete-signup] Business row created:', business.id)

      // Step 3: Sign in the user
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

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        console.error('[complete-signup] Sign in failed after account creation:', signInError)
        // Don't rollback - account was created successfully, user can sign in manually
        return NextResponse.json(
          { ok: true, business, signInRequired: true, warning: 'Account created but automatic sign-in failed. Please sign in manually.' },
          { status: 200 }
        )
      }

      console.log('[complete-signup] Account created and user signed in successfully')
      return NextResponse.json({ ok: true, business })

    } catch (businessError: any) {
      // Rollback: Delete the auth user since business creation failed
      console.error('[complete-signup] Business creation failed, rolling back auth user:', businessError)
      
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        console.log('[complete-signup] Auth user rolled back successfully')
      } catch (rollbackError: any) {
        console.error('[complete-signup] Failed to rollback auth user:', rollbackError)
      }

      return NextResponse.json(
        { ok: false, step: 'create_business', error: businessError.message || 'Failed to create business' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('[complete-signup] Unexpected error:', error)
    return NextResponse.json(
      {
        ok: false,
        step: 'unexpected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
