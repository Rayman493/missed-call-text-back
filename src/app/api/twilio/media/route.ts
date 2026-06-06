import { NextRequest, NextResponse } from 'next/server'

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
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
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
