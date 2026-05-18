import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { status } = await request.json()

    // Validate status
    const validStatuses = ['new', 'active', 'completed', 'blocked']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: new, active, completed, blocked' },
        { status: 400 }
      )
    }

    // Get auth token
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    // Update lead status
    const { data: lead, error: updateError } = await supabase
      .from('leads')
      .update({ 
        lead_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lead status' },
        { status: 500 }
      )
    }

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true, 
      lead: {
        id: lead.id,
        lead_status: lead.lead_status,
        updated_at: lead.updated_at
      }
    })

  } catch (error) {
    console.error('Lead status update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
