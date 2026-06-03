import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string, jobId: string } }
) {
  try {
    console.log('[SEND FOLLOWUP NOW API ENTER]', { leadId: params.id, jobId: params.jobId })
    
    const supabase = createServerSupabaseClient()
    const { id: leadId, jobId } = params

    // Verify the follow-up job belongs to this lead and is pending
    const { data: job, error: jobError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('lead_id', leadId)
      .single()

    if (jobError || !job) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Follow-up not found', jobId, leadId })
      return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })
    }

    if (job.status !== 'pending') {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Follow-up is not pending', status: job.status, jobId })
      return NextResponse.json({ error: 'Follow-up is not pending' }, { status: 400 })
    }

    console.log('[SEND FOLLOWUP NOW JOB FOUND]', { 
      jobId, 
      leadId, 
      businessId: job.business_id,
      conversationId: job.conversation_id 
    })

    // Fetch lead and business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Lead not found', leadId })
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', job.business_id)
      .single()

    if (businessError || !business) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Business not found', businessId: job.business_id })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Check if lead has opted out
    if (lead.opted_out) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Lead has opted out', leadId })
      return NextResponse.json({ error: 'Lead has opted out' }, { status: 400 })
    }

    // Send SMS
    console.log('[SEND FOLLOWUP NOW SMS SEND START]', { 
      jobId, 
      leadId, 
      toPhone: lead.caller_phone 
    })

    const smsOptions: any = { lead_id: lead.id }
    if (job.conversation_id) {
      smsOptions.conversation_id = job.conversation_id
    }

    const messageSid = await sendSms(business, lead.caller_phone, job.message_body, smsOptions)

    if (!messageSid) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'SMS send failed - no message SID returned', jobId })
      return NextResponse.json({ error: 'SMS send failed' }, { status: 500 })
    }

    console.log('[SEND FOLLOWUP NOW SMS SEND SUCCESS]', { jobId, messageSid })

    // Update follow-up job as sent
    const { error: updateError } = await supabase
      .from('follow_up_jobs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null
      })
      .eq('id', jobId)

    if (updateError) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Failed to update follow-up job', updateError })
      return NextResponse.json({ error: 'Failed to update follow-up job' }, { status: 500 })
    }

    console.log('[SEND FOLLOWUP NOW JOB UPDATED]', { jobId })

    return NextResponse.json({ success: true, messageSid })
  } catch (error) {
    console.log('[SEND FOLLOWUP NOW ERROR]', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
