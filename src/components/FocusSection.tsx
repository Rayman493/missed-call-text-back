'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { focusService } from '@/lib/focus/focus-service'
import { FocusContext, FocusItem } from '@/lib/focus/focus-types'
import FocusCard from './FocusCard'
import { Sparkles } from 'lucide-react'

interface FocusSectionProps {
  business: Business | null
  customerId?: string
  view: 'dashboard' | 'customer' | 'schedule' | 'payments' | 'customers' | 'messaging'
  title?: string
  compact?: boolean
}

export default function FocusSection({ business, customerId, view, title, compact = false }: FocusSectionProps) {
  const [focusItems, setFocusItems] = useState<FocusItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchFocusItems = async () => {
      if (!business) return

      try {
        const context: FocusContext = {
          businessId: business.id,
          customerId,
          view,
        }

        const items = await focusService.getFocusItems(context)
        setFocusItems(items)
        
        // Mark items as shown
        for (const item of items) {
          await focusService.markItemShown(item)
        }
      } catch (err) {
        console.error('[FocusSection] Error:', err)
        setError('Failed to load focus items')
      } finally {
        setLoading(false)
      }
    }

    fetchFocusItems()
  }, [business, customerId, view])

  const handleDismiss = async (item: FocusItem) => {
    await focusService.dismissItem(item)
    setFocusItems(prev => prev.filter(i => i.id !== item.id))
  }

  const handleComplete = async (item: FocusItem) => {
    await focusService.markItemCompleted(item)
    // Remove item after 3 seconds
    setTimeout(() => {
      setFocusItems(prev => prev.filter(i => i.id !== item.id))
    }, 3000)
  }

  const sectionTitle = title || (view === 'dashboard' ? 'Today' : 'Focus')

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">{sectionTitle}</h3>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return null
  }

  if (focusItems.length === 0) {
    return null
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">{sectionTitle}</h3>
        </div>
        {focusItems.length > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            {focusItems.length} item{focusItems.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {focusItems.map((item) => (
          <FocusCard
            key={item.id}
            item={item}
            onDismiss={handleDismiss}
            onComplete={handleComplete}
            compact={compact}
          />
        ))}
      </div>
    </div>
  )
}
