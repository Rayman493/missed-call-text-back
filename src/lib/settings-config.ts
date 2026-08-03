// Canonical Settings section configuration
// Single source of truth for Settings navigation and section labels

export interface SettingsSection {
  id: string
  label: string
  icon: () => any
}

// Base sections that are always present
const baseSections: SettingsSection[] = [
  { id: 'general', label: 'General', icon: () => null }, 
  { id: 'automation', label: 'Automation', icon: () => null },
  { id: 'notifications', label: 'Notifications', icon: () => null },
  { id: 'integrations', label: 'Integrations', icon: () => null },
  { id: 'payments', label: 'Payments', icon: () => null },
  { id: 'contacts', label: 'Contacts', icon: () => null },
  { id: 'account', label: 'Account', icon: () => null },
]

// Get settings sections (same for all platforms)
export function getSettingsSections(): SettingsSection[] {
  return baseSections
}

// Legacy export for backward compatibility
export const settingsSections: SettingsSection[] = getSettingsSections()

// Helper to get section by ID
export function getSettingsSection(id: string): SettingsSection | undefined {
  return getSettingsSections().find(section => section.id === id)
}

// Helper to get all section IDs
export function getSettingsSectionIds(): string[] {
  return getSettingsSections().map(section => section.id)
}

// Helper to get all section labels
export function getSettingsSectionLabels(): string[] {
  return getSettingsSections().map(section => section.label)
}
