import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

const ALLOWED_VALUES = ['replyflow', 'business'] as const
type SendingSource = typeof ALLOWED_VALUES[number]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-derived business authorization
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const business = authResult.business

    // Return the current default sending source
    const sendingSource = (business as any)?.default_sending_source || 'replyflow'
    
    return NextResponse.json({ 
      sendingSource,
      businessId: business.id
    })
  } catch (error) {
    console.error('[Sending Source GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-derived business authorization
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const business = authResult.business

    const body = await request.json()
    const { sendingSource } = body

    // Validate sending source
    if (!sendingSource || typeof sendingSource !== 'string' || !ALLOWED_VALUES.includes(sendingSource as SendingSource)) {
      return NextResponse.json({ error: 'Invalid sending source' }, { status: 400 })
    }

    // Update the business's default sending source and return the updated value
    const { data: updatedBusiness, error: updateError } = await supabase
      .from('businesses')
      .update({ default_sending_source: sendingSource })
      .eq('id', business.id)
      .select('default_sending_source')
      .single()

    if (updateError) {
      console.error('[Sending Source POST] Error updating:', updateError)
      return NextResponse.json({ error: 'Failed to update sending source' }, { status: 500 })
    }

    // Verify the update actually happened
    if (!updatedBusiness || updatedBusiness.default_sending_source !== sendingSource) {
      console.error('[Sending Source POST] Update verification failed:', { 
        requested: sendingSource, 
        actual: updatedBusiness?.default_sending_source 
      })
      return NextResponse.json({ error: 'Failed to verify update' }, { status: 500 })
    }

    console.log('[Sending Source POST] Update successful:', { 
      businessId: business.id, 
      sendingSource: updatedBusiness.default_sending_source 
    })

    return NextResponse.json({ 
      success: true,
      sendingSource: updatedBusiness.default_sending_source
    })
  } catch (error) {
    console.error('[Sending Source POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
