import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TEMPLATES } from '../notifications-server'

describe('Voicemail Notification Text', () => {
  it('should display customer name when present and meaningful', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Ryan',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Ryan left a voicemail')
  })

  it('should display phone number when customer name is missing', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is null', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: null as any,
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is undefined', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: undefined as any,
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is "Customer"', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Customer',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is "Unknown"', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Unknown',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is "Unknown Customer"', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Unknown Customer',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is "Caller"', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Caller',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display phone number when customer name is whitespace only', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '   ',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer (+14122533598) left a voicemail')
  })

  it('should display "Customer" when both name and phone are missing', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '',
      leadPhone: '',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer left a voicemail')
  })

  it('should display "Customer" when both name and phone are null', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: null as any,
      leadPhone: null as any,
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Customer left a voicemail')
  })

  it('should trim whitespace from customer name', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: '  Ryan  ',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Ryan left a voicemail')
  })

  it('should display customer name with mixed case', () => {
    const result = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Ryan Smith',
      leadPhone: '+14122533598',
      leadId: 'lead-123'
    })
    expect(result.message).toBe('Ryan Smith left a voicemail')
  })
})
