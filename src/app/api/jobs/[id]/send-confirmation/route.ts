import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { db, supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Get business using the same method as working send-sms route
    const business = await db.getBusiness(job.business_id)

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify user owns this business
    if (business.user_id !== user.id) {
      console.error('[Job Confirmation] User does not own business:', { 
        userId: user.id, 
        businessId: business.id, 
        businessUserId: business.user_id 
      })
      return NextResponse.json({ error: 'You do not have access to this job' }, { status: 403 })
    }

    // Check if job has customer phone
    if (!job.customer_phone) {
      return NextResponse.json({ 
        error: 'This customer does not have a phone number' 
      }, { status: 400 })
    }

    // Check if business has ReplyFlow number
    if (!business.twilio_phone_number) {
      return NextResponse.json({ 
        error: 'ReplyFlow could not send this appointment confirmation because your ReplyFlow number is not fully configured.' 
      }, { status: 400 })
    }

    // Get lead if job has lead_id, or look up by customer phone
    let lead = null
    if (job.lead_id) {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', job.lead_id)
        .single()

      if (!leadError && leadData) {
        // Verify lead belongs to this business
        if (leadData.business_id !== business.id) {
          return NextResponse.json({ error: 'Lead does not belong to this business' }, { status: 403 })
        }
        lead = leadData
      }
    } else if (job.customer_phone) {
      // Look up lead by customer phone for this business
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .eq('caller_phone', job.customer_phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!leadError && leadData) {
        lead = leadData
      }
    }

    // Get or create conversation if job has conversation_id or lead_id
    let conversation = null
    if (job.conversation_id) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', job.conversation_id)
        .single()
      conversation = convData
    } else if (lead) {
      // Look up conversation by lead_id
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .single()
      conversation = convData
    }

    // Format appointment date/time
    let appointmentDateTime = ''
    if (job.scheduled_date) {
      const date = new Date(job.scheduled_date + 'T00:00:00')
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      if (job.scheduled_time) {
        const [h, m] = job.scheduled_time.split(':').map(Number)
        const ampm = h >= 12 ? 'PM' : 'AM'
        const hour = h % 12 || 12
        const formattedTime = `${hour}:${String(m).padStart(2, '0')} ${ampm}`
        appointmentDateTime = `${formattedDate} at ${formattedTime}`
      } else {
        appointmentDateTime = formattedDate
      }
    }

    // Build confirmation message
    const customerName = job.customer_name || lead?.name || ''
    const serviceName = job.title || ''
    
    let message = ''
    if (customerName && serviceName) {
      message = `Hi ${customerName}, your ${serviceName} appointment with ${business.name} is scheduled for ${appointmentDateTime}. Reply if you need to reschedule or have any questions.`
    } else if (customerName) {
      message = `Hi ${customerName}, your appointment with ${business.name} is scheduled for ${appointmentDateTime}. Reply if you need to reschedule or have any questions.`
    } else if (serviceName) {
      message = `Hi, your ${serviceName} appointment with ${business.name} is scheduled for ${appointmentDateTime}. Reply if you need to reschedule or have any questions.`
    } else {
      message = `Hi, your appointment with ${business.name} is scheduled for ${appointmentDateTime}. Reply if you need to reschedule or have any questions.`
    }

    // Sanitize message
    const sanitizedMessage = sanitizeMessageContent(message)
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Invalid message content' }, { status: 400 })
    }

    // Send SMS
    const result = await sendSms(business, job.customer_phone, sanitizedMessage, {
      lead_id: lead?.id || null,
      conversation_id: conversation?.id || null,
      isManual: true,
      skipBusinessAvailabilityAppend: true, // Don't append Out of Office/After Hours notes to appointment confirmations
    })

    if (!result?.sid) {
      console.error('[Job Confirmation] SMS send failed')
      return NextResponse.json({ 
        error: 'ReplyFlow could not send the confirmation text. Please try again.' 
      }, { status: 500 })
    }

    // Update job with confirmation tracking
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        confirmation_sms_sent_at: new Date().toISOString(),
        confirmation_sms_message_sid: result.sid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    if (updateError) {
      console.error('[Job Confirmation] Failed to update job:', updateError)
      // Don't fail the request - SMS was sent successfully
    }

    // Update conversation activity if exists
    if (conversation) {
      await supabase
        .from('conversations')
        .update({
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', conversation.id)
    }

    console.log('[Job Confirmation] Confirmation SMS sent:', {
      jobId: job.id,
      messageSid: result.sid,
      customerPhone: job.customer_phone,
      businessId: business.id,
    })

    return NextResponse.json({
      success: true,
      message: 'Confirmation text sent successfully',
      job: {
        ...job,
        confirmation_sms_sent_at: new Date().toISOString(),
        confirmation_sms_message_sid: result.sid,
      },
      messageSid: result.sid,
    })

  } catch (error) {
    console.error('[Job Confirmation] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
