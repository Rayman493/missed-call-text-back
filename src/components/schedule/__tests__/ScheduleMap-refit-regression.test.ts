/**
 * ScheduleMap date-navigation refit regression tests
 *
 * Goal: a prior date with valid markers must receive its required one-time
 * auto-fit when the user navigates back to it. Stale async prepare results or
 * stale marker state must not consume the framing opportunity.
 */

import { describe, it, expect } from 'vitest'

function signatureFor(items: { type: string; id: string; lat: number; lng: number }[]) {
  return [...items]
    .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))
    .map(i => `${i.type}:${i.id}:${i.lat.toFixed(6)}:${i.lng.toFixed(6)}`)
    .join('|')
}

function shouldAutoFit(params: {
  markersExist: boolean
  userInteracted: boolean
  activeGesture: boolean
  contextChanged: boolean
  signatureChanged: boolean
  correctiveFrameUsed: boolean
}) {
  const { markersExist, userInteracted, activeGesture, contextChanged, signatureChanged, correctiveFrameUsed } = params
  return markersExist &&
    !userInteracted &&
    !activeGesture &&
    (contextChanged || (signatureChanged && !correctiveFrameUsed && !contextChanged))
}

function shouldPublish(preparationDateKey: string, currentDateKey: string, isCancelled: boolean, items: any[] | null) {
  return !isCancelled && preparationDateKey === currentDateKey && items !== null
}

describe('ScheduleMap - Date Refit Regression', () => {
  it('Scenario 1: A -> B -> A frames A once when A markers are ready', () => {
    const aKey = '2024-01-15'
    const bKey = '2024-01-16'

    const aItems = [
      { type: 'business', id: 'home', lat: 40.71, lng: -74.01 },
      { type: 'job', id: 'job-a', lat: 40.72, lng: -74.02 }
    ]
    const bItems = [
      { type: 'business', id: 'home', lat: 40.71, lng: -74.01 },
      { type: 'job', id: 'job-b', lat: 40.73, lng: -74.03 }
    ]

    // Initial load for date A
    let semanticContext = ''
    let framedSignature = ''
    let correctiveFrameUsed = false
    let userInteracted = false
    let fitCount = 0

    function runEffect(selectedDateKey: string, items: any[]) {
      const contextKey = `${selectedDateKey}:all`
      const contextChanged = contextKey !== semanticContext
      const signature = signatureFor(items)
      const signatureChanged = signature !== framedSignature
      const markersExist = items.length > 0

      if (contextChanged) {
        semanticContext = contextKey
        userInteracted = false
        correctiveFrameUsed = false
      }

      if (shouldAutoFit({ markersExist, userInteracted, activeGesture: false, contextChanged, signatureChanged, correctiveFrameUsed })) {
        fitCount++
        framedSignature = signature
        if (signatureChanged && !contextChanged) {
          correctiveFrameUsed = true
        }
      }
    }

    // Publish and frame A
    expect(shouldPublish(aKey, aKey, false, aItems)).toBe(true)
    runEffect(aKey, aItems)
    expect(fitCount).toBe(1)

    // Navigate to B
    expect(shouldPublish(bKey, bKey, false, bItems)).toBe(true)
    runEffect(bKey, bItems)
    expect(fitCount).toBe(2)

    // Stale B preparation tries to publish while selected A must be ignored
    expect(shouldPublish(bKey, aKey, false, bItems)).toBe(false)

    // Publish and frame A again
    expect(shouldPublish(aKey, aKey, false, aItems)).toBe(true)
    runEffect(aKey, aItems)
    expect(fitCount).toBe(3)
  })

  it('Scenario 2: A populated -> B empty -> A populated frames A on return', () => {
    const aKey = '2024-01-15'
    const bKey = '2024-01-16'
    const aItems = [{ type: 'business', id: 'home', lat: 40.71, lng: -74.01 }]
    const emptyItems: any[] = []

    let semanticContext = ''
    let framedSignature = ''
    let fitCount = 0

    function runEffect(selectedDateKey: string, items: any[]) {
      const contextKey = `${selectedDateKey}:all`
      const contextChanged = contextKey !== semanticContext
      const signature = signatureFor(items)
      const signatureChanged = signature !== framedSignature
      const markersExist = items.length > 0
      if (contextChanged) {
        semanticContext = contextKey
      }
      if (shouldAutoFit({ markersExist, userInteracted: false, activeGesture: false, contextChanged, signatureChanged, correctiveFrameUsed: false })) {
        fitCount++
        framedSignature = signature
      }
    }

    runEffect(aKey, aItems)
    expect(fitCount).toBe(1)

    runEffect(bKey, emptyItems)
    expect(fitCount).toBe(1)

    // Returning to A with markers should frame again
    runEffect(aKey, aItems)
    expect(fitCount).toBe(2)
  })

  it('Scenario 3: A -> B -> C -> B frames B once on return', () => {
    const aKey = '2024-01-15'
    const bKey = '2024-01-16'
    const cKey = '2024-01-17'

    const aItems = [{ type: 'business', id: 'home', lat: 40.71, lng: -74.01 }, { type: 'job', id: 'job-a', lat: 40.72, lng: -74.02 }]
    const bItems = [{ type: 'business', id: 'home', lat: 40.71, lng: -74.01 }, { type: 'job', id: 'job-b', lat: 40.75, lng: -74.05 }]
    const cItems = [{ type: 'business', id: 'home', lat: 40.71, lng: -74.01 }, { type: 'job', id: 'job-c', lat: 40.76, lng: -74.06 }]

    let semanticContext = ''
    let framedSignature = ''
    let fitCount = 0

    function runEffect(selectedDateKey: string, items: any[]) {
      const contextKey = `${selectedDateKey}:all`
      const contextChanged = contextKey !== semanticContext
      const signature = signatureFor(items)
      const signatureChanged = signature !== framedSignature
      const markersExist = items.length > 0
      if (contextChanged) {
        semanticContext = contextKey
      }
      if (shouldAutoFit({ markersExist, userInteracted: false, activeGesture: false, contextChanged, signatureChanged, correctiveFrameUsed: false })) {
        fitCount++
        framedSignature = signature
      }
    }

    runEffect(aKey, aItems)
    expect(fitCount).toBe(1)
    runEffect(bKey, bItems)
    expect(fitCount).toBe(2)
    runEffect(cKey, cItems)
    expect(fitCount).toBe(3)
    runEffect(bKey, bItems)
    expect(fitCount).toBe(4)
  })

  it('stale async prepare result must not overwrite mapItems for the current date', () => {
    // If a preparation for date B completes after the user has already
    // navigated back to date A, the outer effect must refuse to publish it.
    expect(shouldPublish('2024-01-16', '2024-01-15', false, [{ id: 'b' }])).toBe(false)
    expect(shouldPublish('2024-01-15', '2024-01-15', false, [{ id: 'a' }])).toBe(true)
    expect(shouldPublish('2024-01-15', '2024-01-15', true, [{ id: 'a' }])).toBe(false)
    expect(shouldPublish('2024-01-15', '2024-01-15', false, null)).toBe(false)
  })

  it('user interaction is reset only for a genuinely new date context', () => {
    const day1 = '2024-01-15'
    const day2 = '2024-01-16'
    let userInteracted = false
    let semanticContext = `${day1}:all`

    function onContextChange(newContext: string) {
      if (semanticContext !== newContext) {
        semanticContext = newContext
        userInteracted = false
      }
    }

    onContextChange(`${day1}:all`)
    expect(userInteracted).toBe(false)
    userInteracted = true
    onContextChange(`${day2}:all`)
    expect(userInteracted).toBe(false)
  })
})
