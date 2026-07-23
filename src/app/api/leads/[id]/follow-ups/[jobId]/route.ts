import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { hasBillingAccess } from '@/lib/manual-access'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, jobId: string }> }
) {
  try {
    console.log('[SEND FOLLOWUP NOW API ENTER]')
    
    const supabase = await createServerSupabaseClient()
    const { id: leadId, jobId } = await params

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[SEND FOLLOWUP NOW ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[SEND FOLLOWUP NOW ERROR] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, caller_phone, opted_out')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Lead not found', leadId })
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.error('[SEND FOLLOWUP NOW ERROR] Lead does not belong to user\'s business', {
        leadId,
        leadBusinessId: lead.business_id,
        userBusinessId: business.id
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

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

    // ATOMIC CLAIM: Update job from pending -> processing
    const { data: claimedJob, error: claimError } = await supabase
      .from('follow_up_jobs')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select()
      .single();

    if (claimError || !claimedJob) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Job already claimed or failed to claim', jobId })
      return NextResponse.json({ error: 'Follow-up is already being processed' }, { status: 409 })
    }

    console.log('[SEND FOLLOWUP NOW JOB FOUND]', { 
      jobId, 
      leadId, 
      businessId: job.business_id,
      conversationId: job.conversation_id 
    })

    // Fetch full business details for SMS sending
    const { data: fullBusiness, error: fullBusinessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', job.business_id)
      .single()

    if (fullBusinessError || !fullBusiness) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Business not found', businessId: job.business_id })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Check if lead has opted out
    if (lead.opted_out) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Lead has opted out', leadId })
      return NextResponse.json({ error: 'Lead has opted out' }, { status: 400 })
    }

    // Check if lead phone is in ignored contacts
    const isIgnored = await isIgnoredContact(fullBusiness.id, lead.caller_phone);
    if (isIgnored) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Lead is in ignored contacts', leadId })
      return NextResponse.json({ error: 'Lead is in ignored contacts' }, { status: 400 })
    }

    // Check if business has active access (subscription or manual access)
    if (!hasBillingAccess(fullBusiness)) {
      console.log('[SEND FOLLOWUP NOW ERROR]', { error: 'Business does not have active access', businessId: fullBusiness.id })
      return NextResponse.json({ error: 'Business does not have active access' }, { status: 403 })
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

    const messageSid = await sendSms(fullBusiness, lead.caller_phone, job.message_body, smsOptions)

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
  { params }: { params: Promise<{ id: string, jobId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: leadId, jobId } = await params
    const body = await request.json()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[FOLLOWUP PATCH ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[FOLLOWUP PATCH ERROR] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[FOLLOWUP PATCH ERROR] Lead not found:', leadError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.error('[FOLLOWUP PATCH ERROR] Lead does not belong to user\'s business', {
        leadId,
        leadBusinessId: lead.business_id,
        userBusinessId: business.id
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

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
  { params }: { params: Promise<{ id: string, jobId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: leadId, jobId } = await params

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[FOLLOWUP DELETE ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[FOLLOWUP DELETE ERROR] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[FOLLOWUP DELETE ERROR] Lead not found:', leadError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.error('[FOLLOWUP DELETE ERROR] Lead does not belong to user\'s business', {
        leadId,
        leadBusinessId: lead.business_id,
        userBusinessId: business.id
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

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
