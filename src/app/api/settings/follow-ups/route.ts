import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/settings/follow-ups - Retrieve follow-up settings
export async function GET() {
  try {
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

    // Get the user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's business
    const lookupResult = await db.getBusinessByUserId(user.id)
    
    if (!lookupResult.found || lookupResult.reason !== 'found' || !lookupResult.business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const business = lookupResult.business

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
    console.error('Error fetching follow-up settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/settings/follow-ups - Update follow-up settings
export async function PUT(request: NextRequest) {
  try {
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

    // Get the user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await request.json()

    // Validate the settings structure
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 })
    }

    // Get the user's business
    const lookupResult = await db.getBusinessByUserId(user.id)

    if (!lookupResult.found || lookupResult.reason !== 'found' || !lookupResult.business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const business = lookupResult.business

    // Merge with existing automation settings
    const existingAutomationSettings = business.automation_settings || {}
    const updatedAutomationSettings = {
      ...existingAutomationSettings,
      followUps: settings
    }

    // Update the business record
    const updatedBusiness = await db.updateBusiness(business.id, {
      automation_settings: updatedAutomationSettings
    })

    if (!updatedBusiness) {
      console.error('Error updating follow-up settings')
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating follow-up settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
