'use client'

import { useEffect, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeLeads(
  businessId: string | undefined,
  onNewLead: (lead: any) => void,
  onNewMessage: (message: any) => void,
  onLeadUpdate: (lead: any) => void
) {
  const supabase = createBrowserClient()
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    if (!businessId || !supabase) return

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel)
    })
    channelsRef.current = []

    // Subscribe to leads table changes
    const leadsChannel = supabase
      .channel(`leads-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          console.log('[Realtime] New lead:', payload.new)
          onNewLead(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          console.log('[Realtime] Lead updated:', payload.new)
          onLeadUpdate(payload.new)
        }
      )
      .subscribe((status: string) => {
        console.log('[Realtime] Leads channel status:', status)
      })

    // Subscribe to messages table changes
    const messagesChannel = supabase
      .channel(`messages-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload: any) => {
          console.log('[Realtime] New message:', payload.new)
          // Only process messages for this business's leads
          // We'll need to fetch the lead to verify business ownership
          onNewMessage(payload.new)
        }
      )
      .subscribe((status: string) => {
        console.log('[Realtime] Messages channel status:', status)
      })

    channelsRef.current = [leadsChannel, messagesChannel]

    // Cleanup function
    return () => {
      console.log('[Realtime] Cleaning up channels')
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel)
      })
      channelsRef.current = []
    }
  }, [businessId, supabase, onNewLead, onNewMessage, onLeadUpdate])

  return {
    cleanup: () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel)
      })
      channelsRef.current = []
    }
  }
}
