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
    const { status, deleted_at, deleted_by, deletion_reason } = body;

    // Handle restore operation (when deleted_at is explicitly set to null)
    if (deleted_at === null) {
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null
        })
        .eq('id', leadId)
        .eq('business_id', business.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error restoring lead:', updateError);
        return NextResponse.json({ error: 'Failed to restore lead' }, { status: 500 });
      }

      console.log('[LEAD RESTORE] Lead restored successfully:', { leadId, businessId: business.id, userId: user.id });
      return NextResponse.json({ lead: updatedLead });
    }

    // Handle status update
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
      .select('id, business_id, status')
      .eq('id', leadId)
      .eq('business_id', business.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Pause/cancel pending follow-up jobs before soft delete
    const { error: followUpsError } = await supabase
      .from('follow_up_jobs')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        paused_by: 'system',
        cancellation_reason: 'lead_deleted'
      })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    if (followUpsError) {
      console.log('[LEAD DELETE] Failed to pause follow-ups:', followUpsError);
      // Don't fail the request if follow-up pause fails
    }

    // Soft delete the lead by setting deleted_at and deleted_by
    const { error: deleteLeadError } = await supabase
      .from('leads')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deletion_reason: 'user_deleted'
      })
      .eq('id', leadId)
      .eq('business_id', business.id);

    if (deleteLeadError) {
      console.error('Error soft deleting lead:', deleteLeadError);
      return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
    }

    // Log soft deletion
    console.log('[LEAD DELETE] Lead soft deleted successfully:', {
      leadId,
      businessId: business.id,
      userId: user.id,
      previousStatus: lead.status,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
