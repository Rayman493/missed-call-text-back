import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isValidPreferenceKey, isValidPreferenceValue, NOTIFICATION_PREFERENCE_DEFAULTS } from '@/lib/notification-preferences'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { businessId, preferences } = body

    // Validate required fields
    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ error: 'preferences object is required' }, { status: 400 })
    }

    // Verify user owns this business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, notification_preferences')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Validate each preference key and value
    const validPreferences: Record<string, boolean> = {}
    const invalidKeys: string[] = []
    const invalidValues: string[] = []

    for (const [key, value] of Object.entries(preferences)) {
      if (!isValidPreferenceKey(key)) {
        invalidKeys.push(key)
        continue
      }

      if (!isValidPreferenceValue(value)) {
        invalidValues.push(key)
        continue
      }

      validPreferences[key] = value as boolean
    }

    if (invalidKeys.length > 0) {
      return NextResponse.json({ 
        error: `Invalid preference keys: ${invalidKeys.join(', ')}` 
      }, { status: 400 })
    }

    if (invalidValues.length > 0) {
      return NextResponse.json({ 
        error: `Invalid preference values (must be boolean): ${invalidValues.join(', ')}` 
      }, { status: 400 })
    }

    // Merge with existing preferences, preserving unspecified keys
    const existingPreferences = (business.notification_preferences as Record<string, any>) || {}
    const mergedPreferences = { ...existingPreferences, ...validPreferences }

    // Update business preferences
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ notification_preferences: mergedPreferences })
      .eq('id', businessId)

    if (updateError) {
      console.error('[NOTIFICATION PREFERENCES] Update failed:', updateError)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    // Return the updated effective preferences (with defaults applied)
    const effectivePreferences: Record<string, boolean> = {}
    for (const key of Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)) {
      const value = mergedPreferences[key]
      effectivePreferences[key] = value === undefined ? true : value
    }

    console.log('[NOTIFICATION PREFERENCES] Updated successfully', {
      businessId,
      userId: user.id,
      updatedPreferences: validPreferences,
      effectivePreferences
    })

    return NextResponse.json({
      success: true,
      preferences: effectivePreferences
    })
  } catch (error) {
    console.error('[NOTIFICATION PREFERENCES] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}