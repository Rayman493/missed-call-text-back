import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
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
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, forwarding_verified')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Only set forwarding_verified to true, never back to false (one-way verification)
    if (business.forwarding_verified) {
      return NextResponse.json({ 
        message: 'Forwarding already verified',
        forwarding_verified: true 
      })
    }

    // Set forwarding_verified to true
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ 
        forwarding_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', business.id)

    if (updateError) {
      console.error('Error updating forwarding verification:', updateError)
      return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Forwarding verification updated successfully',
      forwarding_verified: true 
    })

  } catch (error) {
    console.error('Error in forwarding verification API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
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
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('forwarding_verified')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      forwarding_verified: business.forwarding_verified || false 
    })

  } catch (error) {
    console.error('Error getting forwarding verification status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
