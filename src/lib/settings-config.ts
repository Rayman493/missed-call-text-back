// Canonical Settings section configuration
// Single source of truth for Settings navigation and section labels

export interface SettingsSection {
  id: string
  label: string
}

export const settingsSections: SettingsSection[] = [
  { id: 'general', label: 'General' },
  { id: 'automation', label: 'Automation' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'payments', label: 'Payments' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'account', label: 'Account' },
]

// Helper to get section by ID
export function getSettingsSection(id: string): SettingsSection | undefined {
  return settingsSections.find(section => section.id === id)
}

// Helper to get all section IDs
export function getSettingsSectionIds(): string[] {
  return settingsSections.map(section => section.id)
}

// Helper to get all section labels
export function getSettingsSectionLabels(): string[] {
  return settingsSections.map(section => section.label)
}
