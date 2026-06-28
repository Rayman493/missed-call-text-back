import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  console.log('[API LEADS GET] ========== ROUTE ENTERED ==========')
  console.log('[API LEADS GET] Request URL:', request.url)
  console.log('[API LEADS GET] Request method:', request.method)
  console.log('[API LEADS GET] Request headers:', Object.fromEntries(request.headers.entries()))
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    console.log('[API LEADS GET] Auth header present:', !!authHeader)
    console.log('[API LEADS GET] Auth header starts with Bearer:', authHeader?.startsWith('Bearer '))
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[API LEADS GET] 401: Missing or invalid auth header')
      console.log('[API LEADS GET] Returning 401 - Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    console.log('[API LEADS GET] Token length:', token?.length)
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    console.log('[API LEADS GET] Auth error:', authError)
    console.log('[API LEADS GET] User found:', !!user)

    if (authError || !user) {
      console.log('[API LEADS GET] 401: Auth failed')
      console.log('[API LEADS GET] Returning 401 - Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[API LEADS GET] Authenticated user ID:', user.id)

    // Get user's business
    console.log('[API LEADS GET] Looking up business for user:', user.id)
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError) {
      console.log('[API LEADS GET] Business lookup error:', businessError)
      return NextResponse.json({ error: 'Business not found', details: businessError.message }, { status: 404 });
    }

    if (!business) {
      console.log('[API LEADS GET] Business not found for user:', user.id)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    console.log('[API LEADS GET] Business found:', business.id)

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    console.log('[API LEADS GET] Query params - statusFilter:', statusFilter)

    // Fetch leads for this business
    console.log('[API LEADS GET] Fetching leads for business:', business.id)
    
    let query = supabase
      .from('leads')
      .select(`
        id,
        business_id,
        caller_phone,
        name,
        status,
        created_at,
        updated_at,
        first_contact_at,
        last_message_at,
        last_activity_at,
        conversation_id,
        deleted_at,
        deleted_by,
        deletion_reason,
        raw_metadata
      `)
      .eq('business_id', business.id)

    // Apply status filter if provided (note: deleted is handled separately via deleted_at)
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'deleted') {
      // Map frontend status values to database status values
      const statusMap: Record<string, string> = {
        'new': 'new',
        'active': 'active',
        'scheduled': 'scheduled',
        'payment_requested': 'payment_requested',
        'paid': 'paid',
        'completed': 'completed',
        'lost': 'lost',
        'ignored': 'ignored',
      }
      
      const dbStatus = statusMap[statusFilter]
      if (dbStatus) {
        query = query.eq('status', dbStatus)
        console.log('[API LEADS GET] Applied status filter:', dbStatus)
      }
    }

    // For deleted filter, we need to filter by deleted_at IS NOT NULL
    if (statusFilter === 'deleted') {
      query = query.not('deleted_at', 'is', null)
      console.log('[API LEADS GET] Applied deleted filter (deleted_at IS NOT NULL)')
    } else {
      // For all other filters, exclude deleted leads by default
      query = query.is('deleted_at', null)
      console.log('[API LEADS GET] Excluding deleted leads (deleted_at IS NULL)')
    }

    let leads, leadsError
    try {
      const result = await query
        .order('created_at', { ascending: false })
        .limit(100);
      leads = result.data
      leadsError = result.error
    } catch (e) {
      console.log('[API LEADS GET] Exception during leads fetch:', e)
      return NextResponse.json({ error: 'Database error during leads fetch', details: String(e) }, { status: 500 });
    }

    if (leadsError) {
      console.log('[API LEADS GET] Leads fetch error:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads', details: leadsError.message }, { status: 500 });
    }

    console.log('[API LEADS GET] Fetched', leads?.length || 0, 'leads')
    console.log('[API LEADS GET] ========== ROUTE COMPLETE ==========')
    
    return NextResponse.json({ leads: leads || [] });
  } catch (error) {
    console.log('[API LEADS GET] ========== UNHANDLED EXCEPTION ==========')
    console.log('[API LEADS GET] Exception:', error)
    console.log('[API LEADS GET] Exception name:', error instanceof Error ? error.name : 'Unknown')
    console.log('[API LEADS GET] Exception message:', error instanceof Error ? error.message : String(error))
    console.log('[API LEADS GET] Exception stack:', error instanceof Error ? error.stack : 'No stack')
    console.log('[API LEADS GET] Returning 500 - Internal server error')
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('[API LEADS POST] ========== ROUTE ENTERED ==========')
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[API LEADS POST] Missing or invalid auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('[API LEADS POST] Auth failed:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[API LEADS POST] Authenticated user ID:', user.id)

    // Get user's business
    console.log('[API LEADS POST] Looking up business for user:', user.id)
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError) {
      console.log('[API LEADS POST] Business lookup error:', businessError)
      return NextResponse.json({ error: 'Business not found', details: businessError.message }, { status: 404 });
    }

    if (!business) {
      console.log('[API LEADS POST] Business not found for user:', user.id)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    console.log('[API LEADS POST] Business found:', business.id)

    const body = await request.json();
    console.log('[API LEADS POST] Incoming payload:', body)
    
    const { phone, name } = body;

    if (!phone) {
      console.log('[API LEADS POST] ========== 400 RETURN ==========')
      console.log('[API LEADS POST] Missing phone number')
      console.log('[API LEADS POST] Request body:', body)
      console.log('[API LEADS POST] Request URL:', request.url)
      console.log('[API LEADS POST] Returning 400 - Phone number is required')
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalize phone number to E.164 format
    let normalizedPhone = phone.replace(/\D/g, '');
    
    // If no country code and 10 digits, assume US and add +1
    if (normalizedPhone.length === 10) {
      normalizedPhone = '+1' + normalizedPhone;
    } else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
      normalizedPhone = '+' + normalizedPhone;
    } else if (!normalizedPhone.startsWith('+')) {
      // If it has a country code but no +, add it
      normalizedPhone = '+' + normalizedPhone;
    }
    
    console.log('[API LEADS POST] Normalized phone to E.164:', normalizedPhone)

    // Check if lead already exists for this business and caller_phone
    console.log('[API LEADS POST] Looking for existing lead with business_id:', business.id, 'caller_phone:', normalizedPhone)
    let existingLead, leadError
    try {
      const result = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .eq('caller_phone', normalizedPhone)
        .maybeSingle();
      existingLead = result.data
      leadError = result.error
    } catch (e) {
      console.log('[API LEADS POST] Exception during lead lookup:', e)
      return NextResponse.json({ error: 'Database error during lead lookup', details: String(e) }, { status: 500 });
    }

    if (leadError) {
      console.log('[API LEADS POST] Lead lookup error:', leadError)
      return NextResponse.json({ error: 'Database error during lead lookup', details: leadError.message }, { status: 500 });
    }

    console.log('[API LEADS POST] Existing lead lookup result:', existingLead ? 'Found' : 'Not found')

    let lead;
    let conversation;

    if (existingLead) {
      // Use existing lead
      console.log('[API LEADS POST] Using existing lead:', existingLead.id)
      lead = existingLead;

      // Check if conversation exists
      console.log('[API LEADS POST] Looking for conversation for lead:', lead.id)
      let existingConversation, convError
      try {
        const result = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', lead.id)
          .maybeSingle();
        existingConversation = result.data
        convError = result.error
      } catch (e) {
        console.log('[API LEADS POST] Exception during conversation lookup:', e)
        return NextResponse.json({ error: 'Database error during conversation lookup', details: String(e) }, { status: 500 });
      }

      if (convError) {
        console.log('[API LEADS POST] Conversation lookup error:', convError)
        return NextResponse.json({ error: 'Database error during conversation lookup', details: convError.message }, { status: 500 });
      }

      console.log('[API LEADS POST] Existing conversation lookup result:', existingConversation ? 'Found' : 'Not found')

      if (existingConversation) {
        console.log('[API LEADS POST] Using existing conversation:', existingConversation.id)
        conversation = existingConversation;
      } else {
        // Create conversation for existing lead
        const convPayload = {
          lead_id: lead.id,
          business_id: business.id,
          status: 'active',
        }
        console.log('[API LEADS POST] Creating conversation with payload:', convPayload)
        
        let newConversation, createConvError
        try {
          const result = await supabase
            .from('conversations')
            .insert(convPayload)
            .select()
            .single();
          newConversation = result.data
          createConvError = result.error
        } catch (e) {
          console.log('[API LEADS POST] Exception during conversation creation:', e)
          return NextResponse.json({ error: 'Database error during conversation creation', details: String(e) }, { status: 500 });
        }

        if (createConvError) {
          console.log('[API LEADS POST] Conversation creation error:', createConvError)
          return NextResponse.json({ error: 'Failed to create conversation', details: createConvError.message }, { status: 500 });
        }

        console.log('[API LEADS POST] Conversation created:', newConversation.id)
        conversation = newConversation;
      }
    } else {
      // Create new lead
      const leadPayload = {
        business_id: business.id,
        caller_phone: normalizedPhone,
        status: 'new',
        raw_metadata: name ? {
          customerName: name,
          callerName: name,
          source: 'manual_payment_request'
        } : {
          source: 'manual_payment_request'
        }
      }
      console.log('[API LEADS POST] Creating lead with payload:', leadPayload)
      
      let newLead, createError
      try {
        const result = await supabase
          .from('leads')
          .insert(leadPayload)
          .select()
          .single();
        newLead = result.data
        createError = result.error
      } catch (e) {
        console.log('[API LEADS POST] Exception during lead creation:', e)
        return NextResponse.json({ error: 'Database error during lead creation', details: String(e) }, { status: 500 });
      }

      if (createError) {
        console.log('[API LEADS POST] Lead creation error:', createError)
        return NextResponse.json({ error: 'Failed to create lead', details: createError.message }, { status: 500 });
      }

      console.log('[API LEADS POST] Lead created:', newLead.id)
      lead = newLead;

      // Create conversation for new lead
      const convPayload = {
        lead_id: lead.id,
        business_id: business.id,
        status: 'active',
      }
      console.log('[API LEADS POST] Creating conversation with payload:', convPayload)
      
      let newConversation, createConvError
      try {
        const result = await supabase
          .from('conversations')
          .insert(convPayload)
          .select()
          .single();
        newConversation = result.data
        createConvError = result.error
      } catch (e) {
        console.log('[API LEADS POST] Exception during conversation creation:', e)
        return NextResponse.json({ error: 'Database error during conversation creation', details: String(e) }, { status: 500 });
      }

      if (createConvError) {
        console.log('[API LEADS POST] Conversation creation error:', createConvError)
        return NextResponse.json({ error: 'Failed to create conversation', details: createConvError.message }, { status: 500 });
      }

      console.log('[API LEADS POST] Conversation created:', newConversation.id)
      conversation = newConversation;
    }

    console.log('[API LEADS POST] Final response - lead:', lead.id, 'conversation:', conversation.id)
    console.log('[API LEADS POST] ========== ROUTE COMPLETE ==========')
    
    return NextResponse.json({ 
      lead, 
      conversation 
    });
  } catch (error) {
    console.log('[API LEADS POST] Unhandled exception:', error)
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
