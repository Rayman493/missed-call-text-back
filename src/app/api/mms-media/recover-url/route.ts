import { NextRequest, NextResponse } from 'next/server'
import { getValidMediaAccessUrl } from '@/lib/mms-media-url-helper'
import { extractStoragePathFromUrl } from '@/lib/mms-media-url-helper'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserRoleForBusiness } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

/**
 * Recover a valid MMS media access URL from a potentially broken stored URL.
 *
 * This endpoint handles historical records with token=undefined, expired tokens, etc.
 * It extracts the storage path and generates a fresh valid URL.
 *
 * SECURITY: Requires authenticated session. The storage path's first segment
 * (business_id) must belong to a business owned by the authenticated user.
 * This mirrors the ownership contract used by /api/mms-media/serve.
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

    // --- Authentication: require a valid user session ---
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // --- Authorization: extract business_id from storage path and verify ownership ---
    const storagePath = extractStoragePathFromUrl(storedUrl)
    if (!storagePath) {
      return NextResponse.json(
        { error: 'Unable to extract storage path' },
        { status: 400 }
      )
    }

    // The storage path format is "business-id/..." — first segment is business_id
    const pathSegments = storagePath.split('/')
    const businessId = pathSegments[0]

    if (!businessId || businessId === '' || businessId.includes('..') || businessId.includes('.')) {
      return NextResponse.json(
        { error: 'Invalid storage path' },
        { status: 400 }
      )
    }

    // Verify the user has membership in this business (same contract as /api/mms-media/serve)
    const businessRole = await getUserRoleForBusiness(supabaseAdmin, user.id, businessId)

    if (!businessRole) {
      console.error('[MMS URL Recovery] User not authorized for this business', {
        businessId,
        userId: user.id
      })
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
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