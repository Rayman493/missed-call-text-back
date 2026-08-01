import React from 'react'
import { Inbox, Search, Calendar, CreditCard, BarChart3, Users, MessageSquare, FileText, Clock, AlertCircle } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  variant?: 'default' | 'search' | 'calendar' | 'payments' | 'analytics' | 'customers' | 'messages' | 'documents' | 'timeline' | 'warning'
}

const defaultIcons = {
  default: Inbox,
  search: Search,
  calendar: Calendar,
  payments: CreditCard,
  analytics: BarChart3,
  customers: Users,
  messages: MessageSquare,
  documents: FileText,
  timeline: Clock,
  warning: AlertCircle,
}

export default function EmptyState({ 
  icon, 
  title, 
  description, 
  primaryAction, 
  secondaryAction, 
  className = '',
  variant = 'default'
}: EmptyStateProps) {
  const IconComponent = icon ? null : defaultIcons[variant]
  
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-border/50 bg-muted/30 px-6 py-16 text-center ${className}`}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
          {icon}
        </div>
      ) : IconComponent ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
          <IconComponent className="h-6 w-6" strokeWidth={1.5} />
        </div>
      ) : null}
      
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-2">
          {primaryAction && (
            <div className="w-full sm:w-auto">
              {primaryAction}
            </div>
          )}
          {secondaryAction && (
            <div className="w-full sm:w-auto">
              {secondaryAction}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
