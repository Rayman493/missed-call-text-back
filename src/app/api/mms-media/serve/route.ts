import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Twilio authentication via Basic Auth or shared secret
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const MMS_MEDIA_SECRET = process.env.MMS_MEDIA_SECRET

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filePath = searchParams.get('path')
    const authToken = searchParams.get('token')

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      )
    }

    // Authenticate request - accept either Twilio auth token or MMS media secret
    const providedToken = authToken || request.headers.get('authorization')?.replace('Bearer ', '') || request.headers.get('x-mms-media-token')
    
    if (!providedToken) {
      console.error('[MMS Media Serve] No authentication token provided')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const isValidToken = providedToken === TWILIO_AUTH_TOKEN || providedToken === MMS_MEDIA_SECRET
    
    if (!isValidToken) {
      console.error('[MMS Media Serve] Invalid authentication token')
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    console.log('[MMS Media Serve] Fetching file:', {
      filePath: filePath.substring(0, 100) // Log first 100 chars to avoid logging full paths
    })

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('mms-media')
      .download(filePath)

    if (downloadError) {
      console.error('[MMS Media Serve] Download error:', {
        error: downloadError,
        message: downloadError.message,
        filePath: filePath.substring(0, 100)
      })
      return NextResponse.json(
        { error: 'Failed to download media' },
        { status: 404 }
      )
    }

    if (!fileData) {
      console.error('[MMS Media Serve] No file data returned')
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Extract file extension to determine MIME type
    const extension = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif'
    }

    const contentType = mimeTypes[extension] || 'image/jpeg'

    console.log('[MMS Media Serve] Serving file:', {
      filePath: filePath.substring(0, 100),
      contentType,
      size: fileData.size
    })

    // Return the file with correct Content-Type
    return new NextResponse(fileData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
      },
    })
  } catch (error) {
    console.error('[MMS Media Serve] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}