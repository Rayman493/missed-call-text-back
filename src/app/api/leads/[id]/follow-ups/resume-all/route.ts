import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: leadId } = params

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
