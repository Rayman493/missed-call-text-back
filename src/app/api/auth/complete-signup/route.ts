import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
      // Check if user has a business using admin client
      const { data: existingBusiness, error: businessCheckError } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('user_id', existingUser.id)
        .limit(1)
        .maybeSingle()
      
      if (businessCheckError && businessCheckError.code !== 'PGRST116') {
        console.error('[complete-signup] Error checking existing business:', businessCheckError)
        return NextResponse.json(
          { ok: false, step: 'check_business', error: 'Failed to check existing account' },
          { status: 500 }
        )
      }
      
      if (existingBusiness) {
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

    // Step 2: Create business row directly using admin client to bypass RLS
    try {
      console.log('[complete-signup] Creating business row...')
      
      // Calculate trial end date (14 days from now)
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)
      
      // Insert business directly using supabaseAdmin to bypass RLS
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .insert({
          user_id: userId,
          name: businessName,
          business_phone_number: normalizedPhone,
          auto_reply_message: `Hi, this is ${businessName}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
          sms_type: 'local_a2p',
          messaging_status: 'active',
          onboarding_status: 'profile_created',
          twilio_phone_number: null, // Will be set during provisioning
          subscription_status: 'trialing', // Set to trialing for new accounts
          stripe_customer_id: null,
          trial_ends_at: trialEndsAt.toISOString(),
        })
        .select()
        .single()

      if (businessError) {
        console.error('[complete-signup] Business insert error:', businessError)
        console.error('[complete-signup] Error code:', businessError.code)
        console.error('[complete-signup] Error message:', businessError.message)
        console.error('[complete-signup] Error details:', businessError.details)
        throw new Error(`Business creation failed: ${businessError.message}`)
      }

      if (!business) {
        throw new Error('Business creation returned no data')
      }

      console.log('[complete-signup] Business row created:', business.id)
      console.log('[complete-signup] Trial ends at:', trialEndsAt.toISOString())

      // Return success - client will handle sign-in
      console.log('[complete-signup] Account created successfully')
      return NextResponse.json({ ok: true, business })

    } catch (businessError: any) {
      // Rollback: Delete the auth user since business creation failed
      console.error('[complete-signup] Business creation failed, rolling back auth user:', businessError)
      console.error('[complete-signup] Business error details:', {
        message: businessError.message,
        code: businessError.code,
        stack: businessError.stack,
      })
      
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        console.log('[complete-signup] Auth user rolled back successfully')
      } catch (rollbackError: any) {
        console.error('[complete-signup] Failed to rollback auth user:', rollbackError)
      }

      // Return user-friendly error without exposing RLS/security details
      const isSecurityError = businessError.code === '42501' || 
                             businessError.message?.includes('row-level security') ||
                             businessError.message?.includes('RLS')
      
      const userMessage = isSecurityError 
        ? "We couldn't finish creating your account. Please try again. If this keeps happening, contact support."
        : "We couldn't finish creating your account. Please try again."
      
      return NextResponse.json(
        { ok: false, step: 'create_business', error: userMessage },
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
