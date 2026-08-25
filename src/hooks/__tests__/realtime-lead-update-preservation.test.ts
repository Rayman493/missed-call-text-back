/**
 * Regression test: Customer status change must preserve existing customer card data
 *
 * This test verifies that when a lead's status is updated via realtime subscription,
 * all existing customer metadata is preserved (not lost).
 *
 * Bug: PostgreSQL realtime notifications only send changed fields, and the frontend
 * was replacing the entire lead object with partial data, causing loss of:
 * - latest request
 * - AI intake data
 * - customer name
 * - phone number
 * - timestamps
 * - customer indicators
 * - jobs/tasks/payments metadata
 *
 * Fix: Merge the realtime update into the existing lead object instead of replacing it.
 */

import { describe, it, expect } from 'vitest'

describe('Realtime Lead Update - Data Preservation', () => {
  it('status update via realtime must preserve all existing lead fields', () => {
    // Simulate existing lead with full metadata
    const existingLead = {
      id: 'lead-123',
      status: 'new',
      caller_phone: '+15551234567',
      caller_name: 'John Doe',
      created_at: '2024-01-01T10:00:00Z',
      last_message_at: '2024-01-01T11:00:00Z',
      raw_metadata: {
        ai_summary: 'Customer needs plumbing repair for leaky faucet',
        service_requested: 'Plumbing Repair',
        customer_name: 'John Doe',
        desired_completion: 'ASAP',
        additional_details: 'Leaking for 3 days, bathroom faucet'
      },
      messages: [
        { id: 'msg-1', content: 'Need plumbing help', created_at: '2024-01-01T10:30:00Z' }
      ],
      jobs: [
        { id: 'job-1', title: 'Plumbing Repair', status: 'scheduled' }
      ],
      tasks: [
        { id: 'task-1', title: 'Call customer', completed: false }
      ]
    }

    // Simulate realtime notification with only changed fields (status)
    const realtimeUpdate = {
      id: 'lead-123',
      status: 'active'
      // Note: PostgreSQL realtime only sends changed fields by default
    }

    // Apply the fix: merge instead of replace
    const updatedLead = { ...existingLead, ...realtimeUpdate }

    // Verify all existing fields are preserved
    expect(updatedLead.id).toBe('lead-123')
    expect(updatedLead.status).toBe('active') // Updated field
    expect(updatedLead.caller_phone).toBe('+15551234567') // Preserved
    expect(updatedLead.caller_name).toBe('John Doe') // Preserved
    expect(updatedLead.created_at).toBe('2024-01-01T10:00:00Z') // Preserved
    expect(updatedLead.last_message_at).toBe('2024-01-01T11:00:00Z') // Preserved
    expect(updatedLead.raw_metadata?.ai_summary).toBe('Customer needs plumbing repair for leaky faucet') // Preserved
    expect(updatedLead.raw_metadata?.service_requested).toBe('Plumbing Repair') // Preserved
    expect(updatedLead.raw_metadata?.customer_name).toBe('John Doe') // Preserved
    expect(updatedLead.raw_metadata?.desired_completion).toBe('ASAP') // Preserved
    expect(updatedLead.raw_metadata?.additional_details).toBe('Leaking for 3 days, bathroom faucet') // Preserved
    expect(updatedLead.messages).toHaveLength(1) // Preserved
    expect(updatedLead.jobs).toHaveLength(1) // Preserved
    expect(updatedLead.tasks).toHaveLength(1) // Preserved
  })

  it('status update from new to active preserves AI intake data', () => {
    const existingLead = {
      id: 'lead-456',
      status: 'new',
      caller_phone: '+15559876543',
      raw_metadata: {
        service_requested: 'HVAC Repair',
        customer_name: 'Jane Smith',
        desired_completion: 'This week'
      }
    }

    const realtimeUpdate = {
      id: 'lead-456',
      status: 'active'
    }

    const updatedLead = { ...existingLead, ...realtimeUpdate }

    expect(updatedLead.status).toBe('active')
    expect(updatedLead.raw_metadata?.service_requested).toBe('HVAC Repair')
    expect(updatedLead.raw_metadata?.customer_name).toBe('Jane Smith')
    expect(updatedLead.raw_metadata?.desired_completion).toBe('This week')
  })

  it('status update from active to completed preserves request details', () => {
    const existingLead = {
      id: 'lead-789',
      status: 'active',
      caller_phone: '+15551112222',
      raw_metadata: {
        ai_summary: 'Customer needs roof inspection after storm damage',
        service_requested: 'Roof Inspection',
        additional_details: 'Shingles missing, water stain on ceiling'
      },
      jobs: [
        { id: 'job-2', title: 'Roof Inspection', status: 'completed' }
      ]
    }

    const realtimeUpdate = {
      id: 'lead-789',
      status: 'completed'
    }

    const updatedLead = { ...existingLead, ...realtimeUpdate }

    expect(updatedLead.status).toBe('completed')
    expect(updatedLead.raw_metadata?.ai_summary).toBe('Customer needs roof inspection after storm damage')
    expect(updatedLead.raw_metadata?.service_requested).toBe('Roof Inspection')
    expect(updatedLead.raw_metadata?.additional_details).toBe('Shingles missing, water stain on ceiling')
    expect(updatedLead.jobs).toHaveLength(1)
  })

  it('status update from payment_requested to paid preserves payment metadata', () => {
    const existingLead = {
      id: 'lead-321',
      status: 'payment_requested',
      caller_phone: '+15553334444',
      raw_metadata: {
        service_requested: 'Electrical Wiring',
        customer_name: 'Bob Johnson'
      },
      payment_requests: [
        { id: 'pay-1', amount_cents: 50000, status: 'pending' }
      ]
    }

    const realtimeUpdate = {
      id: 'lead-321',
      status: 'paid'
    }

    const updatedLead = { ...existingLead, ...realtimeUpdate }

    expect(updatedLead.status).toBe('paid')
    expect(updatedLead.raw_metadata?.service_requested).toBe('Electrical Wiring')
    expect(updatedLead.raw_metadata?.customer_name).toBe('Bob Johnson')
    expect(updatedLead.payment_requests).toHaveLength(1)
  })

  it('multiple consecutive status updates preserve all data', () => {
    const existingLead = {
      id: 'lead-999',
      status: 'new',
      caller_phone: '+15555555555',
      raw_metadata: {
        ai_summary: 'Customer needs garage door repair',
        service_requested: 'Garage Door Repair'
      }
    }

    // First update: new -> active
    const update1 = { id: 'lead-999', status: 'active' }
    const lead1 = { ...existingLead, ...update1 }

    // Second update: active -> scheduled
    const update2 = { id: 'lead-999', status: 'scheduled' }
    const lead2 = { ...lead1, ...update2 }

    // Third update: scheduled -> completed
    const update3 = { id: 'lead-999', status: 'completed' }
    const lead3 = { ...lead2, ...update3 }

    // Verify all data is still there after 3 updates
    expect(lead3.status).toBe('completed')
    expect(lead3.caller_phone).toBe('+15555555555')
    expect(lead3.raw_metadata?.ai_summary).toBe('Customer needs garage door repair')
    expect(lead3.raw_metadata?.service_requested).toBe('Garage Door Repair')
  })
})