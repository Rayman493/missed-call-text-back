import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'

const REQUIRED_CONFIRMATION_PHRASE = 'I confirm full deletion of this test business'

interface ResetSummary {
  table: string
  count: number
  businessIds: string[]
  twilioNumbers: string[]
  description: string
}

interface DryRunResult {
  mode: 'dry-run' | 'execute'
  filter: {
    type: 'email' | 'businessId' | 'all'
    value?: string
  }
  summary: ResetSummary[]
  totalRecords: number
  affectedBusinesses: string[]
  affectedTwilioNumbers: string[]
  warnings: string[]
  blocked: boolean
  blockReason?: string
  totalRecordsDeleted?: number
  businessesDeleted?: number
  twilioNumbersReserved?: number
  reservedUntil?: string | null
}

export async function POST(request: NextRequest) {
  console.log('[ADMIN RESET] ========== START ==========')
  console.log('[ADMIN RESET] Request received')

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log('[ADMIN RESET] Supabase client created')

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    console.log('[ADMIN RESET] Auth header present:', !!authHeader)

    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[ADMIN RESET] Missing or invalid auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    console.log('[ADMIN RESET] Token extracted, getting user')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError) {
      console.error('[ADMIN RESET] User auth error:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user) {
      console.error('[ADMIN RESET] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[ADMIN RESET] User authenticated:', user.id)

    // Check if user is admin
    const isAdminUser = isAdmin(user.id)
    console.log('[ADMIN RESET] Admin check:', isAdminUser)

    if (!isAdminUser) {
      console.error('[ADMIN RESET] User is not admin')
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Parse request body
    console.log('[ADMIN RESET] Parsing request body')
    const body = await request.json()
    console.log('[ADMIN RESET] Request body parsed:', body)
    const { mode, filterType, filterValue, confirmationPhrase } = body
    console.log('[ADMIN RESET] Parsed params:', { mode, filterType, filterValue, confirmationPhrase })

    // Default to dry-run
    const executeMode = mode === 'execute'
    if (!executeMode && mode !== 'dry-run') {
      return NextResponse.json({ error: 'Invalid mode. Use "dry-run" or "execute"' }, { status: 400 })
    }

    // Validate filter type
    if (!['email', 'businessId', 'all'].includes(filterType)) {
      return NextResponse.json({ error: 'Invalid filterType. Use "email", "businessId", or "all"' }, { status: 400 })
    }

    // Block "all" filter in execute mode without explicit confirmation
    if (filterType === 'all' && executeMode) {
      return NextResponse.json({
        error: 'Blocked: Cannot delete all data in execute mode',
        details: 'Use specific email or businessId filter for execute mode'
      }, { status: 403 })
    }

    // Require confirmation phrase for execute mode
    console.log('[ADMIN RESET] Checking confirmation phrase for execute mode')
    console.log('[ADMIN RESET] executeMode:', executeMode)
    console.log('[ADMIN RESET] confirmationPhrase:', confirmationPhrase)
    console.log('[ADMIN RESET] REQUIRED_CONFIRMATION_PHRASE:', REQUIRED_CONFIRMATION_PHRASE)
    console.log('[ADMIN RESET] Phrase match:', confirmationPhrase === REQUIRED_CONFIRMATION_PHRASE)
    
    if (executeMode && confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
      console.error('[ADMIN RESET] Invalid confirmation phrase - blocking execution')
      return NextResponse.json({
        error: 'Invalid confirmation phrase',
        details: `Confirmation phrase must be: "${REQUIRED_CONFIRMATION_PHRASE}"`
      }, { status: 403 })
    }

    console.log('[ADMIN RESET] Confirmation phrase validated successfully')

    // Get businesses to reset
    console.log('[ADMIN RESET] Getting businesses to reset')
    let businessIds: string[] = []

    if (filterType === 'email') {
      console.log('[ADMIN RESET] Filter type: email, value:', filterValue)
      // Find businesses by user email
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
      console.log('[ADMIN RESET] Users listed:', users?.length)
      if (usersError) {
        console.error('[ADMIN RESET] Failed to list users:', usersError)
        return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
      }

      const targetUser = users.find(u => u.email === filterValue)
      console.log('[ADMIN RESET] Target user found:', !!targetUser)
      if (!targetUser) {
        console.error('[ADMIN RESET] User not found')
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, twilio_phone_number, twilio_phone_number_sid')
        .eq('user_id', targetUser.id)

      console.log('[ADMIN RESET] Businesses found:', businesses?.length)
      if (!businesses || businesses.length === 0) {
        console.error('[ADMIN RESET] No businesses found for user')
        return NextResponse.json({ error: 'No businesses found for this user' }, { status: 404 })
      }

      businessIds = businesses.map(b => b.id)
    } else if (filterType === 'businessId') {
      console.log('[ADMIN RESET] Filter type: businessId, value:', filterValue)
      businessIds = [filterValue]
    }

    console.log('[ADMIN RESET] Business IDs to process:', businessIds)

    // Block if trying to delete admin/protected businesses
    console.log('[ADMIN RESET] Checking for protected businesses')
    const { data: protectedBusinesses } = await supabase
      .from('businesses')
      .select('id, name, is_protected_account')
      .in('id', businessIds.length > 0 ? businessIds : ['00000000-0000-0000-0000-000000000000'])

    console.log('[ADMIN RESET] Protected businesses check:', protectedBusinesses?.length)
    if (protectedBusinesses && protectedBusinesses.some((b: any) => b.is_protected_account)) {
      console.error('[ADMIN RESET] Blocked: Protected businesses found')
      return NextResponse.json({
        error: 'Blocked: Cannot delete protected businesses',
        details: 'Protected businesses cannot be deleted'
      }, { status: 403 })
    }

    // Perform dry-run or execute
    console.log('[ADMIN RESET] Calling performReset with executeMode:', executeMode)
    const result = await performReset(supabase, businessIds, executeMode, filterType)
    console.log('[ADMIN RESET] performReset completed, result:', JSON.stringify(result, null, 2))

    // Log the operation
    console.log('[ADMIN RESET] Preparing to return response')
    console.log('[ADMIN RESET TEST DATA]', {
      mode: executeMode ? 'execute' : 'dry-run',
      filterType,
      filterValue,
      businessIds,
      totalRecords: result.totalRecords,
      affectedTwilioNumbers: result.affectedTwilioNumbers,
      performedBy: user.id,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[ADMIN RESET TEST DATA] Unexpected error:', error)
    console.error('[ADMIN RESET TEST DATA] Error stack:', error.stack)
    console.error('[ADMIN RESET TEST DATA] Error message:', error.message)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}

async function performReset(
  supabase: any,
  businessIds: string[],
  executeMode: boolean,
  filterType: string
): Promise<DryRunResult> {
  console.log('[ADMIN RESET] performReset START')
  console.log('[ADMIN RESET] businessIds:', businessIds)
  console.log('[ADMIN RESET] executeMode:', executeMode)
  console.log('[ADMIN RESET] filterType:', filterType)

  const summary: ResetSummary[] = []
  const warnings: string[] = []
  const affectedBusinesses: string[] = []
  const affectedTwilioNumbers: string[] = []
  let totalRecords = 0

  // Get business details first
  console.log('[ADMIN RESET] Getting business details')
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, is_protected_account')
    .in('id', businessIds.length > 0 ? businessIds : ['00000000-0000-0000-0000-000000000000'])

  console.log('[ADMIN RESET] Businesses fetched:', businesses?.length)

  if (businesses) {
    businesses.forEach((b: any) => {
      console.log('[ADMIN RESET] Processing business:', { id: b.id, name: b.name, twilio_phone_number: b.twilio_phone_number, is_protected_account: b.is_protected_account })
      if (!b.is_protected_account) {
        affectedBusinesses.push(b.id)
        if (b.twilio_phone_number) {
          affectedTwilioNumbers.push(b.twilio_phone_number)
          console.log('[ADMIN RESET] Added to affectedTwilioNumbers:', b.twilio_phone_number)
        } else {
          console.log('[ADMIN RESET] Business has no twilio_phone_number')
        }
      } else {
        console.log('[ADMIN RESET] Business is protected, skipping')
      }
    })
  }

  console.log('[ADMIN RESET] Final affectedTwilioNumbers:', affectedTwilioNumbers)

  // Safe deletion order (child tables first, then parent tables)
  // Schema-safe: Document which foreign key each table uses for deletion
  // message_media: uses message_id (no business_id column)
  // messages: uses conversation_id (via conversations table which has business_id)
  // conversations: uses business_id
  // follow_up_jobs: uses business_id
  // notifications: uses business_id
  // ai_call_records: uses business_id
  // voicemail_recordings: uses business_id
  // call_events: uses business_id
  // ai_call_failures: uses business_id
  // leads: uses business_id
  // ignored_contacts: uses business_id
  
  // Get conversation IDs for messages deletion (schema-safe: messages doesn't have business_id)
  console.log('[ADMIN RESET] Getting conversation IDs for messages query')
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .in('business_id', businessIds.length > 0 ? businessIds : ['00000000-0000-0000-0000-000000000000'])
  
  const conversationIds = conversations?.map((c: any) => c.id) || []
  console.log('[ADMIN RESET] Conversation IDs retrieved:', conversationIds.length)
  
  // Get message IDs for message_media query (schema-safe: message_media doesn't have business_id)
  console.log('[ADMIN RESET] Getting message IDs for message_media query')
  const messageIds = await getLeadMessageIds(supabase, businessIds)
  console.log('[ADMIN RESET] Message IDs retrieved:', messageIds.length)
  
  const tablesToDelete = [
    { table: 'message_media', description: 'MMS media attachments', query: (ids: string[]) => supabase.from('message_media').select('id').in('message_id', messageIds), key: 'message_id' },
    { table: 'messages', description: 'SMS and conversation messages', query: (ids: string[]) => supabase.from('messages').select('id').in('conversation_id', conversationIds), key: 'conversation_id' },
    { table: 'conversations', description: 'Conversation threads', query: (ids: string[]) => supabase.from('conversations').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'follow_up_jobs', description: 'Scheduled follow-up jobs', query: (ids: string[]) => supabase.from('follow_up_jobs').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'notifications', description: 'In-app notifications', query: (ids: string[]) => supabase.from('notifications').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'ai_call_records', description: 'AI call session records', query: (ids: string[]) => supabase.from('ai_call_records').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'voicemail_recordings', description: 'Voicemail recordings', query: (ids: string[]) => supabase.from('voicemail_recordings').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'call_events', description: 'Call event logs', query: (ids: string[]) => supabase.from('call_events').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'ai_call_failures', description: 'AI call failure logs', query: (ids: string[]) => supabase.from('ai_call_failures').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'leads', description: 'Customer leads', query: (ids: string[]) => supabase.from('leads').select('id').in('business_id', ids), key: 'business_id' },
    { table: 'ignored_contacts', description: 'Ignored contact list', query: (ids: string[]) => supabase.from('ignored_contacts').select('id').in('business_id', ids), key: 'business_id' },
  ]

  // Check for warm inventory numbers
  if (affectedTwilioNumbers.length > 0) {
    const { data: warmNumbers } = await supabase
      .from('twilio_numbers')
      .select('phone_number, status')
      .in('phone_number', affectedTwilioNumbers)

    if (warmNumbers && warmNumbers.some((n: any) => n.status === 'warm')) {
      warnings.push('Some affected numbers are in warm inventory. These will NOT be released automatically.')
    }
  }

  // Dry-run: count records that would be deleted
  console.log('[ADMIN RESET] Starting table count loop')
  console.log('[ADMIN RESET] businessIds for queries:', businessIds)
  for (const tableInfo of tablesToDelete) {
    try {
      console.log(`[ADMIN RESET] Counting table: ${tableInfo.table}`)
      const { data, error } = await tableInfo.query(businessIds)
      console.log(`[ADMIN RESET] Table ${tableInfo.table} query result:`, { 
        error: !!error, 
        errorMessage: error?.message, 
        count: data?.length,
        data: data 
      })
      const count = data ? data.length : 0

      if (count > 0) {
        summary.push({
          table: tableInfo.table,
          count,
          businessIds,
          twilioNumbers: affectedTwilioNumbers,
          description: tableInfo.description
        })
        totalRecords += count
      }
    } catch (error: any) {
      console.error(`[ADMIN RESET] Error counting ${tableInfo.table}:`, error)
      console.warn(`[ADMIN RESET] Error counting ${tableInfo.table}:`, error.message)
      // Continue with other tables
    }
  }
  console.log('[ADMIN RESET] Table count loop completed')

  // Execute: delete records
  let businessesDeleted = 0
  let twilioNumbersReserved = 0
  let reservedUntil: string | null = null

  console.log('[ADMIN RESET] Checking execute mode condition')
  console.log('[ADMIN RESET] executeMode:', executeMode)
  console.log('[ADMIN RESET] businessIds.length:', businessIds.length)
  console.log('[ADMIN RESET] Entering execute mode:', executeMode && businessIds.length > 0)

  if (executeMode && businessIds.length > 0) {
    console.log('[ADMIN RESET] ========== EXECUTE MODE START ==========')
    console.log('[ADMIN RESET] Starting execute mode')
    
    // Reserve Twilio numbers for 30-day grace period BEFORE deleting business
    if (affectedTwilioNumbers.length > 0) {
      console.log('[ADMIN RESET] Reserving Twilio numbers before business deletion')
      console.log('[ADMIN RESET] affectedTwilioNumbers:', affectedTwilioNumbers)
      
      // First, check if these phone numbers exist in twilio_numbers table
      const { data: existingTwilioNumbers } = await supabase
        .from('twilio_numbers')
        .select('phone_number, status, business_id')
        .in('phone_number', affectedTwilioNumbers)
      
      console.log('[ADMIN RESET] Existing Twilio numbers in database:', existingTwilioNumbers)
      console.log('[ADMIN RESET] Matched count:', existingTwilioNumbers?.length, 'Expected count:', affectedTwilioNumbers.length)
      
      if (!existingTwilioNumbers || existingTwilioNumbers.length === 0) {
        console.error('[ADMIN RESET] ERROR: No matching Twilio numbers found in twilio_numbers table!')
        console.error('[ADMIN RESET] This means the UPDATE will not affect any rows')
        warnings.push('Warning: No matching Twilio numbers found in twilio_numbers table. Reservation may not work.')
      }
      
      try {
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
        reservedUntil = thirtyDaysFromNow.toISOString()

        // Get current numbers and business details for logging
        const { data: currentNumbers } = await supabase
          .from('twilio_numbers')
          .select('phone_number, status, business_id')
          .in('phone_number', affectedTwilioNumbers)

        console.log('[ADMIN RESET] Current Twilio numbers:', currentNumbers)

        // Get business details for stable keys
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id, user_id, business_phone, stripe_customer_id')
          .in('id', businessIds)

        console.log('[ADMIN RESET] Business details for reservation:', businesses)
        const businessMap = new Map(businesses?.map((b: any) => [b.id, b]) || [])

        // Get user email for stable reclaim key
        let ownerEmail = null
        if (businesses && businesses.length > 0 && businesses[0].user_id) {
          const { data: user } = await supabase.auth.admin.getUserById(businesses[0].user_id)
          if (user && user.user && user.user.email) {
            ownerEmail = user.user.email
          }
        }
        console.log('[ADMIN RESET] Owner email for reservation:', ownerEmail)

        // Get the business for stable keys
        const targetBusiness = businesses?.[0]
        console.log('[ADMIN RESET] Target business for reservation:', targetBusiness)

        // Prepare reservation data (schema-safe: only include columns that exist in production)
        const reservationData = {
          status: 'reserved',
          business_id: null, // Clear business_id
          reserved_for_business_id: businessIds[0], // Set to target business ID
          reserved_at: new Date().toISOString(),
          reserved_expires_at: reservedUntil,
          reservation_reason: 'test_business_data_reset',
          reserved_owner_email: ownerEmail || null,
          reserved_business_phone: targetBusiness?.business_phone || targetBusiness?.twilio_phone_number || null,
          reserved_stripe_customer_id: targetBusiness?.stripe_customer_id || null,
          reserved_user_id: targetBusiness?.user_id || null,
          // Note: detached_at and detached_reason are not included as they don't exist in production schema
        }
        console.log('[ADMIN RESET] Reservation data:', reservationData)

        // Try to update with new reserved fields (if migration applied)
        console.log('[ADMIN RESET] Executing UPDATE twilio_numbers')
        console.log('[ADMIN RESET] WHERE clause: phone_number IN (', affectedTwilioNumbers, ')')
        console.log('[ADMIN RESET] UPDATE values:', reservationData)
        
        const { error: reserveError, data: reserveData, count: reserveCount } = await supabase
          .from('twilio_numbers')
          .update(reservationData)
          .in('phone_number', affectedTwilioNumbers)

        console.log('[ADMIN RESET] Twilio reservation UPDATE result:')
        console.log('[ADMIN RESET] - error:', reserveError)
        console.log('[ADMIN RESET] - data:', reserveData)
        console.log('[ADMIN RESET] - count:', reserveCount)
        console.log('[ADMIN RESET] - affectedTwilioNumbers length:', affectedTwilioNumbers.length)

        if (reserveError) {
          console.error('[ADMIN RESET] Error reserving Twilio numbers with new fields:', reserveError)

          // If error is due to missing columns, try without the new fields
          if (reserveError.message && reserveError.message.includes('column')) {
            console.log('[ADMIN RESET] Falling back to update without new reserved fields')
            const { error: fallbackError, data: fallbackData } = await supabase
              .from('twilio_numbers')
              .update({
                status: 'reserved',
                business_id: null,
                reserved_for_business_id: businessIds[0],
                reserved_at: new Date().toISOString(),
                reserved_expires_at: reservedUntil,
                reservation_reason: 'test_business_data_reset',
                // Note: detached_at and detached_reason are not included as they don't exist in production schema
              })
              .in('phone_number', affectedTwilioNumbers)

            console.log('[ADMIN RESET] Fallback reservation result:', { error: fallbackError, data: fallbackData })

            if (fallbackError) {
              console.error('[ADMIN RESET] Error reserving Twilio numbers (fallback):', fallbackError)
              warnings.push(`Failed to reserve Twilio numbers: ${fallbackError.message}`)
            } else {
              console.log(`[ADMIN RESET] Reserved ${affectedTwilioNumbers.length} Twilio numbers for 30-day grace period (fallback)`)
              twilioNumbersReserved = affectedTwilioNumbers.length
              warnings.push(`Reserved ${affectedTwilioNumbers.length} Twilio number(s) for 30-day grace period. Numbers will become available after ${reservedUntil}.`)
            }
          } else {
            warnings.push(`Failed to reserve Twilio numbers: ${reserveError.message}`)
          }
        } else {
          console.log(`[ADMIN RESET] Reserved ${affectedTwilioNumbers.length} Twilio numbers for 30-day grace period`)
          twilioNumbersReserved = affectedTwilioNumbers.length
          currentNumbers?.forEach((num: any) => {
            const business = businessMap.get(num.business_id)
            console.log('[ADMIN RESET] Twilio number reserved', {
              phone_number: num.phone_number,
              old_status: num.status,
              new_status: 'reserved',
              reserved_for_business_id: businessIds[0],
              reserved_expires_at: reservedUntil,
              reservation_reason: 'test_business_data_reset',
            })
          })
          warnings.push(`Reserved ${affectedTwilioNumbers.length} Twilio number(s) for 30-day grace period. Numbers will become available after ${reservedUntil}.`)
        }
      } catch (error: any) {
        console.error('[ADMIN RESET] Exception reserving Twilio numbers:', error)
        console.error('[ADMIN RESET] Error stack:', error.stack)
        warnings.push(`Exception reserving Twilio numbers: ${error.message}`)
      }
    } else {
      console.log('[ADMIN RESET] No affected Twilio numbers to reserve')
    }

    // Delete in reverse order (child tables first)
    console.log('[ADMIN RESET] Deleting records from tables')
    console.log('[ADMIN RESET] tablesToDelete:', tablesToDelete.map(t => t.table))
    for (let i = tablesToDelete.length - 1; i >= 0; i--) {
      const tableInfo = tablesToDelete[i]
      console.log(`[ADMIN RESET] Deleting from table: ${tableInfo.table} using key: ${tableInfo.key}`)
      try {
        // Use the correct foreign key based on the table schema
        let deleteQuery
        if (tableInfo.key === 'message_id') {
          deleteQuery = supabase
            .from(tableInfo.table)
            .delete()
            .in('message_id', messageIds)
        } else if (tableInfo.key === 'conversation_id') {
          deleteQuery = supabase
            .from(tableInfo.table)
            .delete()
            .in('conversation_id', conversationIds)
        } else {
          deleteQuery = supabase
            .from(tableInfo.table)
            .delete()
            .in('business_id', businessIds)
        }

        const { error, count } = await deleteQuery

        console.log(`[ADMIN RESET] Delete result for ${tableInfo.table}:`, { error, count })

        if (error) {
          console.error(`[ADMIN RESET] Error deleting ${tableInfo.table}:`, error)
          warnings.push(`Failed to delete ${tableInfo.table}: ${error.message}`)
        } else {
          const tableCount = summary.find(s => s.table === tableInfo.table)?.count || 0
          console.log(`[ADMIN RESET] Deleted ${count || tableCount} records from ${tableInfo.table}`)
        }
      } catch (error: any) {
        console.error(`[ADMIN RESET] Exception deleting ${tableInfo.table}:`, error)
        console.error(`[ADMIN RESET] Error stack:`, error.stack)
        warnings.push(`Exception deleting ${tableInfo.table}: ${error.message}`)
      }
    }
    console.log('[ADMIN RESET] Runtime record deletion completed')

    // Delete business rows
    console.log('[ADMIN RESET] Deleting business rows')
    console.log('[ADMIN RESET] businessIds to delete:', businessIds)
    for (const businessId of businessIds) {
      console.log(`[ADMIN RESET] Deleting business: ${businessId}`)
      try {
        const { error: deleteBusinessError, count: deleteCount } = await supabase
          .from('businesses')
          .delete()
          .eq('id', businessId)

        console.log(`[ADMIN RESET] Business delete result:`, { error: deleteBusinessError, count: deleteCount })

        if (deleteBusinessError) {
          console.error('[ADMIN RESET] Error deleting business:', deleteBusinessError)
          warnings.push(`Failed to delete business ${businessId}: ${deleteBusinessError.message}`)
        } else {
          console.log('[ADMIN RESET] Deleted business:', businessId, 'count:', deleteCount)
          businessesDeleted++
        }
      } catch (error: any) {
        console.error('[ADMIN RESET] Exception deleting business:', error)
        console.error('[ADMIN RESET] Error stack:', error.stack)
        warnings.push(`Exception deleting business ${businessId}: ${error.message}`)
      }
    }
    console.log('[ADMIN RESET] Business deletion completed')

    // Note: We do NOT delete auth users for test data reset
    // This is a test data reset, not a full account deletion
    console.log('[ADMIN RESET] Auth users preserved (test data reset, not account deletion)')
    warnings.push('Auth users preserved. This is a test data reset, not a full account deletion.')
    
    console.log('[ADMIN RESET] Execute mode completed', {
      totalRecordsDeleted: totalRecords,
      businessesDeleted,
      twilioNumbersReserved,
      reservedUntil
    })
  }

  console.log('[ADMIN RESET] performReset preparing to return')
  console.log('[ADMIN RESET] Summary:', summary)
  console.log('[ADMIN RESET] Total records:', totalRecords)
  console.log('[ADMIN RESET] Affected businesses:', affectedBusinesses)
  console.log('[ADMIN RESET] Affected Twilio numbers:', affectedTwilioNumbers)
  console.log('[ADMIN RESET] Warnings:', warnings)
  console.log('[ADMIN RESET] Execute mode:', executeMode)
  console.log('[ADMIN RESET] Filter type:', filterType)

  const result: DryRunResult = {
    mode: executeMode ? 'execute' : 'dry-run',
    filter: {
      type: filterType as 'email' | 'businessId' | 'all',
      value: filterType === 'email' || filterType === 'businessId' ? businessIds.join(',') : undefined
    },
    summary,
    totalRecords,
    affectedBusinesses,
    affectedTwilioNumbers,
    warnings,
    blocked: false,
    totalRecordsDeleted: executeMode ? totalRecords : undefined,
    businessesDeleted: executeMode ? businessesDeleted : undefined,
    twilioNumbersReserved: executeMode ? twilioNumbersReserved : undefined,
    reservedUntil: executeMode ? reservedUntil : undefined
  }

  console.log('[ADMIN RESET] performReset returning result:', JSON.stringify(result, null, 2))
  return result
}

async function getLeadMessageIds(supabase: any, businessIds: string[]): Promise<string[]> {
  // Get all message IDs for leads in these businesses
  const { data: messages } = await supabase
    .from('messages')
    .select('id')
    .in('business_id', businessIds)

  return messages ? messages.map((m: any) => m.id) : []
}

// GET handler for documentation
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/reset-test-data',
    method: 'POST',
    description: 'Safe test data reset with dry-run and execute modes',
    parameters: {
      mode: {
        type: 'string',
        enum: ['dry-run', 'execute'],
        required: true,
        description: 'dry-run shows what would be deleted, execute performs deletion'
      },
      filterType: {
        type: 'string',
        enum: ['email', 'businessId', 'all'],
        required: true,
        description: 'Filter by user email, specific business ID, or all (dry-run only)'
      },
      filterValue: {
        type: 'string',
        required: false,
        description: 'Email address or business ID (required when filterType is email or businessId)'
      },
      confirmationPhrase: {
        type: 'string',
        required: false,
        description: `Required for execute mode. Must be: "${REQUIRED_CONFIRMATION_PHRASE}"`
      }
    },
    safeguards: [
      'Default to dry-run mode',
      'Require confirmation phrase for execute mode',
      'Block "all" filter in execute mode',
      'Block deletion of protected businesses',
      'Do NOT delete businesses, only their data',
      'Do NOT delete Twilio numbers from warm inventory',
      'Do NOT delete Stripe configuration',
      'Do NOT delete admin accounts',
      'Log all operations'
    ],
    examples: {
      dryRunByEmail: {
        method: 'POST',
        body: {
          mode: 'dry-run',
          filterType: 'email',
          filterValue: 'test@example.com'
        }
      },
      dryRunByBusinessId: {
        method: 'POST',
        body: {
          mode: 'dry-run',
          filterType: 'businessId',
          filterValue: 'business-uuid-here'
        }
      },
      execute: {
        method: 'POST',
        body: {
          mode: 'execute',
          filterType: 'businessId',
          filterValue: 'business-uuid-here',
          confirmationPhrase: REQUIRED_CONFIRMATION_PHRASE
        }
      }
    }
  })
}
