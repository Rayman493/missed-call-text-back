import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const callbackSrc = readFileSync(
  join(process.cwd(), 'src/app/auth/callback/route.ts'),
  'utf8'
)
const authPageSrc = readFileSync(
  join(process.cwd(), 'src/app/auth/page.tsx'),
  'utf8'
)
const removeRouteSrc = readFileSync(
  join(process.cwd(), 'src/app/api/team/members/[id]/route.ts'),
  'utf8'
)
const membersRouteSrc = readFileSync(
  join(process.cwd(), 'src/app/api/team/members/route.ts'),
  'utf8'
)
const teamSectionSrc = readFileSync(
  join(process.cwd(), 'src/components/settings/TeamAccessSection.tsx'),
  'utf8'
)
const teamAccessSrc = readFileSync(
  join(process.cwd(), 'src/lib/team-access.ts'),
  'utf8'
)

describe('team member removal experience', () => {
  it('revocation deletes the membership row (source of truth)', () => {
    expect(removeRouteSrc).toContain(".from('business_memberships')")
    expect(removeRouteSrc).toContain('.delete()')
    expect(removeRouteSrc).toContain('.eq(\'id\', membership.id)')
  })

  it('revocation is owner-only and scoped to the owner business', () => {
    expect(removeRouteSrc).toContain('requireBusinessOwner')
    expect(removeRouteSrc).toContain('membership.business_id !== auth.business.id')
  })

  it('cannot remove the business owner', () => {
    expect(removeRouteSrc).toContain("membership.role === 'owner'")
    expect(removeRouteSrc).toContain('cannot_revoke_owner')
  })

  it('disables the removed member push devices for that business', () => {
    expect(removeRouteSrc).toContain(".from('push_devices')")
    expect(removeRouteSrc).toContain('.eq(\'user_id\', membership.user_id)')
    expect(removeRouteSrc).toContain('.eq(\'business_id\', membership.business_id)')
  })

  it('member list reads authoritative memberships, not a cached copy', () => {
    expect(membersRouteSrc).toContain(".from('business_memberships')")
    expect(teamSectionSrc).toContain("cache: 'no-store'")
  })

  it('access resolution re-reads membership every request', () => {
    expect(teamAccessSrc).toContain('getMembershipForUser')
    expect(teamAccessSrc).toContain('resolveBusinessForUser')
  })

  it('removed invited members get a clear explanation, not silent onboarding', () => {
    expect(callbackSrc).toContain("user.user_metadata?.invited_member === true")
    expect(callbackSrc).toContain('/auth?mode=signin&reason=access_removed')
    expect(authPageSrc).toContain("searchParams?.get('reason') === 'access_removed'")
    expect(authPageSrc).toContain('no longer active')
  })

  it('new users without membership still go to onboarding', () => {
    expect(callbackSrc).toContain("'/onboarding'")
  })

  it('a removed member\'s consumed invite resurfaces labeled removed, not accepted', () => {
    // Accepted invites dedupe against live member phones; after removal the
    // invite re-enters pastInvites. Its chip must say "removed" so the owner
    // does not read it as a still-active member.
    expect(teamSectionSrc).toContain('memberPhones')
    expect(teamSectionSrc).toContain("inv.status === 'accepted' ? 'removed' : inv.status")
  })

  it('list refetch happens after successful removal', () => {
    const removeIdx = teamSectionSrc.indexOf('handleRemoveMember')
    const successIdx = teamSectionSrc.indexOf("setNotice('Member access removed.')", removeIdx)
    const refetchIdx = teamSectionSrc.indexOf('loadTeam()', removeIdx)
    expect(removeIdx).toBeGreaterThan(-1)
    expect(successIdx).toBeGreaterThan(removeIdx)
    expect(refetchIdx).toBeGreaterThan(successIdx)
  })
})
