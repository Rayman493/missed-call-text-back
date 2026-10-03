/**
 * Notification sentence-case consistency tests
 *
 * Presentation-only normalization: notification bodies/previews must render
 * with a leading capital letter in the in-app Notification Center dropdown
 * and in phone push payloads — without mutating stored notification rows or
 * canonical intake data (serviceRequested stays as persisted).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { capitalizeFirstAlpha } from '../utils'
import { validateRequestTitle } from '../ai-intake-formatter'
import { aiIntakeNotificationBody } from '../notification-format'

const navbarSrc = readFileSync(join(__dirname, '../../components/NavbarNotifications.tsx'), 'utf8')
const pushDeliverySrc = readFileSync(join(__dirname, '../push-delivery.ts'), 'utf8')
const createRouteSrc = readFileSync(join(__dirname, '../../app/api/notifications/create/route.ts'), 'utf8')
const notificationsServerSrc = readFileSync(join(__dirname, '../notifications-server.ts'), 'utf8')

describe('capitalizeFirstAlpha — display-only sentence casing', () => {
  it('capitalizes a lowercase request preview', () => {
    expect(capitalizeFirstAlpha('have the grass cut and cleaned up at my property')).toBe(
      'Have the grass cut and cleaned up at my property'
    )
  })

  it('capitalizes a leading lowercase "i"', () => {
    expect(capitalizeFirstAlpha('i need a plumber')).toBe('I need a plumber')
  })

  it('leaves an already-capitalized message unchanged', () => {
    expect(capitalizeFirstAlpha('Need a plumber')).toBe('Need a plumber')
  })

  it('preserves acronyms and intentional casing', () => {
    expect(capitalizeFirstAlpha('HVAC unit stopped working')).toBe('HVAC unit stopped working')
  })

  it('capitalizes the first alphabetic character after leading digits/punctuation', () => {
    expect(capitalizeFirstAlpha('123 main street needs a new fence')).toBe('123 Main street needs a new fence')
  })
})

describe('Notification Center — ai_intake_completed preview', () => {
  it('raw stored serviceRequested validates verbatim (lowercase preserved in data)', () => {
    // validateRequestTitle returns the original string — casing normalization
    // must therefore happen at render, not inside the validator.
    const raw = 'have the grass cut and cleaned up at my property'
    expect(validateRequestTitle(raw)).toBe(raw)
  })

  it('dropdown render path capitalizes validated/regenerated request previews', () => {
    expect(navbarSrc).toContain('return capitalizeFirstAlpha(validated)')
    expect(navbarSrc).toContain('return capitalizeFirstAlpha(regenerated)')
    expect(navbarSrc).toContain('return capitalizeFirstAlpha(canonicalTitle)')
    // Generic fallback for other notification types already capitalizes.
    expect(navbarSrc).toContain('capitalizeFirstAlpha(notification.message)')
  })

  it('stored notification message is already sentence-cased at creation', () => {
    expect(aiIntakeNotificationBody('have the grass cut')).toBe('Have the grass cut')
    expect(aiIntakeNotificationBody('i need a plumber')).toBe('I need a plumber')
    expect(aiIntakeNotificationBody('HVAC unit stopped working')).toBe('HVAC unit stopped working')
  })
})

describe('Push notification payload', () => {
  it('push delivery normalizes the body once for both providers', () => {
    expect(pushDeliverySrc).toContain('const displayBody = capitalizeFirstAlpha(notification.message)')
    // FCM and APNs sends both use the normalized display body.
    const sends = pushDeliverySrc.match(/body:\s*displayBody/g) || []
    expect(sends.length).toBe(2)
    expect(pushDeliverySrc).not.toContain('body: notification.message')
  })
})

describe('Canonical data / persistence untouched', () => {
  it('create route still stores raw serviceRequested in notification data', () => {
    // The data blob keeps the verbatim request — only rendered text is cased.
    expect(createRouteSrc).toMatch(/data\s*=\s*\{[\s\S]*?serviceRequested,[\s\S]*?\}/)
    expect(createRouteSrc).not.toContain('serviceRequested: capitalizeFirstAlpha')
  })

  it('notification insert writes message/data verbatim — no storage mutation', () => {
    const insertIdx = notificationsServerSrc.indexOf('const insertPayload')
    const insertBlock = notificationsServerSrc.slice(insertIdx, insertIdx + 600)
    expect(insertBlock).toContain('message: message || notificationData.message')
    expect(insertBlock).not.toContain('capitalizeFirstAlpha')
  })
})
