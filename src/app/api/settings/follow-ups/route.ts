import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/settings/follow-ups - Retrieve follow-up settings
export async function GET() {
  try {
    // Use server client pattern for proper RLS enforcement
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[Follow-ups Settings GET] Auth failed:', authError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Follow-ups Settings GET] Authenticated user:', user.id)

    // Get the user's business using server client with RLS
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (businessError || !business) {
      console.error('[Follow-ups Settings GET] Business lookup failed:', businessError?.message)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Follow-ups Settings GET] Found business:', business.id)

    // Get current follow-up settings or return defaults
    const automationSettings = business.automation_settings || {}
    const followUpSettings = automationSettings.followUps || {
      enabled: true,
      followUps: [
        {
          step: 1,
          enabled: true,
          delayDays: 1,
          delayUnit: 'days' as const,
          message: `Just checking in from ${business.name} - would you still like help?`
        },
        {
          step: 2,
          enabled: true,
          delayDays: 3,
          delayUnit: 'days' as const,
          message: `Hi, this is ${business.name}. We wanted to follow up one more time. Reply here if you still need anything.`
        },
        {
          step: 3,
          enabled: false,
          delayDays: 7,
          delayUnit: 'days' as const,
          message: `Final follow-up from ${business.name}. Let us know if we can help with anything!`
        }
      ]
    }

    return NextResponse.json(followUpSettings)
  } catch (error) {
    console.error('[Follow-ups Settings GET] Unexpected error:', error)
    return NextResponse.json({ error: 'Unable to load settings. Please try again.' }, { status: 500 })
  }
}

// PUT /api/settings/follow-ups - Update follow-up settings
export async function PUT(request: NextRequest) {
  try {
    // Use server client pattern for proper RLS enforcement
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[Follow-ups Settings PUT] Auth failed:', authError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Follow-ups Settings PUT] Authenticated user:', user.id)

    const settings = await request.json()

    // Validate the settings structure
    if (!settings || typeof settings !== 'object') {
      console.error('[Follow-ups Settings PUT] Invalid settings format')
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 })
    }

    // Get the user's business using server client with RLS
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (businessError || !business) {
      console.error('[Follow-ups Settings PUT] Business lookup failed:', businessError?.message)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Follow-ups Settings PUT] Found business:', business.id)

    // Merge with existing automation settings
    const existingAutomationSettings = business.automation_settings || {}
    const updatedAutomationSettings = {
      ...existingAutomationSettings,
      followUps: settings
    }

    // Update the business record using server client with RLS
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        automation_settings: updatedAutomationSettings
      })
      .eq('id', business.id)
      .select()
      .single()

    if (updateError) {
      console.error('[Follow-ups Settings PUT] Update failed:', {
        businessId: business.id,
        errorCode: updateError.code,
        errorMessage: updateError.message
      })
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    console.log('[Follow-ups Settings PUT] Settings updated successfully for business:', business.id)
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[Follow-ups Settings PUT] Unexpected error:', error)
    return NextResponse.json({ error: 'Unable to save settings. Please try again.' }, { status: 500 })
  }
}
