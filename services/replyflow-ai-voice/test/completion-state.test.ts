import { describe, it, expect } from 'vitest'
import {
  resolveNextRequiredStage,
  resolveNextSimpleModeStage,
  IntakeData,
} from '../src/intake-validation'

/**
 * Bug 4 — deterministic completion-state tests.
 * These exercise the field-aware stage resolver, which is the only part of the
 * completion state machine that is safely unit-testable without a live WebSocket.
 */
describe('Completion state resolver (Bug 4)', () => {
  const completeOnsiteIntake: IntakeData = {
    customerName: 'Laura Bennett',
    serviceRequested: 'toilet repair',
    serviceAddress: '123 Main Street in Pittsburgh',
    desiredCompletionTime: 'sometime this week',
    callbackTime: 'tomorrow afternoon',
  }

  it('returns complete when all required fields are satisfied', () => {
    expect(resolveNextRequiredStage(completeOnsiteIntake, 'onsite')).toBe('complete')
    expect(resolveNextSimpleModeStage(completeOnsiteIntake, 'onsite')).toBe('complete')
  })

  it('advances to complete once the final callback time is supplied', () => {
    const intake: IntakeData = {
      customerName: 'Laura Bennett',
      serviceRequested: 'toilet repair',
      serviceAddress: '123 Main Street in Pittsburgh',
      desiredCompletionTime: 'sometime this week',
    }
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('ask_callback_time')
    intake.callbackTime = 'tomorrow afternoon'
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete')
  })

  it('advances directly to complete when later fields are already satisfied through skip-ahead', () => {
    const intake: IntakeData = {
      customerName: 'Laura Bennett',
      serviceRequested: 'toilet repair',
      serviceAddress: '123 Main Street in Pittsburgh',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'tomorrow afternoon',
    }
    // Simulates the caller answering the name/reason with full skip-ahead.
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete')
  })

  it('remains complete after a correction on the final field', () => {
    const intake: IntakeData = {
      customerName: 'Laura Bennett',
      serviceRequested: 'toilet repair',
      serviceAddress: '123 Main Street in Pittsburgh',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'tomorrow afternoon',
    }
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete')
    // Caller corrects callback time during final close.
    intake.callbackTime = 'Friday morning instead'
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete')
  })

  it('does not return complete if any required field is still missing', () => {
    const missingName: IntakeData = { serviceRequested: 'toilet repair', serviceAddress: '123 Main Street in Pittsburgh', desiredCompletionTime: 'sometime this week', callbackTime: 'tomorrow afternoon' }
    expect(resolveNextRequiredStage(missingName, 'onsite')).not.toBe('complete')

    const missingRequest: IntakeData = { customerName: 'Laura Bennett', serviceAddress: '123 Main Street in Pittsburgh', desiredCompletionTime: 'sometime this week', callbackTime: 'tomorrow afternoon' }
    expect(resolveNextRequiredStage(missingRequest, 'onsite')).not.toBe('complete')

    const missingAddress: IntakeData = { customerName: 'Laura Bennett', serviceRequested: 'toilet repair', desiredCompletionTime: 'sometime this week', callbackTime: 'tomorrow afternoon' }
    expect(resolveNextRequiredStage(missingAddress, 'onsite')).not.toBe('complete')

    const missingCompletion: IntakeData = { customerName: 'Laura Bennett', serviceRequested: 'toilet repair', serviceAddress: '123 Main Street in Pittsburgh', callbackTime: 'tomorrow afternoon' }
    expect(resolveNextRequiredStage(missingCompletion, 'onsite')).not.toBe('complete')

    const missingCallback: IntakeData = { customerName: 'Laura Bennett', serviceRequested: 'toilet repair', serviceAddress: '123 Main Street in Pittsburgh', desiredCompletionTime: 'sometime this week' }
    expect(resolveNextRequiredStage(missingCallback, 'onsite')).not.toBe('complete')
  })

  it('accepts explicit refusal flags as satisfying the corresponding requirements', () => {
    const intake: IntakeData = {
      customerName: 'Laura Bennett',
      serviceRequested: 'toilet repair',
      locationRefused: true,
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'tomorrow afternoon',
    }
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete')
  })
})
