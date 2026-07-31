import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyMmsMediaToken } from '@/lib/mms-media-token'

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

    let parsedMediaUrl: URL
    try {
      parsedMediaUrl = new URL(mediaUrl)
    } catch {
      return NextResponse.json(
        { error: 'Invalid media URL' },
        { status: 400 }
      )
    }

    const allowedTwilioHosts = new Set(['api.twilio.com', 'mcs.us1.twilio.com'])
    const allowedReplyFlowHosts = new Set(['replyflowhq.com', 'www.replyflowhq.com'])
    const isAllowedTwilioHost = parsedMediaUrl.protocol === 'https:' && (
      allowedTwilioHosts.has(parsedMediaUrl.hostname) || parsedMediaUrl.hostname.endsWith('.twilio.com')
    )
    const isAllowedReplyFlowHost = parsedMediaUrl.protocol === 'https:' && (
      allowedReplyFlowHosts.has(parsedMediaUrl.hostname) || 
      parsedMediaUrl.hostname.endsWith('.replyflowhq.com')
    )

    if (!isAllowedTwilioHost && !isAllowedReplyFlowHost) {
      console.error('[Twilio Media Proxy] Invalid URL domain:', parsedMediaUrl.hostname)
      return NextResponse.json(
        { error: 'Invalid media URL' },
        { status: 400 }
      )
    }

    // ReplyFlow URLs with JWT tokens don't require user auth
    if (isAllowedReplyFlowHost) {
      const token = parsedMediaUrl.searchParams.get('token')
      const path = parsedMediaUrl.searchParams.get('path')
      const referer = request.headers.get('referer')
      const userAgent = request.headers.get('user-agent')
      
      console.log('[Twilio Media Proxy] ReplyFlow URL request:', {
        tokenPresent: !!token,
        tokenLength: token?.length,
        tokenSegmentCount: token ? token.split('.').length : 0,
        tokenDotCount: token ? token.split('.').length - 1 : 0,
        tokenPrefix: token ? token.substring(0, 6) : undefined,
        tokenSuffix: token ? token.slice(-6) : undefined,
        pathPresent: !!path,
        pathLength: path?.length,
        pathPreview: path ? path.substring(0, 50) : undefined,
        referer: referer ? referer.substring(0, 100) : undefined,
        userAgent: userAgent ? userAgent.substring(0, 100) : undefined,
        isTwilio: userAgent?.includes('TwilioProxy') || false,
        isBrowser: userAgent?.includes('Mozilla') || false,
        hostname: parsedMediaUrl.hostname,
        pathname: parsedMediaUrl.pathname
      })
      
      if (!token || !path) {
        console.error('[Twilio Media Proxy] ReplyFlow URL missing token or path')
        return NextResponse.json(
          { error: 'Invalid media URL' },
          { status: 400 }
        )
      }
      
      const tokenPayload = await verifyMmsMediaToken(token, path)
      
      if (!tokenPayload) {
        console.error('[Twilio Media Proxy] Invalid or expired JWT token for ReplyFlow URL')
        return NextResponse.json(
          { error: 'Invalid media URL' },
          { status: 401 }
        )
      }
      
      // Fetch media directly from ReplyFlow URL
      const response = await fetch(mediaUrl.toString())
      
      if (!response.ok) {
        console.error('[Twilio Media Proxy] Failed to fetch media from ReplyFlow:', response.status)
        return NextResponse.json(
          { error: 'Failed to fetch media' },
          { status: response.status }
        )
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const mediaBuffer = await response.arrayBuffer()
      
      return new NextResponse(mediaBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
        },
      })
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
