'use client'

import React from 'react'
import { User, Mail, Phone, MapPin, Clock, MessageSquare, FileText } from 'lucide-react'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { formatPhoneNumber } from '@/lib/utils'

interface CustomerDetailsProps {
  leadData: any
  lead: any
}

export default function CustomerDetails({ leadData, lead }: CustomerDetailsProps) {
  const intake = getLeadAIIntake(leadData || {})

  const customerName = leadData?.name || leadData?.contact_name || intake.customerName || ''
  const reasonForCalling = intake.serviceRequested || ''
  const details = intake.additionalDetails || ''
  const location = intake.serviceAddress || ''
  const desiredCompletionTime = intake.desiredCompletion || ''
  const preferredCallbackTime = intake.callbackTime || ''
  const phoneNumber = leadData?.caller_phone || lead?.caller_phone || intake.customerPhone || ''
  const email = leadData?.email || ''

  const renderField = (label: string, value: string, icon?: React.ReactNode) => {
    const hasValue = Boolean(value && value.trim())
    return (
      <div className="rounded-lg border border-border/25 bg-background/25 px-4 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</span>
        </div>
        {hasValue ? (
          <p className="text-sm font-medium leading-relaxed text-foreground pl-6 break-words">
            {value}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic pl-6">
            No information yet
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Customer Name */}
      {renderField('Customer Name', customerName, <User className="w-4 h-4 text-muted-foreground" />)}

      {/* Reason for Calling */}
      {renderField('Reason for Calling', reasonForCalling, <MessageSquare className="w-4 h-4 text-muted-foreground" />)}

      {/* Details */}
      {renderField('Details', details, <FileText className="w-4 h-4 text-muted-foreground" />)}

      {/* Location */}
      {renderField('Location', location, <MapPin className="w-4 h-4 text-muted-foreground" />)}

      {/* Desired Completion Time */}
      {renderField('Desired Completion Time', desiredCompletionTime, <Clock className="w-4 h-4 text-muted-foreground" />)}

      {/* Preferred Callback Time */}
      {renderField('Preferred Callback Time', preferredCallbackTime, <Clock className="w-4 h-4 text-muted-foreground" />)}

      {/* Phone Number */}
      {renderField('Phone Number', formatPhoneNumber(phoneNumber), <Phone className="w-4 h-4 text-muted-foreground" />)}

      {/* Email */}
      {renderField('Email', email, <Mail className="w-4 h-4 text-muted-foreground" />)}
    </div>
  )
}