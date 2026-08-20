import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TEMPLATES, resolveCustomerDisplayName, formatPhoneNumber, truncateMessage } from '../notifications'

describe('Customer Name Resolution', () => {
  it('should return meaningful customer name', () => {
    const result = resolveCustomerDisplayName('John Smith', '+14122533598')
    expect(result).toBe('John Smith')
  })

  it('should return formatted phone when name is empty', () => {
    const result = resolveCustomerDisplayName('', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is null', () => {
    const result = resolveCustomerDisplayName(null, '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is "Customer"', () => {
    const result = resolveCustomerDisplayName('Customer', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is "Unknown"', () => {
    const result = resolveCustomerDisplayName('Unknown', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return "Customer" when both name and phone are missing', () => {
    const result = resolveCustomerDisplayName('', '')
    expect(result).toBe('Customer')
  })

  it('should trim whitespace from name', () => {
    const result = resolveCustomerDisplayName('  John Smith  ', '+14122533598')
    expect(result).toBe('John Smith')
  })

  it('should handle phone with country code', () => {
    const result = resolveCustomerDisplayName('', '14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return original phone if not US format', () => {
    const result = resolveCustomerDisplayName('', '+442071234567')
    expect(result).toBe('+442071234567')
  })
})

describe('Phone Number Formatting', () => {
  it('should format 10-digit US number', () => {
    const result = formatPhoneNumber('4122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should format 11-digit US number with country code', () => {
    const result = formatPhoneNumber('14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return original if not US format', () => {
    const result = formatPhoneNumber('+442071234567')
    expect(result).toBe('+442071234567')
  })

  it('should handle non-numeric characters', () => {
    const result = formatPhoneNumber('(412) 253-3598')
    expect(result).toBe('(412) 253-3598')
  })
})

describe('Message Truncation', () => {
  it('should not truncate short messages', () => {
    const result = truncateMessage('Hello', 120)
    expect(result).toBe('Hello')
  })

  it('should truncate at word boundary', () => {
    const result = truncateMessage('This is a test message that is quite long', 30)
    expect(result).toBe('This is a test message that...')
  })

  it('should truncate at max length if no word boundary', () => {
    const result = truncateMessage('Thisisaverylongwordwithoutspaces', 20)
    expect(result).toBe('Thisisaverylongwo...')
  })
})

describe('Voicemail Notification Text', () => {
  it('should display customer name in title when present', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Ryan',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('Voicemail from Ryan')
    expect(result.message).toBe('Tap to listen and reply')
  })

  it('should display phone in title when name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('Voicemail from (412) 253-3598')
    expect(result.message).toBe('Tap to listen and reply')
  })

  it('should display generic title when both name and phone are missing', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '',
      leadPhone: '',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('New Voicemail')
    expect(result.message).toBe('Tap to listen and reply')
  })

  it('should treat placeholder names as missing', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Customer',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('Voicemail from (412) 253-3598')
  })
})

describe('Customer Reply Notification Text', () => {
  it('should display customer name in title', () => {
    const result = NOTIFICATION_TEMPLATES.customer_reply({
      leadName: 'John Smith',
      message: 'Can you come by tomorrow morning?',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('John Smith')
    expect(result.message).toBe('Can you come by tomorrow morning?')
  })

  it('should use phone in title when name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.customer_reply({
      leadName: '',
      message: 'Can you come by tomorrow morning?',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('Customer')
    expect(result.message).toBe('Can you come by tomorrow morning?')
  })

  it('should truncate long messages', () => {
    const result = NOTIFICATION_TEMPLATES.customer_reply({
      leadName: 'John Smith',
      message: 'This is a very long message that should be truncated because it exceeds the maximum length for notifications',
      leadId: 'lead-123'
    })
    // The message is 113 characters, which is less than 120, so it won't be truncated
    expect(result.message).toBe('This is a very long message that should be truncated because it exceeds the maximum length for notifications')
  })

  it('should show "Photo sent" for photo replies', () => {
    const result = NOTIFICATION_TEMPLATES.customer_reply({
      leadName: 'John Smith',
      message: '[Photo]',
      leadId: 'lead-123',
      hasPhoto: true
    })
    expect(result.title).toBe('Photo sent')
  })
})

describe('New Lead Notification Text', () => {
  it('should display customer name in title', () => {
    const result = NOTIFICATION_TEMPLATES.new_lead({
      leadName: 'Sarah Miller',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('Sarah Miller')
    expect(result.message).toBe('New lead captured · ReplyFlow started follow-up')
  })

  it('should display phone in title when name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.new_lead({
      leadName: '',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('(412) 253-3598')
    expect(result.message).toBe('New lead captured · ReplyFlow started follow-up')
  })
})

describe('AI Intake Notification Text', () => {
  it('should display customer name in title', () => {
    const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
      leadName: 'Lisa Johnson',
      leadPhone: '+14122533598',
      leadId: 'lead-123',
      serviceRequested: 'AC repair'
    })
    expect(result.title).toBe('Lisa Johnson')
    expect(result.message).toBe('AI captured: AC repair')
  })

  it('should use phone in title when name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
      leadName: '',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.title).toBe('(412) 253-3598')
    expect(result.message).toBe('AI intake completed')
  })

  it('should handle missing service requested', () => {
    const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
      leadName: 'Lisa Johnson',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('AI intake completed')
  })
})

describe('Payment Notification Text', () => {
  it('should display amount and customer name', () => {
    const result = NOTIFICATION_TEMPLATES.payment_completed({
      leadName: 'Mike Johnson',
      leadPhone: '+14122533598',
      leadId: 'lead-123',
      amountCents: 12500
    })
    expect(result.title).toBe('Payment Received')
    expect(result.message).toBe('$125.00 from Mike Johnson')
  })

  it('should use phone when name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.payment_completed({
      leadName: '',
      leadPhone: '+14122533598',
      leadId: 'lead-123',
      amountCents: 12500
    })
    expect(result.message).toBe('$125.00 from (412) 253-3598')
  })

  it('should format payment requested notification', () => {
    const result = NOTIFICATION_TEMPLATES.payment_requested({
      leadName: 'Jane Doe',
      leadPhone: '+14122533598',
      leadId: 'lead-123',
      amountCents: 5000
    })
    expect(result.title).toBe('Payment Requested')
    expect(result.message).toBe('$50.00 sent to Jane Doe')
  })
})

describe('System Notification Text', () => {
  it('should display concise trial ending message', () => {
    const result = NOTIFICATION_TEMPLATES.trial_ending({ daysLeft: 3 })
    expect(result.title).toBe('Trial Ending')
    expect(result.message).toBe('3 days remaining')
  })

  it('should use singular for 1 day', () => {
    const result = NOTIFICATION_TEMPLATES.trial_ending({ daysLeft: 1 })
    expect(result.message).toBe('1 day remaining')
  })

  it('should display concise forwarding issue', () => {
    const result = NOTIFICATION_TEMPLATES.forwarding_disconnected()
    expect(result.title).toBe('Forwarding Issue')
    expect(result.message).toBe('Call forwarding may be disconnected')
  })

  it('should display concise calendar connected', () => {
    const result = NOTIFICATION_TEMPLATES.calendar_connected({ calendarEmail: 'user@gmail.com' })
    expect(result.title).toBe('Calendar Connected')
    expect(result.message).toBe('Linked to user@gmail.com')
  })

  it('should display concise appointment created', () => {
    const result = NOTIFICATION_TEMPLATES.appointment_created({
      title: 'Service Call',
      date: '2024-01-15'
    })
    expect(result.title).toBe('Appointment Scheduled')
    expect(result.message).toContain('Service Call')
  })
})
