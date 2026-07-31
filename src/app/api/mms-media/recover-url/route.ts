import { NextRequest, NextResponse } from 'next/server'
import { getValidMediaAccessUrl } from '@/lib/mms-media-url-helper'

export const dynamic = 'force-dynamic'

/**
 * Recover a valid MMS media access URL from a potentially broken stored URL
 * 
 * This endpoint handles historical records with token=undefined, expired tokens, etc.
 * It extracts the storage path and generates a fresh valid URL.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const storedUrl = searchParams.get('url')

    if (!storedUrl) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    console.log('[MMS URL Recovery] Attempting to recover URL:', {
      urlPreview: storedUrl.substring(0, 100)
    })

    const validUrl = await getValidMediaAccessUrl(storedUrl)

    if (!validUrl) {
      console.error('[MMS URL Recovery] Failed to recover URL')
      return NextResponse.json(
        { error: 'Unable to recover media URL' },
        { status: 404 }
      )
    }

    console.log('[MMS URL Recovery] Successfully recovered URL:', {
      originalPreview: storedUrl.substring(0, 100),
      recoveredPreview: validUrl.substring(0, 100)
    })

    return NextResponse.json({
      validUrl,
      recovered: true
    })
  } catch (error) {
    console.error('[MMS URL Recovery] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}