import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const navContent = readFileSync('src/components/Navigation.tsx', 'utf8')
const bottomNavContent = readFileSync('src/components/BottomNavigation.tsx', 'utf8')

describe('Navigation Premium Pass — Desktop Active Tab', () => {
  it('desktop active nav uses subtle filled surface (bg-blue-500/10)', () => {
    expect(navContent).toContain('bg-blue-500/10')
  })

  it('desktop active nav uses high-contrast label (text-foreground / dark:text-white)', () => {
    expect(navContent).toContain('text-foreground dark:text-white')
  })

  it('desktop active nav no longer depends on strong outline (no ring-1)', () => {
    expect(navContent).not.toContain('ring-1 ring-blue-500/10')
    expect(navContent).not.toContain('ring-1 ring-white/5')
  })

  it('desktop active nav uses very soft border (not heavy)', () => {
    // Border should be subtle — /10 opacity, not /20 or /25
    expect(navContent).toContain('border border-blue-500/10')
    expect(navContent).not.toContain('border border-blue-500/20')
    expect(navContent).not.toContain('hover:border-blue-500/25')
  })

  it('desktop active nav no longer has underline treatment', () => {
    expect(navContent).not.toContain('-bottom-px')
    expect(navContent).not.toContain('from-blue-400 to-cyan-300')
  })

  it('desktop inactive items remain quiet (no active-state classes)', () => {
    expect(navContent).toContain('text-slate-600 dark:text-slate-300')
    expect(navContent).toContain('hover:bg-slate-100/50 dark:hover:bg-white/5')
  })
})

describe('Navigation Premium Pass — Mobile Light Nav Surface', () => {
  it('mobile light nav uses softer off-white surface (not pure white)', () => {
    expect(bottomNavContent).toContain('bg-slate-50/95')
  })

  it('mobile dark nav surface remains unchanged (dark:bg-card/95)', () => {
    expect(bottomNavContent).toContain('dark:bg-card/95')
  })

  it('mobile light shadow is reduced (shadow-md, not shadow-lg)', () => {
    expect(bottomNavContent).toContain('shadow-md')
    expect(bottomNavContent).not.toMatch(/shadow-lg(?!|\s)/)
  })

  it('mobile dark shadow remains unchanged', () => {
    expect(bottomNavContent).toContain('dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_-20px_70px_rgba(2,6,23,0.62)]')
  })

  it('mobile nav keeps rounded container (rounded-3xl)', () => {
    expect(bottomNavContent).toContain('rounded-3xl')
  })

  it('mobile nav keeps border', () => {
    expect(bottomNavContent).toContain('border border-border')
  })

  it('mobile nav keeps backdrop blur', () => {
    expect(bottomNavContent).toContain('backdrop-blur-xl')
  })
})

describe('Navigation Premium Pass — Mobile Active Item', () => {
  it('mobile active item has restrained rounded background (bg-blue-500/10)', () => {
    expect(bottomNavContent).toContain('bg-blue-500/10')
  })

  it('mobile active item has dark-mode background (dark:bg-blue-500/15)', () => {
    expect(bottomNavContent).toContain('dark:bg-blue-500/15')
  })

  it('mobile active item no longer uses blur glow divs', () => {
    expect(bottomNavContent).not.toContain('blur-[8px]')
    expect(bottomNavContent).not.toContain('blur-[16px]')
  })

  it('mobile active item uses stronger text (text-foreground / dark:text-white)', () => {
    expect(bottomNavContent).toContain('text-foreground dark:text-white')
  })

  it('mobile More button has same restrained active treatment', () => {
    // More button should also use bg-blue-500/10 dark:bg-blue-500/15
    const moreButtonSection = bottomNavContent.substring(
      bottomNavContent.indexOf('ref={moreButtonRef}'),
      bottomNavContent.indexOf('}>More</span>') + 20
    )
    expect(moreButtonSection).toContain('bg-blue-500/10')
    expect(moreButtonSection).toContain('dark:bg-blue-500/15')
    expect(moreButtonSection).not.toContain('blur-[8px]')
  })

  it('mobile inactive items remain neutral', () => {
    expect(bottomNavContent).toContain('text-muted-foreground active:text-foreground')
  })
})

describe('Navigation Premium Pass — Dark Mode Impact', () => {
  it('dark mode desktop active uses subtle filled surface (dark:bg-blue-500/15)', () => {
    expect(navContent).toContain('dark:bg-blue-500/15')
  })

  it('dark mode desktop active uses soft border (dark:border-white/10)', () => {
    expect(navContent).toContain('dark:border-white/10')
  })

  it('dark mode desktop active does NOT use heavy outline', () => {
    expect(navContent).not.toContain('dark:border-blue-400/20')
    expect(navContent).not.toContain('dark:ring-white/5')
  })

  it('dark mode mobile shadow unchanged', () => {
    expect(bottomNavContent).toContain('dark:shadow-[')
  })

  it('dark mode mobile active uses same restrained treatment as light', () => {
    // Same bg-blue-500/15 as desktop dark
    expect(bottomNavContent).toContain('dark:bg-blue-500/15')
  })
})

describe('Navigation Premium Pass — Dimensions & Safe Area Unchanged', () => {
  it('desktop nav height unchanged (py-1.5, text-sm)', () => {
    expect(navContent).toContain('py-1.5')
    expect(navContent).toContain('text-sm')
  })

  it('desktop nav gap unchanged (gap-1)', () => {
    expect(navContent).toContain('gap-1')
  })

  it('mobile nav height unchanged (h-16)', () => {
    expect(bottomNavContent).toContain('h-16')
  })

  it('mobile nav item height unchanged (h-12)', () => {
    expect(bottomNavContent).toContain('h-12')
  })

  it('mobile nav safe area preserved (pb-safe, env(safe-area-inset-bottom))', () => {
    expect(bottomNavContent).toContain('pb-safe')
    expect(bottomNavContent).toContain('env(safe-area-inset-bottom)')
  })

  it('mobile nav remains mobile-only (lg:hidden)', () => {
    expect(bottomNavContent).toContain('lg:hidden')
  })

  it('mobile nav icon size unchanged (w-[22px] h-[22px])', () => {
    expect(bottomNavContent).toContain('w-[22px] h-[22px]')
  })

  it('mobile nav label size unchanged (text-[10px])', () => {
    expect(bottomNavContent).toContain('text-[10px]')
  })

  it('mobile nav placement unchanged (fixed bottom-0)', () => {
    expect(bottomNavContent).toContain('fixed bottom-0 left-0 right-0 z-50')
  })
})
