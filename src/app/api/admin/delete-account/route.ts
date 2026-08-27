import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { deleteAccountLifecycle } from '@/lib/account-deletion-service'

const REQUIRED_CONFIRMATION_PHRASE = 'DELETE'

export async function POST(request: NextRequest) {
  console.log('[ADMIN DELETE ACCOUNT] ========== START ==========')
  console.log('[ADMIN DELETE ACCOUNT] Request received')

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log('[ADMIN DELETE ACCOUNT] Supabase client created')

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    console.log('[ADMIN DELETE ACCOUNT] Auth header present:', !!authHeader)

    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[ADMIN DELETE ACCOUNT] Missing or invalid auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    console.log('[ADMIN DELETE ACCOUNT] Token extracted, getting user')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError) {
      console.error('[ADMIN DELETE ACCOUNT] User auth error:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user) {
      console.error('[ADMIN DELETE ACCOUNT] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[ADMIN DELETE ACCOUNT] User authenticated:', user.id)

    // Check if user is admin
    const isAdminUser = isAdmin(user.id)
    console.log('[ADMIN DELETE ACCOUNT] Admin check:', isAdminUser)

    if (!isAdminUser) {
      console.error('[ADMIN DELETE ACCOUNT] User is not admin')
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Parse request body
    console.log('[ADMIN DELETE ACCOUNT] Parsing request body')
    const body = await request.json()
    console.log('[ADMIN DELETE ACCOUNT] Request body parsed:', body)
    const { targetUserId, targetBusinessId, deleteConfirmation, dryRun = false } = body
    console.log('[ADMIN DELETE ACCOUNT] Parsed params:', { targetUserId, targetBusinessId, deleteConfirmation, dryRun })

    // Validate required fields
    if (!targetUserId && !targetBusinessId) {
      console.error('[ADMIN DELETE ACCOUNT] Missing targetUserId or targetBusinessId')
      return NextResponse.json(
        { error: 'Either targetUserId or targetBusinessId is required' },
        { status: 400 }
      )
    }

    // Require confirmation phrase for execute mode
    if (!dryRun) {
      console.log('[ADMIN DELETE ACCOUNT] Checking confirmation phrase')
      console.log('[ADMIN DELETE ACCOUNT] deleteConfirmation:', deleteConfirmation)
      console.log('[ADMIN DELETE ACCOUNT] REQUIRED_CONFIRMATION_PHRASE:', REQUIRED_CONFIRMATION_PHRASE)
      console.log('[ADMIN DELETE ACCOUNT] Phrase match:', deleteConfirmation === REQUIRED_CONFIRMATION_PHRASE)

      if (deleteConfirmation !== REQUIRED_CONFIRMATION_PHRASE) {
        console.error('[ADMIN DELETE ACCOUNT] Invalid confirmation phrase')
        return NextResponse.json(
          {
            error: 'Invalid confirmation phrase',
            details: `Confirmation phrase must be: "${REQUIRED_CONFIRMATION_PHRASE}"`,
          },
          { status: 403 }
        )
      }

      console.log('[ADMIN DELETE ACCOUNT] Confirmation phrase validated successfully')
    }

    // Resolve target userId if only businessId is provided
    let resolvedUserId = targetUserId
    if (!resolvedUserId && targetBusinessId) {
      console.log('[ADMIN DELETE ACCOUNT] Resolving userId from businessId:', targetBusinessId)
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('user_id')
        .eq('id', targetBusinessId)
        .single()

      if (businessError || !business) {
        console.error('[ADMIN DELETE ACCOUNT] Business not found:', businessError)
        return NextResponse.json({ error: 'Business not found' }, { status: 404 })
      }

      resolvedUserId = business.user_id
      console.log('[ADMIN DELETE ACCOUNT] Resolved userId:', resolvedUserId)
    }

    // Get target user email for offboarding emails
    let targetUserEmail = null
    try {
      const { data: targetUser } = await supabase.auth.admin.getUserById(resolvedUserId)
      if (targetUser && targetUser.user && targetUser.user.email) {
        targetUserEmail = targetUser.user.email
      }
    } catch (error) {
      console.warn('[ADMIN DELETE ACCOUNT] Failed to fetch target user email:', error)
    }

    console.log('[ADMIN DELETE ACCOUNT] Target user email:', targetUserEmail)

    // Call shared deletion lifecycle service
    console.log('[ADMIN DELETE ACCOUNT] Calling shared deletion lifecycle service')
    const result = await deleteAccountLifecycle({
      userId: resolvedUserId,
      userEmail: targetUserEmail,
      deletionSource: 'admin',
      adminUserId: user.id,
      adminUserEmail: user.email,
      dryRun,
      skipOffboardingEmails: false, // Send offboarding emails even for admin deletions
    })

    if (!result.ok) {
      console.error('[ADMIN DELETE ACCOUNT] Deletion lifecycle failed:', result.error)
      return NextResponse.json(
        {
          ok: false,
          step: result.step,
          error: result.error,
          details: result.details,
          businessId: (result as any).businessId,
          errorType: (result as any).errorType,
        },
        { status: result.step === 'protected_account_check' ? 403 : result.step === 'preflight_validation' ? 409 : 500 }
      )
    }

    console.log('[ADMIN DELETE ACCOUNT] Deletion lifecycle succeeded')

    // Log the operation
    console.log('[ADMIN DELETE ACCOUNT] Operation completed', {
      mode: dryRun ? 'dry-run' : 'execute',
      targetUserId: resolvedUserId,
      targetBusinessId,
      performedBy: user.id,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[ADMIN DELETE ACCOUNT] Unexpected error:', error)
    console.error('[ADMIN DELETE ACCOUNT] Error stack:', error.stack)
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}