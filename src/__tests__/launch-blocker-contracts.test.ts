/**
 * Source-contract regression tests for launch blockers 2 & 4:
 * - calendar_integrations token access restriction migration
 * - Fly service notification action_url targets
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8')

describe('calendar_integrations RLS/token access migration', () => {
  const migration = readSrc('supabase/migrations/20261003010000_secure_calendar_integrations_tokens.sql')

  it('revokes table-level SELECT from authenticated before column re-grant', () => {
    // `authenticated` covers every user JWT — member AND owner cannot retrieve
    // token columns through PostgREST after this migration
    expect(migration).toMatch(/revoke select on public\.calendar_integrations from authenticated/i)
  })

  it('re-grants SELECT on non-token columns only (no access_token/refresh_token in grant list)', () => {
    const grant = migration.match(/grant select \(([\s\S]*?)\) on public\.calendar_integrations to authenticated/i)
    expect(grant).not.toBeNull()
    expect(grant![1]).not.toMatch(/access_token|refresh_token/)
    expect(grant![1]).toMatch(/id[\s,]/i)
    expect(grant![1]).toMatch(/scope/)
  })

  it('grants calendar_email defensively only when the column exists', () => {
    expect(migration).toMatch(/column_name = 'calendar_email'/)
    expect(migration).toMatch(/grant select \(calendar_email\) on public\.calendar_integrations to authenticated/)
  })

  it('restricts write policies to owner role only', () => {
    const ownerChecks = migration.match(/role = 'owner'/g)
    expect(ownerChecks?.length).toBeGreaterThanOrEqual(4) // insert + update using/check + delete
    expect(migration).not.toMatch(/for insert[\s\S]*?business_memberships[\s\S]*?where user_id = auth\.uid\(\)\)/i)
  })

  it('does not expose tokens through any new view or endpoint', () => {
    expect(migration).not.toMatch(/create (or replace )?view/i)
  })
})

describe('calendar routes: user auth before service-role token access', () => {
  const tokenRoutes = [
    'src/app/api/google/calendar/create-event/route.ts',
    'src/app/api/google/calendar/events/route.ts',
    'src/app/api/google/calendar/events/[eventId]/route.ts',
    'src/app/api/jobs/route.ts',
  ]

  for (const rel of tokenRoutes) {
    const src = readSrc(rel)

    it(`${rel}: token-bearing integration access uses supabaseAdmin`, () => {
      expect(src).not.toMatch(/await supabase\s*\n\s*\.from\('calendar_integrations'\)/)
      expect(src).toMatch(/await supabaseAdmin\s*\n\s*\.from\('calendar_integrations'\)/)
    })

    it(`${rel}: authorization precedes the service-role integration lookup`, () => {
      const integrationIdx = src.indexOf("from('calendar_integrations')")
      const authIdx = src.search(/resolveBusinessForUser|requireSubscriptionAccessWithClient|auth\.getUser|getUserRoleForBusiness/)
      expect(integrationIdx).toBeGreaterThan(-1)
      expect(authIdx).toBeGreaterThan(-1)
      expect(authIdx).toBeLessThan(integrationIdx)
    })

    it(`${rel}: service-role integration lookup is scoped to the authorized business`, () => {
      expect(src).toMatch(/from\('calendar_integrations'\)[\s\S]*?\.eq\('business_id', business\.id\)/)
    })
  }

  it('status route selects only non-secret columns via the user client', () => {
    const src = readSrc('src/app/api/google/calendar/status/route.ts')
    const sel = src.match(/\.select\('([^']+)'\)\s*\n?\s*\.eq\('business_id'/)
    expect(sel).not.toBeNull()
    expect(sel![1]).not.toMatch(/access_token|refresh_token|\*/)
    expect(src).not.toMatch(/supabaseAdmin\s*\n\s*\.from\('calendar_integrations'\)/)
  })

  it('disconnect route keeps the owner-scoped authenticated DELETE (owner-only RLS)', () => {
    const src = readSrc('src/app/api/google/calendar/disconnect/route.ts')
    expect(src).toMatch(/access\.role !== 'owner'/)
    expect(src).toMatch(/await supabase\s*\n\s*\.from\('calendar_integrations'\)\s*\n\s*\.delete\(\)/)
    expect(src).not.toContain('supabaseAdmin')
  })

  it('no calendar route returns token fields in its HTTP response', () => {
    const jsonPayloads = (src: string): string[] => {
      const out: string[] = []
      let i = src.indexOf('NextResponse.json(')
      while (i !== -1) {
        let depth = 0, j = i + 'NextResponse.json('.length
        for (; j < src.length; j++) {
          if (src[j] === '(') depth++
          else if (src[j] === ')') { if (depth === 0) break; depth-- }
        }
        out.push(src.slice(i, j))
        i = src.indexOf('NextResponse.json(', j)
      }
      return out
    }
    for (const rel of [...tokenRoutes, 'src/app/api/google/calendar/status/route.ts']) {
      for (const payload of jsonPayloads(readSrc(rel))) {
        expect(payload).not.toMatch(/\(\s*integration\s*[,\)]|\.\.\.integration/)
        expect(payload).not.toMatch(/access_token|refresh_token|accessToken/)
      }
    }
  })

  it('service-role token helper still uses SUPABASE_SERVICE_ROLE_KEY', () => {
    const src = readSrc('src/lib/google/token.ts')
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(src).toMatch(/\.from\('calendar_integrations'\)[\s\S]*?access_token[\s\S]*?refresh_token/)
  })
})

describe('Fly service notification action targets', () => {
  const flySrc = readSrc('services/replyflow-ai-voice/src/index.ts')

  it('no notification action_url targets the nonexistent /leads/ route', () => {
    const deadTargets = flySrc.match(/action_url:\s*[`'"]\/leads\//g)
    expect(deadTargets).toBeNull()
  })

  it('notification action_url values target /dashboard/leads/', () => {
    const targets = flySrc.match(/action_url:\s*`\/dashboard\/leads\//g)
    expect(targets!.length).toBeGreaterThanOrEqual(2)
  })

  it('voicemail-fallback new_lead notification sets a lead detail target when lead id exists', () => {
    const payloadIdx = flySrc.indexOf("type: 'new_lead'")
    expect(payloadIdx).toBeGreaterThan(-1)
    const block = flySrc.slice(payloadIdx, payloadIdx + 900)
    expect(block).toMatch(/action_url:[\s\S]*?`\/dashboard\/leads\/\$\{/)
  })
})
