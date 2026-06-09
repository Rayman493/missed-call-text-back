import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mediaUrl = searchParams.get('url')

    if (!mediaUrl) {
      return NextResponse.json(
        { error: 'Media URL is required' },
        { status: 400 }
      )
    }

    // Validate that the URL is from Twilio
    if (!mediaUrl.includes('twilio.com') && !mediaUrl.includes('twilio')) {
      console.error('[Twilio Media Proxy] Invalid URL domain:', mediaUrl)
      return NextResponse.json(
        { error: 'Invalid media URL' },
        { status: 400 }
      )
    }

    // Authenticate user
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[Twilio Media Proxy] Authentication required - no Bearer token')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.log('[Twilio Media Proxy] Invalid authentication token')
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    // Verify that the media URL belongs to a message owned by the authenticated user's business
    const { data: mediaRecord, error: mediaError } = await supabaseAdmin
      .from('message_media')
      .select(`
        *,
        messages!inner (
          lead_id,
          leads!inner (
            business_id,
            businesses!inner (
              user_id
            )
          )
        )
      `)
      .eq('media_url', mediaUrl)
      .eq('businesses.user_id', user.id)
      .single()

    if (mediaError || !mediaRecord) {
      console.log('[Twilio Media Proxy] Media not found or access denied:', {
        mediaUrl: mediaUrl.substring(0, 50),
        userId: user.id,
        error: mediaError?.message
      })
      return NextResponse.json(
        { error: 'Media not found or access denied' },
        { status: 404 }
      )
    }

    console.log('[MMS RENDER DEBUG] Proxying media URL:', mediaUrl.substring(0, 50) + '...')
    console.log('[MMS MEDIA URL SELECTED]', { url: mediaUrl })

    // Fetch media from Twilio with authentication
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64')}`,
      },
    })

    if (!response.ok) {
      console.error('[MMS RENDER DEBUG] Failed to fetch media from Twilio:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch media from Twilio' },
        { status: response.status }
      )
    }

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'application/octet-stream'

    console.log('[MMS RENDER DEBUG] Successfully fetched media from Twilio:', contentType)

    // Stream the media to the client
    const mediaBuffer = await response.arrayBuffer()

    return new NextResponse(mediaBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour, private since it's authenticated
      },
    })
  } catch (error) {
    console.error('[Twilio Media Proxy] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
