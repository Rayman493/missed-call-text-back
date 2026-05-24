import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: leadId } = params

    // Pause all pending follow-up jobs for this lead
    const { data: updatedJobs, error: updateError } = await supabase
      .from('follow_up_jobs')
      .update({ 
        status: 'paused',
        paused_at: new Date().toISOString(),
        paused_by: 'user'
      })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .select()

    if (updateError) {
      console.error('Error pausing follow-ups:', updateError)
      return NextResponse.json({ error: 'Failed to pause follow-ups' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: updatedJobs,
      message: `Paused ${updatedJobs.length} follow-ups`
    })
  } catch (error) {
    console.error('Error in pause-all POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
