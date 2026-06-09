import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: leadId } = params

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[RESUME ALL FOLLOW-UPS ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[RESUME ALL FOLLOW-UPS ERROR] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[RESUME ALL FOLLOW-UPS ERROR] Lead not found:', leadError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.error('[RESUME ALL FOLLOW-UPS ERROR] Lead does not belong to user\'s business', {
        leadId,
        leadBusinessId: lead.business_id,
        userBusinessId: business.id
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resume all paused follow-up jobs for this lead
    const { data: updatedJobs, error: updateError } = await supabase
      .from('follow_up_jobs')
      .update({ 
        status: 'pending',
        resumed_at: new Date().toISOString(),
        resumed_by: 'user'
      })
      .eq('lead_id', leadId)
      .eq('status', 'paused')
      .select()

    if (updateError) {
      console.error('Error resuming follow-ups:', updateError)
      return NextResponse.json({ error: 'Failed to resume follow-ups' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: updatedJobs,
      message: `Resumed ${updatedJobs.length} follow-ups`
    })
  } catch (error) {
    console.error('Error in resume-all POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
