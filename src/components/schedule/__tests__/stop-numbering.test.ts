// Test for stop numbering semantics
// This tests the helper function extracted from ScheduleMap.tsx
import { describe, test, expect } from 'vitest'

interface MapItem {
  id: string
  type: 'business' | 'job' | 'appointment' | 'task'
  stopNumber?: number
}

function assignStopNumbers(items: MapItem[]): MapItem[] {
  let customerStopIndex = 0
  return items.map(item => {
    if (item.type === 'business') {
      return { ...item, stopNumber: undefined }
    }
    customerStopIndex += 1
    return { ...item, stopNumber: customerStopIndex }
  })
}

describe('assignStopNumbers', () => {
  test('Home Base + one destination → destination Stop 1', () => {
    const items: MapItem[] = [
      { id: 'business-1', type: 'business' },
      { id: 'job-1', type: 'job' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBeUndefined()
    expect(result[1].stopNumber).toBe(1)
  })

  test('Home Base + three destinations → Stops 1/2/3', () => {
    const items: MapItem[] = [
      { id: 'business-1', type: 'business' },
      { id: 'job-1', type: 'job' },
      { id: 'appointment-1', type: 'appointment' },
      { id: 'task-1', type: 'task' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBeUndefined()
    expect(result[1].stopNumber).toBe(1)
    expect(result[2].stopNumber).toBe(2)
    expect(result[3].stopNumber).toBe(3)
  })

  test('Home Base only → no numbered destination', () => {
    const items: MapItem[] = [
      { id: 'business-1', type: 'business' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBeUndefined()
  })

  test('No Home Base → all destinations numbered', () => {
    const items: MapItem[] = [
      { id: 'job-1', type: 'job' },
      { id: 'appointment-1', type: 'appointment' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBe(1)
    expect(result[1].stopNumber).toBe(2)
  })

  test('Multiple destinations without Home Base → sequential numbering', () => {
    const items: MapItem[] = [
      { id: 'job-1', type: 'job' },
      { id: 'job-2', type: 'job' },
      { id: 'appointment-1', type: 'appointment' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBe(1)
    expect(result[1].stopNumber).toBe(2)
    expect(result[2].stopNumber).toBe(3)
  })

  test('Home Base in middle → does not consume stop number', () => {
    const items: MapItem[] = [
      { id: 'job-1', type: 'job' },
      { id: 'business-1', type: 'business' },
      { id: 'job-2', type: 'job' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBe(1)
    expect(result[1].stopNumber).toBeUndefined()
    expect(result[2].stopNumber).toBe(2)
  })

  test('Mixed jobs and appointments → sequential genuine destination numbering', () => {
    const items: MapItem[] = [
      { id: 'business-1', type: 'business' },
      { id: 'job-1', type: 'job' },
      { id: 'appointment-1', type: 'appointment' },
      { id: 'job-2', type: 'job' },
      { id: 'task-1', type: 'task' }
    ]
    const result = assignStopNumbers(items)
    
    expect(result[0].stopNumber).toBeUndefined()
    expect(result[1].stopNumber).toBe(1)
    expect(result[2].stopNumber).toBe(2)
    expect(result[3].stopNumber).toBe(3)
    expect(result[4].stopNumber).toBe(4)
  })
})