'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'

export interface UnreadConversation {
  leadId: string
  unreadCount: number
  lastMessageFromCustomer: boolean
  needsResponse: boolean
}

export function useUnreadConversations() {
  const { business } = useBusiness()
  const [unreadConversations, setUnreadConversations] = useState<Map<string, UnreadConversation>>(new Map())
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const [needsResponseCount, setNeedsResponseCount] = useState(0)

  const supabase = createBrowserClient()

  // Calculate unread status for a conversation
  const calculateUnreadStatus = (lead: any): UnreadConversation => {
    const messages = lead.messages || []
    const inboundMessages = messages.filter((m: any) => m.direction === 'inbound')
    const outboundMessages = messages.filter((m: any) => m.direction === 'outbound')
    
    // Unread count = inbound messages that haven't been "read" by opening the conversation
    // For now, we'll consider all inbound messages as unread until the conversation is opened
    const unreadCount = inboundMessages.length
    
    // Needs response = last message was from customer and conversation is still active
    const lastMessage = messages.length > 0 
      ? messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : null
    
    const lastMessageFromCustomer = lastMessage?.direction === 'inbound'
    const needsResponse = lastMessageFromCustomer && lead.status !== 'closed' && lead.status !== 'blocked'
    
    return {
      leadId: lead.id,
      unreadCount,
      lastMessageFromCustomer,
      needsResponse
    }
  }

  // Update unread status for all leads
  const updateUnreadStatus = (leads: any[]) => {
    const newUnreadMap = new Map<string, UnreadConversation>()
    let totalUnread = 0
    let needsResponse = 0

    leads.forEach(lead => {
      const unreadStatus = calculateUnreadStatus(lead)
      newUnreadMap.set(lead.id, unreadStatus)
      
      if (unreadStatus.unreadCount > 0) {
        totalUnread += unreadStatus.unreadCount
      }
      
      if (unreadStatus.needsResponse) {
        needsResponse += 1
      }
    })

    setUnreadConversations(newUnreadMap)
    setTotalUnreadCount(totalUnread)
    setNeedsResponseCount(needsResponse)
  }

  // Mark conversation as read
  const markAsRead = (leadId: string) => {
    setUnreadConversations(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(leadId)
      
      if (existing) {
        newMap.set(leadId, {
          ...existing,
          unreadCount: 0
        })
        
        // Update total count
        const totalUnread = Array.from(newMap.values())
          .reduce((sum, conv) => sum + conv.unreadCount, 0)
        setTotalUnreadCount(totalUnread)
      }
      
      return newMap
    })
  }

  // Get unread status for a specific lead
  const getUnreadStatus = (leadId: string): UnreadConversation | undefined => {
    return unreadConversations.get(leadId)
  }

  // Check if conversation needs response
  const needsResponse = (leadId: string): boolean => {
    const status = unreadConversations.get(leadId)
    return status?.needsResponse || false
  }

  // Check if conversation has unread messages
  const hasUnread = (leadId: string): boolean => {
    const status = unreadConversations.get(leadId)
    return (status?.unreadCount || 0) > 0
  }

  return {
    unreadConversations,
    totalUnreadCount,
    needsResponseCount,
    updateUnreadStatus,
    markAsRead,
    getUnreadStatus,
    needsResponse,
    hasUnread
  }
}
