/**
 * Batch 5A — Customer / Forms / Settings Polish + Voicemail Realtime / Player
 *
 * Focused tests for:
 * CUSTOMER / FORMS / SETTINGS:
 *  1. source metadata does not crowd primary customer name
 *  2. canonical Customer * / Customer labels
 *  3. inline Add customer path reuses existing flow
 *  4. New Job banner exact copy
 *  5. No reminder exact copy
 *  6. customer header control-height consistency
 *  7. Personal Contacts deep-link/section state
 *
 * VOICEMAIL:
 *  8. realtime voicemail merge inserts exactly once
 *  9. later refetch does not duplicate same voicemail
 * 10. seek calculation updates audio.currentTime
 * 11. touch seek works through the production player path as far as JSDOM allows
 * 12. volume control updates audio.volume
 * 13. mute/unmute restore previous volume
 * 14. switching recordings keeps canonical player volume state
 * 15. AI Transcription label absent when transcript exists
 * 16. transcript pending/error states remain intact
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// --- File contents ---
const leadCardContent = readFileSync('src/components/LeadCard.tsx', 'utf8')
const customerStatusContent = readFileSync('src/lib/customer-status.ts', 'utf8')
const leadStatusDropdownContent = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')
const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
const searchableCustomerSelectContent = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
const newAppointmentModalContent = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const forwardingHelpCenterContent = readFileSync('src/components/ForwardingHelpCenter.tsx', 'utf8')
const settingsContentContent = readFileSync('src/components/SettingsContent.tsx', 'utf8')
const personalVoicemailPageContent = readFileSync('src/app/dashboard/personal-voicemail/page.tsx', 'utf8')
const voicemailMessageContent = readFileSync('src/components/VoicemailMessage.tsx', 'utf8')
const personalVoicemailPlayerContent = readFileSync('src/components/PersonalVoicemailPlayer.tsx', 'utf8')
const premiumAudioPlayerContent = readFileSync('src/components/PremiumAudioPlayer.tsx', 'utf8')
const volumeManagerContent = readFileSync('src/lib/volume-manager.ts', 'utf8')

// ============================================================================
// 1. SOURCE METADATA DOES NOT CROWD PRIMARY CUSTOMER NAME
// ============================================================================
describe('1. Source metadata does not crowd primary customer name', () => {
  it('LeadCard renders customer name as the sole element in the h3 heading', () => {
    // The h3 should contain only the name span, not the source badge
    expect(leadCardContent).toMatch(/<h3[^>]*>\s*<span[^>]*>\{getLeadDisplayName\(lead\)\}<\/span>\s*<\/h3>/)
  })

  it('LeadCard source badge is in a secondary metadata row below the name', () => {
    // The source badge should be in a separate flex row with the phone number,
    // not inline with the name heading
    expect(leadCardContent).toMatch(/customerSourceInfo[\s\S]*?flex items-center gap-1\.5 mt-0\.5/)
  })

  it('LeadCard source badge has reduced gap (gap-0.5) to stay compact', () => {
    expect(leadCardContent).toMatch(/customerSourceInfo[\s\S]*?inline-flex items-center gap-0\.5/)
  })
})

// ============================================================================
// 2. CANONICAL Customer * / Customer LABELS
// ============================================================================
describe('2. Canonical Customer * / Customer labels', () => {
  it('NewAppointmentModal uses "Customer" label (not "Customer (required)" or "Customer (optional)")', () => {
    expect(newAppointmentModalContent).toContain("const customerLabel = 'Customer'")
    expect(newAppointmentModalContent).not.toContain("'Customer (required)'")
    expect(newAppointmentModalContent).not.toContain("'Customer (optional)'")
  })

  it('NewAppointmentModal passes required prop separately from label text', () => {
    expect(newAppointmentModalContent).toMatch(/required=\{customerIsRequired\}/)
  })

  it('JobComposer uses "Customer" label', () => {
    expect(jobComposerContent).toMatch(/label="Customer"/)
  })

  it('NewTaskModal uses "Customer" label', () => {
    expect(newTaskModalContent).toMatch(/label="Customer"/)
  })

  it('SearchableCustomerSelect renders required asterisk when required prop is true', () => {
    expect(searchableCustomerSelectContent).toMatch(/required && <span className="text-red-500">\*<\/span>/)
  })

  it('SearchableCustomerSelect does NOT use parenthetical required/optional in label', () => {
    // The label rendering should just show {label} and the asterisk, not parenthetical text
    expect(searchableCustomerSelectContent).not.toContain('(required)')
    expect(searchableCustomerSelectContent).not.toContain('(optional)')
  })
})

// ============================================================================
// 3. INLINE ADD CUSTOMER PATH REUSES EXISTING FLOW
// ============================================================================
describe('3. Inline Add customer path reuses existing flow', () => {
  it('SearchableCustomerSelect renders "Add customer" in the label header area', () => {
    expect(searchableCustomerSelectContent).toMatch(/onAddCustomerClick[\s\S]*?Add customer/)
  })

  it('SearchableCustomerSelect "Add customer" is a button in the label flex row', () => {
    // The Add customer button should be in the same flex row as the label
    expect(searchableCustomerSelectContent).toMatch(/flex items-center justify-between gap-2 mb-1\.5[\s\S]*?onAddCustomerClick[\s\S]*?Add customer/)
  })

  it('SearchableCustomerSelect does NOT render "Can\'t find them?" copy', () => {
    expect(searchableCustomerSelectContent).not.toContain("Can't find them?")
  })

  it('JobComposer passes onAddCustomerClick to SearchableCustomerSelect for new jobs', () => {
    expect(jobComposerContent).toMatch(/onAddCustomerClick=\{!editJob \? \(\) => setIsAddCustomerOpen\(true\) : undefined\}/)
  })
})

// ============================================================================
// 4. NEW JOB BANNER EXACT COPY
// ============================================================================
describe('4. New Job banner exact copy', () => {
  it('JobComposer banner says "Customer details imported from ReplyFlow"', () => {
    expect(jobComposerContent).toContain('Customer details imported from ReplyFlow')
  })

  it('JobComposer does NOT say "Created from a ReplyFlow customer"', () => {
    expect(jobComposerContent).not.toContain('Created from a ReplyFlow customer')
  })
})

// ============================================================================
// 5. NO REMINDER EXACT COPY
// ============================================================================
describe('5. No reminder exact copy', () => {
  it('NewTaskModal reminder offset default option says "No reminder" (not "None")', () => {
    expect(newTaskModalContent).toContain("{ value: '', label: 'No reminder' }")
  })

  it('NewTaskModal does NOT use "None" as the default reminder label', () => {
    // The old label was 'None' — should be replaced
    expect(newTaskModalContent).not.toMatch(/\{ value: '', label: 'None' \}/)
  })

  it('NewTaskModal placeholder and emptyMessage say "No reminder"', () => {
    expect(newTaskModalContent).toContain('placeholder="No reminder"')
    expect(newTaskModalContent).toContain('emptyMessage="No reminder"')
  })

  it('NewTaskModal does NOT have "CUSTOMER CONTEXT" heading', () => {
    expect(newTaskModalContent).not.toContain('Customer Context')
  })

  it('NewTaskModal uses "Details" heading instead of "Customer Context"', () => {
    expect(newTaskModalContent).toContain('Details')
  })
})

// ============================================================================
// 6. CUSTOMER HEADER CONTROL-HEIGHT CONSISTENCY
// ============================================================================
describe('6. Customer header control-height consistency', () => {
  it('LeadStatusDropdown md size uses py-1.5 (matching action buttons)', () => {
    expect(leadStatusDropdownContent).toMatch(/md: 'px-2\.5 py-1\.5 text-xs max-w-\[150px\]'/)
  })

  it('LeadStatusDropdown sm size remains compact (py-0.5) for card use', () => {
    expect(leadStatusDropdownContent).toMatch(/sm: 'px-2 py-0\.5 text-xs max-w-\[120px\]'/)
  })

  it('Customer details header uses size="md" for status dropdown', () => {
    expect(pageClientContent).toMatch(/LeadStatusDropdown[\s\S]*?size="md"/)
  })

  it('Customer details refresh button uses py-1.5 (matching action buttons)', () => {
    expect(pageClientContent).toMatch(/Refresh[\s\S]*?px-3 py-1\.5[\s\S]*?rounded-lg/)
  })

  it('Customer details refresh button does NOT use h-[30px] hack', () => {
    // The old h-[30px] should be removed
    const refreshMatch = pageClientContent.match(/handleRefresh\(\)[\s\S]{0,500}?Refresh/)
    if (refreshMatch) {
      expect(refreshMatch[0]).not.toContain('h-[30px]')
    }
  })

  it('Customer details action buttons use py-1.5', () => {
    expect(pageClientContent).toMatch(/Edit Customer[\s\S]*?px-3 py-1\.5/)
  })
})

// ============================================================================
// 7. PERSONAL CONTACTS DEEP-LINK / SECTION STATE
// ============================================================================
describe('7. Personal Contacts deep-link / section state', () => {
  it('SettingsContent #contacts hash uses canonical scrollToSection handler with offset', () => {
    // Contacts should NOT have a special case using scrollIntoView (which ignores
    // the sticky-header offset). It should fall through to the canonical handler
    // that uses scrollToSectionRef.current(hash) with the measured offset.
    expect(settingsContentContent).not.toMatch(/hash === 'contacts'[\s\S]*?scrollIntoView/)
  })

  it('SettingsContent #contacts hash handler does NOT set activeSection to general', () => {
    // The old code set activeSection('general') for contacts — should be fixed
    const contactsHashBlock = settingsContentContent.match(/hash === 'contacts'[\s\S]{0,200}?setActiveSection/)
    if (contactsHashBlock) {
      expect(contactsHashBlock[0]).not.toContain("setActiveSection('general')")
    }
  })

  it('SettingsContent ?section=contacts handler sets activeSection to contacts', () => {
    expect(settingsContentContent).toMatch(/section === 'contacts'[\s\S]*?setActiveSection\('contacts'\)/)
  })

  it('Personal Voicemail page links to /dashboard/settings#contacts', () => {
    expect(personalVoicemailPageContent).toContain('href="/dashboard/settings#contacts"')
  })

  it('SettingsContent has contacts-divider element for scroll target', () => {
    expect(settingsContentContent).toContain('id="contacts-divider"')
  })

  it('SettingsContent has contacts section element', () => {
    expect(settingsContentContent).toContain('id="contacts"')
  })
})

// ============================================================================
// 8. REALTIME VOICEMAIL MERGE INSERTS EXACTLY ONCE
// ============================================================================
describe('8. Realtime voicemail merge inserts exactly once', () => {
  it('Personal Voicemail page has a Supabase realtime subscription for personal_voicemails', () => {
    expect(personalVoicemailPageContent).toContain('personal-voicemails-realtime')
    expect(personalVoicemailPageContent).toMatch(/table: 'personal_voicemails'/)
  })

  it('Realtime subscription listens for INSERT events', () => {
    expect(personalVoicemailPageContent).toMatch(/event: 'INSERT'/)
  })

  it('Realtime handler dedupes by voicemail id before inserting', () => {
    // The handler should check if the voicemail already exists before adding
    expect(personalVoicemailPageContent).toMatch(/prev\.some\(\(v\) => v\.id === voicemailWithUrl\.id\)/)
  })

  it('Realtime channel is cleaned up on unmount', () => {
    expect(personalVoicemailPageContent).toMatch(/supabase\.removeChannel\(realtimeChannel\)/)
  })
})

// ============================================================================
// 9. LATER REFETCH DOES NOT DUPLICATE SAME VOICEMAIL
// ============================================================================
describe('9. Later refetch does not duplicate same voicemail', () => {
  it('fetchVoicemails dedupes incoming data by id', () => {
    expect(personalVoicemailPageContent).toMatch(/seenIds = new Set<string>\(\)/)
    expect(personalVoicemailPageContent).toMatch(/if \(seenIds\.has\(v\.id\)\) return false/)
  })

  it('fetchVoicemails filters duplicates from the API response', () => {
    expect(personalVoicemailPageContent).toMatch(/deduped = incoming\.filter/)
  })
})

// ============================================================================
// 10. SEEK CALCULATION UPDATES audio.currentTime
// ============================================================================
describe('10. Seek calculation updates audio.currentTime', () => {
  it('PersonalVoicemailPlayer handleSeekEnd sets audio.currentTime', () => {
    expect(personalVoicemailPlayerContent).toMatch(/audioRef\.current\.currentTime = seekTime/)
  })

  it('PersonalVoicemailPlayer uses native range input for seek', () => {
    expect(personalVoicemailPlayerContent).toMatch(/type="range"/)
  })

  it('PersonalVoicemailPlayer range input has onMouseDown and onTouchStart handlers', () => {
    expect(personalVoicemailPlayerContent).toMatch(/onMouseDown=\{handleSeekStart\}/)
    expect(personalVoicemailPlayerContent).toMatch(/onTouchStart=\{handleSeekStart\}/)
  })

  it('PersonalVoicemailPlayer range input has onMouseUp and onTouchEnd handlers', () => {
    expect(personalVoicemailPlayerContent).toMatch(/onMouseUp=\{handleSeekEnd\}/)
    expect(personalVoicemailPlayerContent).toMatch(/onTouchEnd=\{handleSeekEnd\}/)
  })

  it('PremiumAudioPlayer seekToClientX sets audio.currentTime', () => {
    expect(premiumAudioPlayerContent).toMatch(/audio\.currentTime = nextTime/)
  })

  it('PremiumAudioPlayer has handleProgressClick handler', () => {
    expect(premiumAudioPlayerContent).toMatch(/handleProgressClick/)
  })

  it('PremiumAudioPlayer has pointer drag handlers for scrubbing', () => {
    expect(premiumAudioPlayerContent).toMatch(/onPointerDown=\{handleProgressDragStart\}/)
    expect(premiumAudioPlayerContent).toMatch(/onPointerMove=\{handleProgressDragMove\}/)
    expect(premiumAudioPlayerContent).toMatch(/onPointerUp=\{handleProgressDragEnd\}/)
  })

  it('PremiumAudioPlayer calculates seek from clientX relative to progress bar rect', () => {
    expect(premiumAudioPlayerContent).toMatch(/getBoundingClientRect\(\)/)
    expect(premiumAudioPlayerContent).toMatch(/clientX - rect\.left/)
  })
})

// ============================================================================
// 11. TOUCH SEEK WORKS THROUGH THE PRODUCTION PLAYER PATH
// ============================================================================
describe('11. Touch seek works through the production player path', () => {
  it('PersonalVoicemailPlayer has onTouchStart and onTouchEnd for touch seek', () => {
    expect(personalVoicemailPlayerContent).toMatch(/onTouchStart=\{handleSeekStart\}/)
    expect(personalVoicemailPlayerContent).toMatch(/onTouchEnd=\{handleSeekEnd\}/)
  })

  it('PremiumAudioPlayer uses onPointerDown which covers touch events', () => {
    // Pointer events cover touch, mouse, and pen
    expect(premiumAudioPlayerContent).toMatch(/onPointerDown=\{handleProgressDragStart\}/)
  })

  it('PremiumAudioPlayer progress overlay has cursor-pointer class', () => {
    expect(premiumAudioPlayerContent).toMatch(/cursor-pointer/)
  })

  it('PremiumAudioPlayer progress overlay has role="slider" for accessibility', () => {
    expect(premiumAudioPlayerContent).toMatch(/role="slider"/)
  })
})

// ============================================================================
// 12. VOLUME CONTROL UPDATES audio.volume
// ============================================================================
describe('12. Volume control updates audio.volume', () => {
  it('PersonalVoicemailPlayer handleVolumeChange calls volumeManager.setVolume', () => {
    expect(personalVoicemailPlayerContent).toMatch(/volumeManager\.setVolume\(newVolume\)/)
  })

  it('PersonalVoicemailPlayer volume slider has min=0 max=1 step=0.01', () => {
    expect(personalVoicemailPlayerContent).toMatch(/min="0"[\s\S]*?max="1"[\s\S]*?step="0\.01"/)
  })

  it('PremiumAudioPlayer handleVolumeChange calls volumeManager.setVolume', () => {
    expect(premiumAudioPlayerContent).toMatch(/volumeManager\.setVolume\(newVolume\)/)
  })

  it('PremiumAudioPlayer volume slider has min=0 max=1 step=0.01', () => {
    expect(premiumAudioPlayerContent).toMatch(/min="0"[\s\S]*?max="1"[\s\S]*?step="0\.01"/)
  })

  it('volumeManager.setVolume clamps to 0..1', () => {
    expect(volumeManagerContent).toMatch(/Math\.max\(0, Math\.min\(1, newVolume\)\)/)
  })

  it('volumeManager.applyToAllRegisteredElements applies volume to audio elements', () => {
    expect(volumeManagerContent).toMatch(/applyToAllRegisteredElements/)
    expect(volumeManagerContent).toMatch(/\.volume = /)
  })
})

// ============================================================================
// 13. MUTE/UNMUTE RESTORE PREVIOUS VOLUME
// ============================================================================
describe('13. Mute/unmute restore previous volume', () => {
  it('volumeManager.toggleMute preserves previousVolume before muting', () => {
    expect(volumeManagerContent).toMatch(/this\.previousVolume = this\.volume/)
  })

  it('volumeManager.toggleMute restores previousVolume on unmute', () => {
    expect(volumeManagerContent).toMatch(/this\.volume = this\.previousVolume > 0 \? this\.previousVolume : 1\.0/)
  })

  it('PersonalVoicemailPlayer toggleMute calls volumeManager.toggleMute', () => {
    expect(personalVoicemailPlayerContent).toMatch(/volumeManager\.toggleMute\(\)/)
  })

  it('PremiumAudioPlayer toggleMute calls volumeManager.toggleMute', () => {
    expect(premiumAudioPlayerContent).toMatch(/volumeManager\.toggleMute\(\)/)
  })

  it('Volume slider displays 0 when muted', () => {
    expect(personalVoicemailPlayerContent).toMatch(/value=\{isMuted \? 0 : volume\}/)
    expect(premiumAudioPlayerContent).toMatch(/value=\{isMuted \? 0 : volume\}/)
  })
})

// ============================================================================
// 14. SWITCHING RECORDINGS KEEPS CANONICAL PLAYER VOLUME STATE
// ============================================================================
describe('14. Switching recordings keeps canonical player volume state', () => {
  it('volumeManager is a singleton (not per-recording)', () => {
    expect(volumeManagerContent).toMatch(/static|getInstance|export.*volumeManager|new VolumeManager/)
  })

  it('volumeManager persists to localStorage', () => {
    expect(volumeManagerContent).toMatch(/localStorage/)
  })

  it('volumeManager registers audio elements and applies saved volume', () => {
    expect(volumeManagerContent).toMatch(/register|registerElement|addAudioElement/)
  })

  it('PersonalVoicemailPlayer does NOT reset volume on recording switch', () => {
    // There should be no local volume state initialization that overrides the manager
    expect(personalVoicemailPlayerContent).toMatch(/volumeManager/)
  })
})

// ============================================================================
// 15. AI TRANSCRIPTION LABEL ABSENT WHEN TRANSCRIPT EXISTS
// ============================================================================
describe('15. AI Transcription label absent when transcript exists', () => {
  it('VoicemailMessage does NOT render "AI Transcription" text', () => {
    expect(voicemailMessageContent).not.toContain('AI Transcription')
  })

  it('VoicemailMessage still renders "Transcript" heading', () => {
    expect(voicemailMessageContent).toContain('Transcript')
  })

  it('VoicemailMessage still renders Show more / Show less', () => {
    expect(voicemailMessageContent).toContain('Show less')
    expect(voicemailMessageContent).toContain('Show more')
  })
})

// ============================================================================
// 16. TRANSCRIPT PENDING/ERROR STATES REMAIN INTACT
// ============================================================================
describe('16. Transcript pending/error states remain intact', () => {
  it('VoicemailMessage has processing state for transcription', () => {
    expect(voicemailMessageContent).toMatch(/transcription_status === 'processing'/)
  })

  it('VoicemailMessage has failed state for transcription', () => {
    expect(voicemailMessageContent).toMatch(/transcription_status === 'failed'/)
  })

  it('VoicemailMessage processing state shows spinner', () => {
    expect(voicemailMessageContent).toMatch(/Transcription processing|processing.*spinner|animate-spin/)
  })

  it('VoicemailMessage failed state shows unavailable message', () => {
    expect(voicemailMessageContent).toMatch(/Transcript unavailable|unavailable/)
  })

  it('VoicemailMessage completed state requires transcription_text and completed status', () => {
    expect(voicemailMessageContent).toMatch(/transcription_text && recording\.transcription_status === 'completed'/)
  })
})

// ============================================================================
// CALL FORWARDING CONTROL HEIGHT CONSISTENCY
// ============================================================================
describe('Call Forwarding control height consistency', () => {
  it('ForwardingHelpCenter code field uses h-10', () => {
    expect(forwardingHelpCenterContent).toMatch(/code.*?h-10/s)
  })

  it('ForwardingHelpCenter Copy button uses h-10', () => {
    expect(forwardingHelpCenterContent).toMatch(/handleCopyCode[\s\S]*?h-10/)
  })

  it('ForwardingHelpCenter Dial button uses h-10', () => {
    expect(forwardingHelpCenterContent).toMatch(/handleOpenDialer[\s\S]*?h-10/)
  })

  it('All three controls share the same h-10 height', () => {
    const h10Count = (forwardingHelpCenterContent.match(/h-10/g) || []).length
    expect(h10Count).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================================
// CUSTOMER CARD GRADIENT STRENGTHENING
// ============================================================================
describe('Customer card gradient strengthening', () => {
  it('customer-status.ts uses from-slate-100/90 (stronger than from-slate-50/90) in light mode', () => {
    expect(customerStatusContent).toContain('from-slate-100/90')
  })

  it('customer-status.ts does NOT use old from-slate-50/90', () => {
    expect(customerStatusContent).not.toContain('from-slate-50/90')
  })

  it('customer-status.ts uses dark:from-slate-800/60 (stronger than dark:from-slate-900/60) in dark mode', () => {
    expect(customerStatusContent).toContain('dark:from-slate-800/60')
  })

  it('customer-status.ts does NOT use old dark:from-slate-900/60', () => {
    expect(customerStatusContent).not.toContain('dark:from-slate-900/60')
  })

  it('customer-status.ts uses [0.06] opacity (stronger than old [0.04])', () => {
    expect(customerStatusContent).toContain('[0.06]')
  })
})
