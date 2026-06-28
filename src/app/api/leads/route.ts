import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { phone, name } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');

    // Check if lead already exists for this business and phone
    const { data: existingLead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('phone', normalizedPhone)
      .maybeSingle();

    let lead;
    let conversation;

    if (existingLead) {
      // Use existing lead
      lead = existingLead;

      // Check if conversation exists
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .maybeSingle();

      if (existingConversation) {
        conversation = existingConversation;
      } else {
        // Create conversation for existing lead
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            lead_id: lead.id,
            business_id: business.id,
            status: 'active',
          })
          .select()
          .single();

        if (convError) {
          console.error('Error creating conversation:', convError);
          return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
        }

        conversation = newConversation;
      }
    } else {
      // Create new lead
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          business_id: business.id,
          phone: normalizedPhone,
          name: name || null,
          source: 'manual',
          status: 'new',
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating lead:', createError);
        return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
      }

      lead = newLead;

      // Create conversation for new lead
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          lead_id: lead.id,
          business_id: business.id,
          status: 'active',
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      conversation = newConversation;
    }

    return NextResponse.json({ 
      lead, 
      conversation 
    });
  } catch (error) {
    console.error('Error in POST /api/leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
