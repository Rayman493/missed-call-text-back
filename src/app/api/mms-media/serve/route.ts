import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyMmsMediaToken } from '@/lib/mms-media-token'
import { detectMimeType } from '@/lib/mime-detection'
import { isValidStoragePath } from '@/lib/mms-path-validation'

const DEBUG = process.env.NODE_ENV === 'development'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filePath = searchParams.get('path')
    const authToken = searchParams.get('token')
    const authHeader = request.headers.get('authorization')

    if (DEBUG) console.log('[MMS Media Serve] Request received:', {
      pathPresent: !!filePath,
      pathLength: filePath?.length,
      pathPreview: filePath ? filePath.substring(0, 50) : undefined,
      tokenPresent: !!authToken,
      tokenLength: authToken?.length,
      tokenSegmentCount: authToken ? authToken.split('.').length : 0,
      tokenDotCount: authToken ? authToken.split('.').length - 1 : 0,
      tokenPrefix: authToken ? authToken.substring(0, 6) : undefined,
      tokenSuffix: authToken ? authToken.slice(-6) : undefined,
      bearerTokenPresent: !!authHeader
    })

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      )
    }

    // Accept either URL token or Bearer token authentication
    let tokenPayload = null

    // First, try Bearer token (session auth)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.replace('Bearer ', '')
      if (DEBUG) console.log('[MMS Media Serve] Attempting Bearer token authentication')

      // Verify user session with Bearer token
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken)

      if (authError || !user) {
        console.error('[MMS Media Serve] Invalid Bearer token')
      } else {
        // Validate and normalize the file path
        if (!isValidStoragePath(filePath)) {
          console.error('[MMS Media Serve] Invalid file path structure')
          return NextResponse.json(
            { error: 'Invalid file path' },
            { status: 400 }
          )
        }

        // Extract business_id from the file path (first segment)
        const pathSegments = filePath.split('/')
        const businessId = pathSegments[0]

        if (!businessId || businessId === '' || businessId.includes('..') || businessId.includes('.')) {
          console.error('[MMS Media Serve] Invalid business_id in path')
          return NextResponse.json(
            { error: 'Invalid file path' },
            { status: 400 }
          )
        }

        // Verify the user owns this business
        const { data: business, error: businessError } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .eq('id', businessId)
          .eq('user_id', user.id)
          .single()

        if (!businessError && business) {
          if (DEBUG) console.log('[MMS Media Serve] Bearer token authentication successful')
          tokenPayload = { path: filePath } // Minimal payload for consistency
        } else {
          console.error('[MMS Media Serve] User not authorized for this business')
        }
      }
    }

    // If Bearer auth failed or not provided, fall back to URL token
    if (!tokenPayload && authToken) {
      if (DEBUG) console.log('[MMS Media Serve] Attempting URL token authentication')
      tokenPayload = await verifyMmsMediaToken(authToken, filePath)
    }

    if (!tokenPayload) {
      console.error('[MMS Media Serve] Invalid or expired authentication')
      return NextResponse.json(
        { error: 'Invalid or expired authentication token' },
        { status: 401 }
      )
    }

    if (DEBUG) console.log('[MMS Media Serve] Authentication successful:', {
      filePath: filePath.substring(0, 100)
    })

    if (DEBUG) console.log('[MMS Media Serve] Fetching file:', {
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

    // Detect MIME type from file bytes (more reliable than extension)
    let contentType = 'image/jpeg' // Default fallback

    try {
      // Create a File object from the blob for MIME detection
      const fileName = filePath.split('/').pop() || 'image.jpg'
      const file = new File([fileData], fileName, { type: 'image/jpeg' })
      const detection = await detectMimeType(file)

      if (DEBUG) console.log('[MMS Media Serve] MIME detection:', {
        fileName,
        detectedType: detection.detectedMimeType,
        signatureValid: detection.byteSignatureValid,
        signature: detection.signature
      })

      if (detection.byteSignatureValid) {
        contentType = detection.detectedMimeType
      } else {
        // Fallback to extension-based detection if signature is invalid
        const extension = filePath.split('.').pop()?.toLowerCase() || ''
        const mimeTypes: Record<string, string> = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif'
        }
        contentType = mimeTypes[extension] || 'image/jpeg'
        console.warn('[MMS Media Serve] Using extension-based MIME as fallback:', {
          extension,
          contentType
        })
      }
    } catch (error) {
      console.error('[MMS Media Serve] Error detecting MIME from bytes:', error)
      // Fallback to extension-based detection
      const extension = filePath.split('.').pop()?.toLowerCase() || ''
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif'
      }
      contentType = mimeTypes[extension] || 'image/jpeg'
    }

    if (DEBUG) console.log('[MMS Media Serve] Serving file:', {
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