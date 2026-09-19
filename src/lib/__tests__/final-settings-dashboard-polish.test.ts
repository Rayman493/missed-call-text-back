import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('FINAL SETTINGS + DASHBOARD POLISH', () => {
  describe('Business Hours live preview in Online Booking', () => {
    const section = readSrc('src/components/settings/OnlineBookingSection.tsx')
    const settings = readSrc('src/components/SettingsContent.tsx')

    it('accepts draft business-hours props from the parent Settings form', () => {
      expect(section).toMatch(/businessHoursStart\?: string \| null/)
      expect(section).toMatch(/businessHoursEnd\?: string \| null/)
      expect(section).toMatch(/businessHoursTimezone\?: string \| null/)
      expect(settings).toMatch(/businessHoursStart=\{formBusiness\?\.business_hours_start/)
      expect(settings).toMatch(/businessHoursEnd=\{formBusiness\?\.business_hours_end/)
      expect(settings).toMatch(/businessHoursTimezone=\{formBusiness\?\.business_hours_timezone/)
    })

    it('derives the preview from draft props when available', () => {
      expect(section).toMatch(/previewBusinessHours = useMemo/)
      expect(section).toMatch(/if \(businessHoursStart && businessHoursEnd\)/)
      expect(section).toMatch(/return \{ start: businessHoursStart, end: businessHoursEnd, timezone: businessHoursTimezone \}/)
    })

    it('renders the preview hours/timezone in the use-business-hours label', () => {
      expect(section).toMatch(/previewBusinessHours\?\.start && previewBusinessHours\?\.end/)
      expect(section).toMatch(/Use my business hours \(Mon–Fri/)
      expect(section).toMatch(/formatTime12Hour\(previewBusinessHours\.start\)/)
      expect(section).toMatch(/formatTime12Hour\(previewBusinessHours\.end\)/)
      expect(section).toMatch(/previewBusinessHours\.timezone/)
    })

    it('keeps custom booking-hours mode independent of business-hours edits', () => {
      expect(section).toMatch(/useBusinessHours\s*\?\s*Boolean\(previewBusinessHours\?\.start/)
    })

    it('preserves Save/Discard persistence paths', () => {
      expect(section).toMatch(/const handleSave = useCallback/)
      expect(section).toMatch(/const handleDiscard = useCallback\(\(\) => \{\s*load\(\)\s*\}/)
      expect(section).toMatch(/setBaseline\(currentSnapshot\)/)
    })
  })

  describe('Online Booking deep-link landing', () => {
    const settings = readSrc('src/components/SettingsContent.tsx')

    it('targets the section divider and keeps the card as fallback', () => {
      expect(settings).toMatch(/const element = document\.getElementById\(`\$\{sectionId\}-divider`\) \?\? document\.getElementById\(sectionId\)/)
      expect(settings).toMatch(/id="online-booking-divider"/)
    })

    it('measures the sticky tab container directly to avoid stale default offsets', () => {
      expect(settings).toMatch(/settingsTabsContainerRef\.current\?\.offsetHeight/)
      expect(settings).toMatch(/const offset = \(measuredNavHeight \|\| scrollOffset\) \+ BREATHING_ROOM_GAP/)
    })

    it('uses a safe breathing-room gap so the divider is fully visible', () => {
      expect(settings).toMatch(/const BREATHING_ROOM_GAP = 16/)
    })

    it('keeps bounded drift correction after the initial scroll', () => {
      expect(settings).toMatch(/watchDeepLinkAnchor\(section\)/)
      expect(settings).toMatch(/const watchDeepLinkAnchor = useCallback\(\(sectionId: string\) =>/)
      expect(settings).toMatch(/Math\.abs\(top - deepLinkAnchorTopRef\.current\) > 8/)
      expect(settings).toMatch(/setTimeout\(stopDeepLinkWatch, 2000\)/)
    })
  })

  describe('Dashboard overlay coordination events', () => {
    const events = readSrc('src/lib/dashboard-overlay-events.ts')
    const chartUtils = readSrc('src/lib/chart-utils.tsx')
    const filterBtn = readSrc('src/components/ui/ChartFilterButton.tsx')

    it('exports a shared overlay-open event and helper', () => {
      expect(events).toMatch(/DASHBOARD_OVERLAY_OPEN = 'rf:dashboard-overlay-open'/)
      expect(events).toMatch(/export function openDashboardOverlay\(id: string\)/)
    })

    it('provides a dismissal hook that closes on foreign open and page scroll', () => {
      expect(events).toMatch(/export function useDashboardOverlayDismissal/)
      expect(events).toMatch(/closeOnScroll\s*=\s*true/)
      expect(events).toMatch(/closeOnForeignOpen\s*=\s*true/)
      expect(events).toMatch(/window\.addEventListener\('scroll', handleScroll/)
      expect(events).toMatch(/window\.addEventListener\(DASHBOARD_OVERLAY_OPEN, handleForeignOpen/)
    })

    it('ChartSelectionPopup announces opening and wires the dismissal hook', () => {
      expect(chartUtils).toMatch(/openDashboardOverlay\(id\)/)
      expect(chartUtils).toMatch(/useDashboardOverlayDismissal\(id, onDismiss, \{ popupRef \}/)
    })

    it('ChartFilterButton announces opening and wires the dismissal hook', () => {
      expect(filterBtn).toMatch(/if \(isOpen\) openDashboardOverlay\(id\)/)
      expect(filterBtn).toMatch(/useDashboardOverlayDismissal\(id, \(\) => setIsOpen\(false\), \{ containerRef, popupRef \}/)
    })
  })

  describe('Chart selection popup visual polish', () => {
    const chartUtils = readSrc('src/lib/chart-utils.tsx')

    it('uses a softer premium surface for pinned popups', () => {
      expect(chartUtils).toMatch(/bg-card\/95 backdrop-blur-sm border border-border\/40 rounded-xl shadow-lg/)
      expect(chartUtils).toMatch(/text-\[10px\] font-medium text-muted-foreground mb-1/)
    })

    it('keeps a compact close affordance', () => {
      expect(chartUtils).toMatch(/aria-label="Dismiss selected data"/)
      expect(chartUtils).toMatch(/-mt-1 -mr-1/)
    })
  })

  describe('Chart filter button mobile usability', () => {
    const filterBtn = readSrc('src/components/ui/ChartFilterButton.tsx')

    it('computes viewport-aware max-height and flips placement when needed', () => {
      expect(filterBtn).toMatch(/const \[popupStyle, setPopupStyle\] = useState/)
      expect(filterBtn).toMatch(/availableBelow = window\.innerHeight - rect\.bottom - bottomNavOffset/)
      expect(filterBtn).toMatch(/availableAbove = rect\.top - headerOffset/)
      expect(filterBtn).toMatch(/placement: 'top'/)
      expect(filterBtn).toMatch(/maxHeight: Math\.min\(availableAbove - 16,/)
    })

    it('renders the dropdown as internally scrollable', () => {
      expect(filterBtn).toMatch(/overflow-y-auto overscroll-contain/)
    })
  })

  describe('Graphs clear pinned popups when filters change', () => {
    const graphs = [
      'src/components/analytics/NewCustomersGraph.tsx',
      'src/components/analytics/RevenueGraph.tsx',
      'src/components/analytics/BusinessActivityGraph.tsx',
      'src/components/analytics/LeadConversionGraph.tsx',
      'src/components/analytics/CustomerPipelineGraph.tsx',
      'src/components/analytics/CustomersStatusGraph.tsx',
    ]
    graphs.forEach((path) => {
      const src = readSrc(path)
      it(`${path} clears selection on relevant filter change`, () => {
        expect(src).toMatch(/useEffect\(\(\) => \{\s*setSelectedDatum\(null\)\s*\}, \[[^\]]*(timeRange|seriesFilter|statusFilter|stageFilter)[^\]]*\]\)/s)
      })
    })
  })
})
