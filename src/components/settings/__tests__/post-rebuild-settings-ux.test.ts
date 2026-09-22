import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')
const teamAccess = readFileSync('src/components/settings/TeamAccessSection.tsx', 'utf8')
const booking = readFileSync('src/components/settings/OnlineBookingSection.tsx', 'utf8')
const legalNav = readFileSync('src/components/LegalNavigation.tsx', 'utf8')
const assistant = readFileSync('src/components/ReplyFlowAssistant.tsx', 'utf8')
const globalsCss = readFileSync('src/app/globals.css', 'utf8')
const ignoredContactsRoute = readFileSync('src/app/api/ignored-contacts/[id]/route.ts', 'utf8')
const teamMembersRoute = readFileSync('src/app/api/team/members/route.ts', 'utf8')

const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  return a === -1 || b === -1 ? '' : src.slice(a, b)
}

describe('A — Personal Contacts compact remove + edit-modal delete', () => {
  const listRow = slice(settings, 'ignoredContacts.map((contact)', 'Group: Team Access')
  const editModal = slice(settings, 'title="Edit Personal Contact"', 'Change Password Modal')

  it('list uses a restrained trash icon button, not a filled red text button', () => {
    expect(listRow).toContain('<Trash2 className="w-4 h-4" />')
    expect(listRow).not.toContain('>Remove</button>')
    expect(listRow).not.toContain('bg-red-50 dark:bg-red-900/20 hover:bg-red-100')
  })

  it('trash button is accessible with a minimum tap target', () => {
    const btn = slice(listRow, 'setContactPendingDelete(contact)', '</button>')
    expect(btn).toContain('aria-label="Remove contact"')
    expect(btn).toMatch(/h-11 w-11|min-h-\[44px\] min-w-\[44px\]/)
  })

  it('trash tap opens confirmation instead of deleting immediately', () => {
    // The list button only sets pending state — the DELETE call lives in
    // handleConfirmRemoveContact, reached solely via ConfirmModal onConfirm.
    expect(listRow).toContain('onClick={() => setContactPendingDelete(contact)}')
    expect(listRow).not.toContain('onClick={() => removeIgnoredContact(')
  })

  it('edit modal exposes Remove wired to the same confirmation flow', () => {
    expect(editModal).toContain('setContactPendingDelete(editingContact)')
    expect(editModal).toContain('<Trash2 className="w-4 h-4" />')
  })

  it('shared ConfirmModal is destructive and shows the contact identity', () => {
    const confirm = slice(settings, '{/* Remove Personal Contact confirmation', '{/* Change Password Modal */}')
    expect(confirm).toContain('title="Remove contact?"')
    expect(confirm).toContain('isDestructive')
    expect(confirm).toContain('isLoading={isRemovingContact}')
    expect(confirm).toContain('formatPhoneNumber(contactPendingDelete.phone_number)')
  })

  it('deletion is guarded against duplicate submissions', () => {
    expect(settings).toContain('if (isRemovingContact) return false')
    expect(settings).toContain('const [isRemovingContact, setIsRemovingContact] = useState(false)')
  })

  it('confirmed success closes the confirm — and the edit modal when it was the source', () => {
    const handler = slice(settings, 'const handleConfirmRemoveContact', '// Add ignored contact')
    expect(handler).toContain('setContactPendingDelete(null)')
    expect(handler).toContain('editingContact?.id === contactPendingDelete.id')
    expect(handler).toContain('setEditingContact(null)')
  })

  it('failure keeps the confirmation open for retry (no false success)', () => {
    const handler = slice(settings, 'const handleConfirmRemoveContact', '// Add ignored contact')
    expect(handler).toContain('if (!removed) return')
    // removeIgnoredContact returns false and toasts on failure
    const remove = slice(settings, 'const removeIgnoredContact', 'const handleConfirmRemoveContact')
    expect(remove).toContain("showToast('Couldn\\'t remove contact. Please try again.', 'error')")
    expect(remove).toContain('return false')
  })

  it('phone editing remains read-only — Classification C (routing identity)', () => {
    expect(editModal).toContain('readOnly')
    expect(editModal).toContain('disabled')
    // PATCH only accepts label; phone_number is routing identity.
    expect(ignoredContactsRoute).toContain('routing identity')
    expect(ignoredContactsRoute).toContain('label')
    expect(ignoredContactsRoute).not.toMatch(/phone_number\s*[:=]\s*(body|payload|update)/i)
  })
})

