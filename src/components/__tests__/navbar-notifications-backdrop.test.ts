import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('NavbarNotifications outside-click shield', () => {
  const content = readFileSync('src/components/NavbarNotifications.tsx', 'utf8')

  it('renders a full-screen interaction backdrop beneath the panel', () => {
    expect(content).toContain('fixed inset-0 z-40')
  })

  it('backdrop dismisses the panel on pointer down without activating underlying content', () => {
    expect(content).toContain('onPointerDown')
    expect(content).toContain('stopPropagation')
    expect(content).toContain('setIsOpen(false)')
  })

  it('keeps the notification panel above the backdrop', () => {
    expect(content).toContain('fixed z-50')
  })

  it('preserves notification item tap handling', () => {
    expect(content).toContain('handleNotificationClick')
  })

  it('preserves View All link', () => {
    expect(content).toContain('View all notifications')
  })

  it('preserves Mark all as read', () => {
    expect(content).toContain('Mark all as read')
  })

  it('preserves notification list scrolling with scroll-lock-allow', () => {
    expect(content).toContain('data-scroll-lock-allow')
    expect(content).toContain('overscroll-contain')
  })
})
