import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json(
        { ok: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get all trial overrides
    const { data: overrides, error } = await supabaseAdmin
      .from('trial_overrides')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      overrides,
    })
  } catch (error) {
    console.error('[admin-trial-overrides] GET error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json(
        { ok: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { business_phone_number, business_email, override_reason, max_allowed_trials, notes, expires_at } = body

    if (!business_phone_number || !override_reason) {
      return NextResponse.json(
        { ok: false, error: 'business_phone_number and override_reason are required' },
        { status: 400 }
      )
    }

    // Create trial override
    const { data: override, error } = await supabaseAdmin
      .from('trial_overrides')
      .insert({
        business_phone_number,
        business_email: business_email || null,
        override_reason,
        max_allowed_trials: max_allowed_trials || 2,
        trials_used: 0,
        notes: notes || null,
        created_by: user.id,
        expires_at: expires_at || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[admin-trial-overrides] POST error:', error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      override,
      message: 'Trial override created successfully',
    })
  } catch (error) {
    console.error('[admin-trial-overrides] POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json(
        { ok: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const overrideId = searchParams.get('id')

    if (!overrideId) {
      return NextResponse.json(
        { ok: false, error: 'Override ID is required' },
        { status: 400 }
      )
    }

    // Revoke the override
    const { error } = await supabaseAdmin
      .from('trial_overrides')
      .update({ override_status: 'revoked' })
      .eq('id', overrideId)

    if (error) {
      console.error('[admin-trial-overrides] DELETE error:', error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Trial override revoked successfully',
    })
  } catch (error) {
    console.error('[admin-trial-overrides] DELETE error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
