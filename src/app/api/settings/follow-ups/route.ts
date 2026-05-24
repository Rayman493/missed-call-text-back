import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET /api/settings/follow-ups - Retrieve follow-up settings
export async function GET() {
  try {
    // Get the user from the session
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Get current follow-up settings or return defaults
    const automationSettings = business.automation_settings || {}
    const followUpSettings = automationSettings.followUps || {
      enabled: true,
      followUps: [
        {
          step: 1,
          enabled: true,
          delayDays: 1,
          message: `Just checking in from ${business.name} - would you still like help?`
        },
        {
          step: 2,
          enabled: true,
          delayDays: 3,
          message: `Hi, this is ${business.name}. We wanted to follow up one more time. Reply here if you still need anything.`
        },
        {
          step: 3,
          enabled: false,
          delayDays: 7,
          message: `Final follow-up from ${business.name}. Let us know if we can help with anything!`
        }
      ]
    }

    return NextResponse.json(followUpSettings)
  } catch (error) {
    console.error('Error fetching follow-up settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/settings/follow-ups - Update follow-up settings
export async function PUT(request: NextRequest) {
  try {
    // Get the user from the session
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await request.json()

    // Validate the settings structure
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 })
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Merge with existing automation settings
    const existingAutomationSettings = business.automation_settings || {}
    const updatedAutomationSettings = {
      ...existingAutomationSettings,
      followUps: settings
    }

    // Update the business record
    const { data: updatedBusiness, error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        automation_settings: updatedAutomationSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', business.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating follow-up settings:', updateError)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating follow-up settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
