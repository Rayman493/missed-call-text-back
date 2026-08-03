// Canonical Settings section configuration
// Single source of truth for Settings navigation and section labels

export interface SettingsSection {
  id: string
  label: string
}

// Base sections (always present)
const baseSections: SettingsSection[] = [
  { id: 'general', label: 'General' },
  { id: 'automation', label: 'Automation' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'payments', label: 'Payments' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'account', label: 'Account' },
]

// Native mobile only sections
const nativeMobileOnlySections: SettingsSection[] = [
  { id: 'permissions', label: 'Permissions' },
]

// Helper to check if running on native mobile platform
export function isNativeMobilePlatform(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const Capacitor = (window as any).Capacitor
    if (!Capacitor?.isNativePlatform?.()) return false
    const platform = Capacitor.getPlatform?.()
    return platform === 'android' || platform === 'ios'
  } catch {
    return false
  }
}

// Get dynamic settings sections based on platform
export function getSettingsSections(): SettingsSection[] {
  const isNative = isNativeMobilePlatform()
  
  if (isNative) {
    // Native mobile: insert permissions after automation, before notifications
    const permissionsIndex = baseSections.findIndex(s => s.id === 'notifications')
    if (permissionsIndex === -1) return baseSections
    
    return [
      ...baseSections.slice(0, permissionsIndex),
      ...nativeMobileOnlySections,
      ...baseSections.slice(permissionsIndex)
    ]
  }
  
  // Desktop web: return base sections only (no permissions)
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
