import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const leadId = params.id;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Update lead status (only if it belongs to the user's business)
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .eq('business_id', business.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    return NextResponse.json({ lead: updatedLead });
  } catch (error) {
    console.error('Error in PATCH /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const leadId = params.id;

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .eq('business_id', business.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Delete related records
    const deletedCounts: Record<string, number> = {};

    // Delete messages
    const { error: messagesError, count: messagesCount } = await supabase
      .from('messages')
      .delete()
      .eq('lead_id', leadId);
    if (!messagesError && messagesCount !== null) {
      deletedCounts.messages = messagesCount;
    }

    // Delete message media
    const { error: mediaError, count: mediaCount } = await supabase
      .from('message_media')
      .delete()
      .eq('lead_id', leadId);
    if (!mediaError && mediaCount !== null) {
      deletedCounts.messageMedia = mediaCount;
    }

    // Delete notifications for this lead
    const { error: notificationsError, count: notificationsCount } = await supabase
      .from('notifications')
      .delete()
      .eq('lead_id', leadId);
    if (!notificationsError && notificationsCount !== null) {
      deletedCounts.notifications = notificationsCount;
    }

    // Delete follow-up jobs
    const { error: followUpsError, count: followUpsCount } = await supabase
      .from('follow_up_jobs')
      .delete()
      .eq('lead_id', leadId);
    if (!followUpsError && followUpsCount !== null) {
      deletedCounts.followUpJobs = followUpsCount;
    }

    // Delete AI call records
    const { error: aiCallsError, count: aiCallsCount } = await supabase
      .from('ai_call_records')
      .delete()
      .eq('lead_id', leadId);
    if (!aiCallsError && aiCallsCount !== null) {
      deletedCounts.aiCallRecords = aiCallsCount;
    }

    // Delete voicemail recordings
    const { error: voicemailError, count: voicemailCount } = await supabase
      .from('voicemail_recordings')
      .delete()
      .eq('lead_id', leadId);
    if (!voicemailError && voicemailCount !== null) {
      deletedCounts.voicemailRecordings = voicemailCount;
    }

    // Delete conversations
    const { error: conversationsError, count: conversationsCount } = await supabase
      .from('conversations')
      .delete()
      .eq('lead_id', leadId);
    if (!conversationsError && conversationsCount !== null) {
      deletedCounts.conversations = conversationsCount;
    }

    // Delete the lead
    const { error: deleteLeadError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('business_id', business.id);

    if (deleteLeadError) {
      console.error('Error deleting lead:', deleteLeadError);
      return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
    }

    // Log deletion
    console.log('[LEAD DELETE] Lead deleted successfully:', {
      leadId,
      businessId: business.id,
      userId: user.id,
      deletedCounts,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Lead deleted successfully',
      deletedCounts 
    });
  } catch (error) {
    console.error('Error in DELETE /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
