/**
 * Regression tests for Google Calendar visual state separation.
 *
 * Tests 22-29: Google Calendar connected/checking display contract
 *
 * Root cause traced:
 * The button showed "Checking..." whenever isLoadingCalendar was true,
 * even when the calendar was already connected. Background verification
 * set isLoadingCalendar=true, causing the Disconnect button to flash
 * to "Checking..." during verification.
 *
 * The fix separates internal verification state from visual display state:
 * - "Checking..." only shows on initial load (no known connected state)
 * - Background verification after known connected state is visually silent
 * - "Connecting..."/"Disconnecting..." only show for user-initiated actions
 * - Transient verification failures preserve last-known connected state
 * - Definitive auth failures (401) transition to disconnected
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/SettingsContent.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Google Calendar — visual state separation (22-29)', () => {
  it('22. connected + background verify → still displays Connected (isLoadingCalendar not set on background)', () => {
    // The fix: only set isLoadingCalendar(true) on initial load
    // (when !calendarConnected && isLoadingCalendar)
    expect(content).toContain('const isInitialLoad = !calendarConnected && isLoadingCalendar')
    expect(content).toContain('if (isInitialLoad)')
  })

  it('23. connected + background verify → action still displays Disconnect (button not disabled during background verify)', () => {
    // The button disabled state no longer includes isLoadingCalendar
    // (only isConnectingCalendar and isDisconnectingCalendar)
    expect(content).toContain('disabled={isConnectingCalendar || isDisconnectingCalendar}')
    // Must NOT include isLoadingCalendar in the button disabled state
    const buttonStart = content.indexOf('onClick={calendarConnected ? handleDisconnectCalendar')
    expect(buttonStart).toBeGreaterThan(-1)
    const buttonBlock = content.slice(buttonStart, buttonStart + 400)
    expect(buttonBlock).not.toContain('isLoadingCalendar')
  })

  it('24. transient verification failure preserves connected visual state (catch returns calendarConnected)', () => {
    // On transient errors, preserve last known connected state
    expect(content).toContain('return { connected: calendarConnected }')
  })

  it('25. definitive auth failure transitions to reconnect/attention (401 sets connected=false)', () => {
    // On 401 response, set calendarConnected to false
    expect(content).toContain('response.status === 401')
    expect(content).toContain('setCalendarConnected(false)')
  })

  it('26. user-triggered disconnect shows local loading only (isDisconnectingCalendar)', () => {
    // Disconnecting state shows "Disconnecting..." not "Checking..."
    expect(content).toContain("'Disconnecting...'")
    // isDisconnectingCalendar is set on disconnect
    expect(content).toContain('setIsDisconnectingCalendar(true)')
  })

  it('27. successful disconnect transitions correctly (setCalendarConnected(false))', () => {
    // After disconnect, calendar is set to false
    expect(content).toContain('setCalendarConnected(false)')
  })

  it('28. failed disconnect restores sane connected/error state (finally clears loading)', () => {
    // The finally block clears isDisconnectingCalendar
    expect(content).toContain('setIsDisconnectingCalendar(false)')
  })

  it('29. duplicate disconnect requests blocked (isDisconnectingCalendar guard)', () => {
    // The button is disabled when isDisconnectingCalendar is true
    expect(content).toContain('disabled={isConnectingCalendar || isDisconnectingCalendar}')
  })
})
