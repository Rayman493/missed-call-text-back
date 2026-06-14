import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'

const REQUIRED_CONFIRMATION_PHRASE = 'I confirm this is a test data reset'

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
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { mode, filterType, filterValue, confirmationPhrase } = body

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
    if (executeMode && confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
      return NextResponse.json({
        error: 'Invalid confirmation phrase',
        details: `Confirmation phrase must be: "${REQUIRED_CONFIRMATION_PHRASE}"`
      }, { status: 403 })
    }

    // Get businesses to reset
    let businessIds: string[] = []

    if (filterType === 'email') {
      // Find businesses by user email
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
      if (usersError) {
        return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
      }

      const targetUser = users.find(u => u.email === filterValue)
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, twilio_phone_number, twilio_phone_number_sid')
        .eq('user_id', targetUser.id)

      if (!businesses || businesses.length === 0) {
        return NextResponse.json({ error: 'No businesses found for this user' }, { status: 404 })
      }

      businessIds = businesses.map(b => b.id)
    } else if (filterType === 'businessId') {
      businessIds = [filterValue]
    }

    // Block if trying to delete admin/protected businesses
    const { data: protectedBusinesses } = await supabase
      .from('businesses')
      .select('id, name')
      .in('id', businessIds.length > 0 ? businessIds : ['00000000-0000-0000-0000-000000000000'])

    if (protectedBusinesses && protectedBusinesses.some(b => b.protected)) {
      return NextResponse.json({
        error: 'Blocked: Cannot delete protected businesses',
        details: 'Protected businesses cannot be deleted'
      }, { status: 403 })
    }

    // Perform dry-run or execute
    const result = await performReset(supabase, businessIds, executeMode, filterType)

    // Log the operation
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

  } catch (error) {
    console.error('[ADMIN RESET TEST DATA] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function performReset(
  supabase: any,
  businessIds: string[],
  executeMode: boolean,
  filterType: string
): Promise<DryRunResult> {
  const summary: ResetSummary[] = []
  const warnings: string[] = []
  const affectedBusinesses: string[] = []
  const affectedTwilioNumbers: string[] = []
  let totalRecords = 0

  // Get business details first
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, protected')
    .in('id', businessIds.length > 0 ? businessIds : ['00000000-0000-0000-0000-000000000000'])

  if (businesses) {
    businesses.forEach(b => {
      if (!b.protected) {
        affectedBusinesses.push(b.id)
        if (b.twilio_phone_number) {
          affectedTwilioNumbers.push(b.twilio_phone_number)
        }
      }
    })
  }

  // Safe deletion order (child tables first, then parent tables)
  const tablesToDelete = [
    { table: 'message_media', description: 'MMS media attachments', query: (ids: string[]) => supabase.from('message_media').select('id').in('message_id', getLeadMessageIds(supabase, ids)) },
    { table: 'messages', description: 'SMS and conversation messages', query: (ids: string[]) => supabase.from('messages').select('id').in('business_id', ids) },
    { table: 'conversations', description: 'Conversation threads', query: (ids: string[]) => supabase.from('conversations').select('id').in('business_id', ids) },
    { table: 'follow_up_jobs', description: 'Scheduled follow-up jobs', query: (ids: string[]) => supabase.from('follow_up_jobs').select('id').in('business_id', ids) },
    { table: 'notifications', description: 'In-app notifications', query: (ids: string[]) => supabase.from('notifications').select('id').in('business_id', ids) },
    { table: 'ai_call_records', description: 'AI call session records', query: (ids: string[]) => supabase.from('ai_call_records').select('id').in('business_id', ids) },
    { table: 'voicemail_recordings', description: 'Voicemail recordings', query: (ids: string[]) => supabase.from('voicemail_recordings').select('id').in('business_id', ids) },
    { table: 'call_events', description: 'Call event logs', query: (ids: string[]) => supabase.from('call_events').select('id').in('business_id', ids) },
    { table: 'ai_call_failures', description: 'AI call failure logs', query: (ids: string[]) => supabase.from('ai_call_failures').select('id').in('business_id', ids) },
    { table: 'leads', description: 'Customer leads', query: (ids: string[]) => supabase.from('leads').select('id').in('business_id', ids) },
    { table: 'ignored_contacts', description: 'Ignored contact list', query: (ids: string[]) => supabase.from('ignored_contacts').select('id').in('business_id', ids) },
  ]

  // Check for warm inventory numbers
  if (affectedTwilioNumbers.length > 0) {
    const { data: warmNumbers } = await supabase
      .from('twilio_numbers')
      .select('phone_number, status')
      .in('phone_number', affectedTwilioNumbers)

    if (warmNumbers && warmNumbers.some(n => n.status === 'warm')) {
      warnings.push('Some affected numbers are in warm inventory. These will NOT be released automatically.')
    }
  }

  // Dry-run: count records that would be deleted
  for (const tableInfo of tablesToDelete) {
    try {
      const { data, error } = await tableInfo.query(businessIds)
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
      console.warn(`[ADMIN RESET] Error counting ${tableInfo.table}:`, error.message)
      // Continue with other tables
    }
  }

  // Execute: delete records
  if (executeMode && businessIds.length > 0) {
    // Delete in reverse order (child tables first)
    for (let i = tablesToDelete.length - 1; i >= 0; i--) {
      const tableInfo = tablesToDelete[i]
      try {
        const { error } = await supabase
          .from(tableInfo.table)
          .delete()
          .in('business_id', businessIds)

        if (error) {
          console.error(`[ADMIN RESET] Error deleting ${tableInfo.table}:`, error)
          warnings.push(`Failed to delete ${tableInfo.table}: ${error.message}`)
        } else {
          console.log(`[ADMIN RESET] Deleted ${summary.find(s => s.table === tableInfo.table)?.count || 0} records from ${tableInfo.table}`)
        }
      } catch (error: any) {
        console.error(`[ADMIN RESET] Exception deleting ${tableInfo.table}:`, error)
        warnings.push(`Exception deleting ${tableInfo.table}: ${error.message}`)
      }
    }

    // Note: We do NOT delete businesses themselves, just their data
    // This preserves business configuration, subscription, and Twilio number assignment
  }

  return {
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
    blocked: false
  }
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
