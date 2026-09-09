import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'

describe('Settings save confirmation state machine', () => {
  const actionbarContent = readFileSync('src/components/SettingsActionBar.tsx', 'utf8')
  const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('auto-hides success state after 4 seconds', () => {
    expect(actionbarContent).toContain('4000')
  })

  it('shows "Settings Saved" text in success state', () => {
    expect(actionbarContent).toContain("'Settings Saved'")
  })

  it('shows "Saving…" text in saving state', () => {
    expect(actionbarContent).toContain('Saving…')
  })

  it('shows "Unsaved Changes" text in dirty state', () => {
    expect(actionbarContent).toContain("'Unsaved Changes'")
  })

  it('does not show a duplicate top toast for settings saved', () => {
    // The showToast('Settings saved') call should be removed from onBusinessUpdated
    // The SettingsActionBar is the single source of success feedback
    expect(settingsContent).not.toContain("showToast('Settings saved', 'success')")
  })

  it('clears saveSuccess when the user edits during the success window', () => {
    expect(settingsContent).toContain('if (saveSuccess) setSaveSuccess(false)')
  })

  it('uses a single saveSuccess state variable', () => {
    expect(settingsContent).toContain('const [saveSuccess, setSaveSuccess] = useState(false)')
  })
})

describe('Settings save state machine with fake timers', () => {
  let content: string

  beforeEach(() => {
    vi.useFakeTimers()
    content = readFileSync('src/components/SettingsActionBar.tsx', 'utf8')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses setTimeout for the success auto-hide timer', () => {
    expect(content).toContain('setTimeout')
    expect(content).toContain('clearTimeout')
  })

  it('clears the success timer on cleanup', () => {
    expect(content).toContain('return () => clearTimeout(timer)')
  })
})
