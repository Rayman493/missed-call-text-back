import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const scheduleMap = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')

// Extract the marker renderer function
const markerFnStart = scheduleMap.indexOf('const createNumberedMarkerIcon')
const markerFnEnd = scheduleMap.indexOf('// Create marker shape', markerFnStart)
const markerFn = markerFnStart >= 0 ? scheduleMap.substring(markerFnStart, markerFnEnd) : ''

// Extract the mobile render section (from the first md:hidden to the Map Container)
const mobileRenderStart = scheduleMap.indexOf('md:hidden flex items-center justify-center gap-2')
const mobileRenderEnd = scheduleMap.indexOf('{/* Map Container', mobileRenderStart)
const mobileRenderBlock = mobileRenderStart >= 0 ? scheduleMap.substring(mobileRenderStart, mobileRenderEnd) : ''

describe('Schedule Mobile Nav + Map UI Closure', () => {
  describe('Mobile Map control row order', () => {
    it('Date navigation is the first mobile row', () => {
      expect(mobileRenderBlock).toContain('md:hidden flex items-center justify-center gap-2')
      expect(mobileRenderBlock).toContain('onPreviousDay')
      expect(mobileRenderBlock).toContain('onNextDay')
    })

    it('Today button is a separate row (not combined with date nav)', () => {
      expect(mobileRenderBlock).toContain('Mobile: Today button row')
      expect(mobileRenderBlock).toContain('onGoToToday')
    })

    it('Filter (All | Jobs | Appts) is a separate row', () => {
      expect(mobileRenderBlock).toContain('Mobile: Filter row')
      expect(mobileRenderBlock).toContain('handleAllFilterClick')
      expect(mobileRenderBlock).toContain("setMapFilter('jobs')")
      expect(mobileRenderBlock).toContain("setMapFilter('appointments')")
    })

    it('Stop cards are a separate row (not combined with filter)', () => {
      expect(mobileRenderBlock).toContain('Mobile: Stop cards row')
      expect(mobileRenderBlock).toContain('mobile-stop-cards')
    })

    it('row order is Date → Today → Filter → Stops (by source position)', () => {
      const dateIdx = mobileRenderBlock.indexOf('onPreviousDay')
      const todayIdx = mobileRenderBlock.indexOf('Mobile: Today button row')
      const filterIdx = mobileRenderBlock.indexOf('Mobile: Filter row')
      const stopsIdx = mobileRenderBlock.indexOf('Mobile: Stop cards row')
      expect(dateIdx).toBeGreaterThan(-1)
      expect(todayIdx).toBeGreaterThan(dateIdx)
      expect(filterIdx).toBeGreaterThan(todayIdx)
      expect(stopsIdx).toBeGreaterThan(filterIdx)
    })

    it('filter is NOT in the stop-card row', () => {
      const stopsIdx = mobileRenderBlock.indexOf('Mobile: Stop cards row')
      const stopsBlock = mobileRenderBlock.substring(stopsIdx, stopsIdx + 500)
      // The stop cards row should not contain the filter buttons
      expect(stopsBlock).not.toContain('handleAllFilterClick')
    })
  })

  describe('Mobile Map control spacing', () => {
    it('Today row has top margin for breathing room', () => {
      const todayIdx = mobileRenderBlock.indexOf('Mobile: Today button row')
      const todayBlock = mobileRenderBlock.substring(todayIdx - 50, todayIdx + 100)
      expect(todayBlock).toContain('mt-3')
    })

    it('Filter row has top margin for breathing room', () => {
      const filterIdx = mobileRenderBlock.indexOf('Mobile: Filter row')
      const filterBlock = mobileRenderBlock.substring(filterIdx - 50, filterIdx + 100)
      expect(filterBlock).toContain('mt-3')
    })

    it('Stop cards row has top margin', () => {
      const stopsIdx = mobileRenderBlock.indexOf('Mobile: Stop cards row')
      const stopsBlock = mobileRenderBlock.substring(stopsIdx - 50, stopsIdx + 100)
      expect(stopsBlock).toContain('mt-3')
    })

    it('Stop cards row has bottom margin before map', () => {
      const stopsIdx = mobileRenderBlock.indexOf('Mobile: Stop cards row')
      const stopsBlock = mobileRenderBlock.substring(stopsIdx, stopsIdx + 200)
      expect(stopsBlock).toContain('mb-2')
    })
  })

  describe('Dashed appointment ring removed', () => {
    it('marker renderer has no setLineDash', () => {
      expect(markerFn).not.toContain('setLineDash')
    })

    it('marker renderer has no dashed ring comment', () => {
      expect(markerFn).not.toContain('dashed')
    })

    it('appointment type distinction uses subtle inner ring', () => {
      expect(markerFn).toContain('isAppointment')
      expect(markerFn).toContain('rgba(255,255,255,0.45)')
    })

    it('appointment inner ring is thin (0.8 lineWidth)', () => {
      expect(markerFn).toContain('lineWidth = 0.8')
    })
  })

  describe('Per-stop palette preserved', () => {
    it('PREMIUM_STOP_PALETTE exists', () => {
      expect(scheduleMap).toContain('PREMIUM_STOP_PALETTE')
    })

    it('palette colors are deterministic (no random)', () => {
      expect(markerFn).not.toContain('Math.random()')
    })

    it('stop color assignment uses palette modulo', () => {
      expect(markerFn).toContain('PREMIUM_STOP_PALETTE[(stopNumber - 1) % PREMIUM_STOP_PALETTE.length]')
    })

    it('business marker uses green #059669', () => {
      expect(markerFn).toContain('#059669')
    })

    it('palette includes deep blue, teal, violet', () => {
      expect(scheduleMap).toContain('#1E40AF')
      expect(scheduleMap).toContain('#0D9488')
      expect(scheduleMap).toContain('#7C3AED')
    })
  })

  describe('Marker behavior preserved', () => {
    it('selected marker is 42px vs 36px', () => {
      expect(markerFn).toContain('isSelected ? 42 : 36')
    })

    it('selected marker has amber emphasis ring', () => {
      expect(markerFn).toContain('#F59E0B')
    })

    it('white outer ring preserved', () => {
      expect(markerFn).toContain("#FFFFFF")
    })

    it('drop shadow preserved', () => {
      expect(markerFn).toContain('shadowColor')
      expect(markerFn).toContain('shadowBlur')
    })

    it('inner highlight gradient preserved', () => {
      expect(markerFn).toContain('highlightGrad')
      expect(markerFn).toContain('rgba(255,255,255,0.18)')
    })

    it('business marker uses vector home icon', () => {
      expect(markerFn).toContain('moveTo')
      expect(markerFn).toContain('lineTo')
      expect(markerFn).not.toContain('🏠')
    })

    it('99+ handling preserved', () => {
      expect(markerFn).toContain("99+")
    })

    it('marker cache key includes type, stop number, selected, DPR', () => {
      expect(markerFn).toContain('cacheKey')
      expect(markerFn).toContain('stopNumber')
      expect(markerFn).toContain('isSelected')
      expect(markerFn).toContain('dpr')
    })
  })

  describe('Map logic unchanged', () => {
    it('mapFilter state exists', () => {
      expect(scheduleMap).toContain("useState<MapFilter>('all')")
    })

    it('getFilteredMapItems uses mapFilter', () => {
      expect(scheduleMap).toContain('getFilteredMapItems')
    })

    it('fitBounds preserved', () => {
      expect(scheduleMap).toContain('fitBounds')
    })

    it('geocoding preserved', () => {
      expect(scheduleMap).toContain('geocode')
    })

    it('map type toggle preserved (roadmap/satellite)', () => {
      expect(scheduleMap).toContain("'roadmap'")
      expect(scheduleMap).toContain("'satellite'")
    })

    it('local date fix preserved', () => {
      expect(scheduleMap).toContain("toLocaleDateString('en-CA')")
    })

    it('stop card click handler preserved', () => {
      expect(scheduleMap).toContain('handleItemClick')
    })

    it('selected marker focus preserved', () => {
      expect(scheduleMap).toContain('selectedMapItemId')
    })
  })
})
