import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string, jobId: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: leadId, jobId } = params
    const body = await request.json()

    // Verify the follow-up job belongs to this lead
    const { data: job, error: jobError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('lead_id', leadId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })
    }

    // Update the follow-up job with lead-specific changes
    const updateData: any = {}
    
    if (body.message !== undefined) {
      updateData.message = body.message
    }
    
    if (body.scheduled_for !== undefined) {
      updateData.scheduled_for = body.scheduled_for
    }
    
    if (body.status !== undefined) {
      updateData.status = body.status
    }
    
    if (body.cancelled_reason !== undefined) {
      updateData.cancelled_reason = body.cancelled_reason
    }

    // Add metadata to track this is a lead-specific change
    updateData.customized_at = new Date().toISOString()
    updateData.customized_by = 'user'

    const { data: updatedJob, error: updateError } = await supabase
      .from('follow_up_jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating follow-up job:', updateError)
      return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 })
    }

    return NextResponse.json({ data: updatedJob })
  } catch (error) {
    console.error('Error in follow-up PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string, jobId: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: leadId, jobId } = params

    // Verify the follow-up job belongs to this lead
    const { data: job, error: jobError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('lead_id', leadId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })
    }

    // Delete the follow-up job
    const { error: deleteError } = await supabase
      .from('follow_up_jobs')
      .delete()
      .eq('id', jobId)

    if (deleteError) {
      console.error('Error deleting follow-up job:', deleteError)
      return NextResponse.json({ error: 'Failed to delete follow-up' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in follow-up DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
