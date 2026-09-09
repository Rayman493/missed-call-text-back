'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeLeads(
  businessId: string | undefined,
  onNewLead: (lead: any) => void,
  onNewMessage: (message: any) => void,
  onLeadUpdate: (lead: any) => void,
  onAICallRecord?: (record: any) => void
) {
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const channelsRef = useRef<RealtimeChannel[]>([])
  const callbacksRef = useRef({ onNewLead, onNewMessage, onLeadUpdate, onAICallRecord })

  // Lazy initialization - only create client once
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserClient()
  }

  const supabase = supabaseRef.current

  // Update callbacks ref without triggering effect re-run
  useEffect(() => {
    callbacksRef.current = { onNewLead, onNewMessage, onLeadUpdate, onAICallRecord }
  }, [onNewLead, onNewMessage, onLeadUpdate, onAICallRecord])

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
          callbacksRef.current.onNewLead(payload.new)
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
          callbacksRef.current.onLeadUpdate(payload.new)
        }
      )
      .subscribe((status: string) => {
        console.log('[Realtime] Leads channel status:', status)
        // Auto-reconnect on disconnect
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('[Realtime] Leads channel disconnected, will reconnect on next effect')
        }
      })

    // Subscribe to messages table changes
    const messagesChannel = supabase
      .channel(`messages-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          console.log('[Realtime] New message:', payload.new)
          callbacksRef.current.onNewMessage(payload.new)
        }
      )
      .subscribe((status: string) => {
        console.log('[Realtime] Messages channel status:', status)
        // Auto-reconnect on disconnect
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('[Realtime] Messages channel disconnected, will reconnect on next effect')
        }
      })

    // Subscribe to ai_call_records table changes for intake completion updates
    const aiCallRecordsChannel = supabase
      .channel(`ai-call-records-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_call_records',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          console.log('[Realtime] New AI call record:', payload.new)
          if (callbacksRef.current.onAICallRecord) {
            callbacksRef.current.onAICallRecord(payload.new)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_call_records',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          console.log('[Realtime] AI call record updated:', payload.new)
          if (callbacksRef.current.onAICallRecord) {
            callbacksRef.current.onAICallRecord(payload.new)
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[Realtime] AI call records channel status:', status)
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('[Realtime] AI call records channel disconnected, will reconnect on next effect')
        }
      })

    channelsRef.current = [leadsChannel, messagesChannel, aiCallRecordsChannel]

    // Cleanup function
    return () => {
      console.log('[Realtime] Cleaning up channels')
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel)
      })
      channelsRef.current = []
    }
  }, [businessId])

  return {
    cleanup: () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel)
      })
      channelsRef.current = []
    }
  }
}