describe('B — Team Access identity handling', () => {
  it('member cards show email AND phone for one verified user_id', () => {
    const memberCard = slice(teamAccess, '(team?.members || []).map((m)', '{/* Pending invites */}')
    expect(memberCard).toContain('m.email && m.phone')
    expect(memberCard).toContain('formatPhoneNumber(m.phone)')
    expect(memberCard).toContain('key={m.membership_id}')
  })

  it('consumed accepted invites are deduped only by verified phone match to a member', () => {
    expect(teamAccess).toContain('memberPhones')
    expect(teamAccess).toContain("i.status === 'accepted'")
    expect(teamAccess).toContain("i.status !== 'pending'")
    // Dedupe is invite-vs-member only — no member-to-member merging
    expect(teamAccess).not.toMatch(/members\.filter\(.*email/i)
  })

  it('API keys members by user_id/membership_id — invites carry no user association', () => {
    expect(teamMembersRoute).toContain('getUserById(m.user_id)')
    expect(teamMembersRoute).toContain('membership_id')
  })

  it('owner protection and member read-only surface preserved', () => {
    expect(teamAccess).toContain("if (role !== 'owner') return null")
    expect(teamAccess).toContain("role === 'member'")
    expect(teamAccess).toContain('confirmRemoveId === m.membership_id')
  })

  it('pending invites stay a distinct section with their own actions', () => {
    const pending = slice(teamAccess, '{/* Pending invites */}', '{/* Recently closed invites')
    expect(pending).toContain('Pending')
    expect(pending).toContain('handleResend(inv.id)')
    expect(pending).toContain('handleCancelInvite(inv.id)')
  })
})

describe('C — pending email change (server-backed cancel on GoTrue v2.197+)', () => {
  const pendingBlock = slice(settings, '{/* Pending Email Confirmation */}', '{/* Status */}')

  it('pending state derives from authoritative user.new_email, not local UI', () => {
    expect(settings).toContain('setPendingNewEmail(((user as any)?.new_email as string | undefined) || null)')
  })

  it('resend uses the authenticated SDK path and keeps an accurate label', () => {
    expect(pendingBlock).toContain('handleResendConfirmation')
    expect(pendingBlock).toContain('Resend Confirmation')
  })

  it('cancel goes through the server route and a confirmation modal — no direct auth-schema write', () => {
    expect(pendingBlock).toContain('setShowCancelEmailConfirm(true)')
    expect(settings).toContain("fetch('/api/account/cancel-email-change'")
    expect(settings).toContain('Cancel email change?')
    expect(settings).not.toMatch(/auth\.users|email_change\s*=\s*null|new_email\s*=\s*null/i)
  })
})

describe('D — blocked-date removal confirmation', () => {
  it('list Remove opens confirmation; delete only runs from onConfirm', () => {
    const li = slice(booking, 'exceptions.map(e =>', '<div className="flex flex-col sm:flex-row sm:items-end')
    expect(li).toContain('onClick={() => setExceptionPendingDelete(e)}')
    expect(li).not.toContain('handleDeleteException(e.id)')
    expect(booking).toContain('onConfirm={() => {')
    expect(booking).toContain('handleDeleteException(exceptionPendingDelete.id)')
  })

  it('confirmation has the required title, range and warning', () => {
    expect(booking).toContain('title="Remove blocked dates?"')
    expect(booking).toContain('These dates will become available for online booking again.')
    expect(booking).toContain('fmtException(exceptionPendingDelete)')
    expect(booking).toContain('isDestructive')
  })

  it('duplicate submissions disabled while pending; failure keeps the range listed', () => {
    expect(booking).toContain('if (deletingException) return')
    expect(booking).toContain('isLoading={deletingException}')
    // On failure: return early before filtering the list
    const del = slice(booking, 'const handleDeleteException', 'if (loading)')
    const failIdx = del.indexOf("Couldn't remove those dates")
    const filterIdx = del.indexOf('setExceptions(prev => prev.filter')
    expect(failIdx).toBeGreaterThan(-1)
    expect(filterIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeLessThan(filterIdx)
  })

  it('success gives visible feedback at the viewport', () => {
    expect(booking).toContain("showToast('Blocked dates removed', 'success')")
    expect(booking).toContain('setExceptionPendingDelete(null)')
  })
})

describe('E — blocked-date picker chevrons', () => {
  it('From/To inputs carry the scoped indicator class', () => {
    const fromTo = slice(booking, '<span className="mb-1 block text-xs text-muted-foreground">From</span>', 'Note (private)')
    expect(fromTo.match(/booking-exception-date/g)?.length).toBe(2)
  })

  it('scoped CSS nudges the indicator inward without affecting other pickers', () => {
    expect(globalsCss).toContain('.booking-exception-date::-webkit-calendar-picker-indicator')
    const rule = slice(globalsCss, '.booking-exception-date::-webkit-calendar-picker-indicator', '}')
    expect(rule).toContain('margin-inline-end')
  })
})

describe('F — legal navigation deterministic active tab', () => {
  it('active state derives from page id, not the parametrized href', () => {
    expect(legalNav).toContain('page.id === activePage')
    expect(legalNav).not.toContain("page.href === `/${activePage}`")
  })

  it('each tab carries a canonical id matching the route prop', () => {
    for (const id of ["'faq'", "'privacy'", "'terms'", "'compliance'"]) {
      expect(legalNav).toContain(`id: ${id} as const`)
    }
  })

  it('active styling + aria-current preserved, horizontal scroll intact', () => {
    expect(legalNav).toContain("aria-current={isActive ? 'page' : undefined}")
    expect(legalNav).toContain('overflow-x-auto')
    expect(legalNav).toContain('bg-white dark:bg-slate-700 text-blue-600')
  })
})

describe('G — Help modal header alignment', () => {
  const header = slice(assistant, '{/* Fixed header */}', '<form onSubmit={handleSearchSubmit}>')

  it('title and X share one centered flex row', () => {
    expect(header).toContain('flex items-center')
    expect(header).not.toContain('absolute right-0 top-0')
  })

  it('X is vertically centered via items-center, balanced by a symmetric spacer', () => {
    expect(header).toContain('<div className="flex items-center">')
    expect(header).toContain('w-8 flex-shrink-0')
    expect(header).toContain('flex h-8 w-8 flex-shrink-0 items-center justify-center')
    expect(header).toContain('aria-label="Close ReplyFlow Assistant"')
  })
})
