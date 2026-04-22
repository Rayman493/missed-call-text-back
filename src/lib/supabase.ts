import { createClient } from '@supabase/supabase-js'
import { Business, Lead, Message, CallEvent, LeadWithMessages } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client for browser/anonymous access
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for server-side operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Database helpers
export const db = {
  // Business operations
  async getBusinessByPhone(phone: string): Promise<Business | null> {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
      .single()
    
    if (error) {
      console.error('Error fetching business:', error)
      return null
    }
    
    return data
  },

  async createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert(business)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating business:', error)
      return null
    }
    
    return data
  },

  // Lead operations
  async upsertLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(lead, {
        onConflict: 'business_id,caller_phone'
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error upserting lead:', error)
      return null
    }
    
    return data
  },

  async getLeadsByBusiness(businessId: string): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching leads:', error)
      return []
    }
    
    return data || []
  },

  async getLeadWithMessages(leadId: string): Promise<LeadWithMessages | null> {
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        messages (*),
        business (*)
      `)
      .eq('id', leadId)
      .single()
    
    if (error) {
      console.error('Error fetching lead with messages:', error)
      return null
    }
    
    return data as LeadWithMessages
  },

  // Message operations
  async createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<Message | null> {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert(message)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating message:', error)
      return null
    }
    
    return data
  },

  async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating lead:', error)
      return null
    }
    
    return data
  },

  async createLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(lead)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating lead:', error)
      return null
    }
    
    return data
  },

  async getMessagesByLead(leadId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error fetching messages:', error)
      return []
    }
    
    return data || []
  },

  // Call event operations
  async createCallEvent(callEvent: Omit<CallEvent, 'id' | 'created_at'>): Promise<CallEvent | null> {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .insert(callEvent)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating call event:', error)
      return null
    }
    
    return data
  },

  async getCallEventsByLead(businessId: string, callerPhone: string): Promise<CallEvent[]> {
    const { data, error } = await supabase
      .from('call_events')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching call events:', error)
      return []
    }
    
    return data || []
  },

  // Check for recent auto-reply to prevent duplicates
  async hasRecentAutoReply(businessId: string, callerPhone: string, minutes: number = 15): Promise<boolean> {
    const timeAgo = new Date(Date.now() - minutes * 60 * 1000).toISOString()
    
    // First get the lead by phone number to get lead_id
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .single()
    
    if (leadError || !lead) {
      console.error('Error finding lead for auto-reply check:', leadError)
      return false
    }
    
    // Now check for recent outbound messages from this lead
    const { data: messages, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('direction', 'outbound')
      .gte('created_at', timeAgo)
      .limit(1)
    
    if (messageError) {
      console.error('Error checking recent auto-reply:', messageError)
      return false
    }
    
    return (messages?.length || 0) > 0
  }
}
