import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { settingsSections, getSettingsSection, getSettingsSectionIds, getSettingsSectionLabels } from '../src/lib/settings-config'

describe('Settings Section Labels - Canonical Configuration', () => {
  it('has exactly six sections', () => {
    expect(settingsSections).toHaveLength(6)
  })

  it('has the correct section IDs in order', () => {
    const ids = getSettingsSectionIds()
    expect(ids).toEqual(['general', 'automation', 'integrations', 'payments', 'contacts', 'account'])
  })

  it('has the correct section labels in order', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toEqual(['General', 'Automation', 'Integrations', 'Payments', 'Contacts', 'Account'])
  })

  it('each section has both id and label', () => {
    settingsSections.forEach(section => {
      expect(section.id).toBeDefined()
      expect(section.label).toBeDefined()
      expect(typeof section.id).toBe('string')
      expect(typeof section.label).toBe('string')
    })
  })

  it('getSettingsSection returns correct section by ID', () => {
    expect(getSettingsSection('general')?.label).toBe('General')
    expect(getSettingsSection('automation')?.label).toBe('Automation')
    expect(getSettingsSection('integrations')?.label).toBe('Integrations')
    expect(getSettingsSection('payments')?.label).toBe('Payments')
    expect(getSettingsSection('contacts')?.label).toBe('Contacts')
    expect(getSettingsSection('account')?.label).toBe('Account')
  })

  it('getSettingsSection returns undefined for invalid ID', () => {
    expect(getSettingsSection('invalid')).toBeUndefined()
  })

  it('has no duplicate section IDs', () => {
    const ids = getSettingsSectionIds()
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('has no duplicate section labels', () => {
    const labels = getSettingsSectionLabels()
    const uniqueLabels = new Set(labels)
    expect(uniqueLabels.size).toBe(labels.length)
  })
})

describe('Settings Section Labels - Label Mapping', () => {
  it('maps General to general ID', () => {
    const section = getSettingsSection('general')
    expect(section?.label).toBe('General')
  })

  it('maps Automation to automation ID', () => {
    const section = getSettingsSection('automation')
    expect(section?.label).toBe('Automation')
  })

  it('maps Integrations to integrations ID', () => {
    const section = getSettingsSection('integrations')
    expect(section?.label).toBe('Integrations')
  })

  it('maps Payments to payments ID', () => {
    const section = getSettingsSection('payments')
    expect(section?.label).toBe('Payments')
  })

  it('maps Contacts to contacts ID', () => {
    const section = getSettingsSection('contacts')
    expect(section?.label).toBe('Contacts')
  })

  it('maps Account to account ID', () => {
    const section = getSettingsSection('account')
    expect(section?.label).toBe('Account')
  })
})

describe('Settings Section Labels - Old Labels Removed', () => {
  it('does not contain GETTING STARTED', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).not.toContain('Getting Started')
    expect(labels).not.toContain('GETTING STARTED')
  })

  it('does not contain DAILY OPERATIONS', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).not.toContain('Daily Operations')
    expect(labels).not.toContain('DAILY OPERATIONS')
  })

  it('does not contain PERSONAL', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).not.toContain('Personal')
    expect(labels).not.toContain('PERSONAL')
  })
})

describe('Settings Section Labels - Required Labels Present', () => {
  it('contains GENERAL', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('General')
  })

  it('contains AUTOMATION', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('Automation')
  })

  it('contains INTEGRATIONS', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('Integrations')
  })

  it('contains PAYMENTS', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('Payments')
  })

  it('contains CONTACTS', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('Contacts')
  })

  it('contains ACCOUNT', () => {
    const labels = getSettingsSectionLabels()
    expect(labels).toContain('Account')
  })
})
