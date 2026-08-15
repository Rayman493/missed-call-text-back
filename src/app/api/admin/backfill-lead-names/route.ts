import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Authenticate user using server-side client with RLS
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-backfill-lead-names')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value }) =>
                cookieStore.set(name, value)
              )
            } catch {
              // Ignore setAll errors from Server Components
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log('[BACKFILL LEAD NAMES] Starting backfill to raw_metadata')

    // Fetch all AI call records with extracted_info.name
    const { data: aiCallRecords, error: aiError } = await supabaseAdmin
      .from('ai_call_records')
      .select('id, lead_id, extracted_info')
      .not('extracted_info', 'is', null)

    if (aiError) {
      console.error('[BACKFILL LEAD NAMES] Error fetching AI call records:', aiError)
      return NextResponse.json({ error: 'Failed to fetch AI call records' }, { status: 500 })
    }

    console.log('[BACKFILL LEAD NAMES] Found AI call records:', aiCallRecords?.length || 0)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const aiRecord of aiCallRecords || []) {
      const leadId = aiRecord.lead_id
      const extractedInfo = aiRecord.extracted_info

      if (!leadId || !extractedInfo) continue

      // Extract name from various possible fields
      const extractedName =
        extractedInfo?.callerName ||
        extractedInfo?.caller_name ||
        extractedInfo?.name ||
        extractedInfo?.contact_name ||
        extractedInfo?.customer_name

      if (!extractedName) {
        skippedCount++
        continue
      }

      // Check current lead.raw_metadata
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('id, raw_metadata')
        .eq('id', leadId)
        .single()

      if (leadError || !lead) {
        console.error('[BACKFILL LEAD NAMES] Lead not found:', leadId)
        errorCount++
        continue
      }

      // Skip if raw_metadata already has caller_name
      if (lead.raw_metadata?.caller_name && lead.raw_metadata.caller_name !== '') {
        skippedCount++
        continue
      }

      // Merge into raw_metadata without overwriting existing metadata
      const updatedRawMetadata = {
        ...(lead.raw_metadata || {}),
        caller_name: extractedName,
        callerName: extractedName,
        extracted_info: {
          ...(lead.raw_metadata?.extracted_info || {}),
          name: extractedName,
          callerName: extractedName
        }
      }

      // Update lead.raw_metadata
      const { error: updateError } = await supabaseAdmin
        .from('leads')
        .update({
          raw_metadata: updatedRawMetadata
        })
        .eq('id', leadId)

      if (updateError) {
        console.error('[BACKFILL LEAD NAMES] Failed to update lead:', leadId, updateError)
        errorCount++
      } else {
        console.log('[BACKFILL LEAD NAMES] Updated lead raw_metadata:', {
          leadId,
          extractedName
        })
        updatedCount++
      }
    }

    console.log('[BACKFILL LEAD NAMES] Complete:', {
      updatedCount,
      skippedCount,
      errorCount,
      totalProcessed: aiCallRecords?.length || 0
    })

    return NextResponse.json({
      success: true,
      updatedCount,
      skippedCount,
      errorCount,
      totalProcessed: aiCallRecords?.length || 0
    })
  } catch (error) {
    console.error('[BACKFILL LEAD NAMES] Unexpected error:', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
