import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockOpen = vi.fn()

function defineMatchMedia(isCoarse: boolean) {
  Object.defineProperty(global, 'window', {
    value: {
      open: mockOpen,
      matchMedia: (query: string) => ({
        matches: query === '(pointer: coarse)' ? isCoarse : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    },
    writable: true,
  })
}

describe('openExternalLink', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the URL in a new tab with noopener,noreferrer', async () => {
    defineMatchMedia(false)
    const { openExternalLink } = await import('@/lib/external-link')
    openExternalLink('https://calendar.google.com')
    expect(mockOpen).toHaveBeenCalledWith('https://calendar.google.com', '_blank', 'noopener,noreferrer')
  })

  it('does nothing when URL is nullish', async () => {
    defineMatchMedia(false)
    const { openExternalLink } = await import('@/lib/external-link')
    openExternalLink(null)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('blurs the touch target on coarse pointers', async () => {
    defineMatchMedia(true)
    const blur = vi.fn()
    const event = { currentTarget: { blur } as unknown as HTMLElement }
    const { openExternalLink } = await import('@/lib/external-link')
    openExternalLink('https://calendar.google.com', event)
    expect(blur).toHaveBeenCalled()
  })

  it('does not blur on fine pointers', async () => {
    defineMatchMedia(false)
    const blur = vi.fn()
    const event = { currentTarget: { blur } as unknown as HTMLElement }
    const { openExternalLink } = await import('@/lib/external-link')
    openExternalLink('https://calendar.google.com', event)
    expect(blur).not.toHaveBeenCalled()
  })
})
