import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function read(filePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')
}

describe('NotificationStartupPermission', () => {
  const component = read('src/components/notifications/NotificationStartupPermission.tsx')
  const authContext = read('src/contexts/AuthContext.tsx')
  const businessGuard = read('src/components/BusinessGuard.tsx')
  const pushService = read('src/lib/push-service.ts')

  it('only runs on native Capacitor platforms', () => {
    expect(component).toContain('Capacitor.isNativePlatform()')
  })

  it('waits for auth hydration and an authenticated user', () => {
    expect(component).toContain("const { authHydrated, user } = useAuth()")
    expect(component).toContain('!authHydrated || !user')
  })

  it('requests notification permission via pushService', () => {
    expect(component).toContain('pushService.requestPermission()')
  })

  it('coordinates with the permission lock to avoid overlapping dialogs', () => {
    expect(component).toContain("permissionLock.requestPermission('notification')")
    expect(component).toContain('permissionLock.releasePermission')
  })

  it('defers the request with requestAnimationFrame so the app shell paints first', () => {
    expect(component).toContain('requestAnimationFrame')
    expect(component).toContain('cancelAnimationFrame')
  })

  it('guards against duplicate requests from rerenders / Strict Mode', () => {
    expect(component).toContain('useRef(false)')
    expect(component).toContain('hasRequestedRef.current')
  })

  it('does not render any UI', () => {
    expect(component).toContain('return null')
  })

  it('is mounted inside BusinessGuard after the authenticated business shell is ready', () => {
    expect(businessGuard).toContain("import { NotificationStartupPermission } from '@/components/notifications/NotificationStartupPermission'")
    expect(businessGuard).toContain('<NotificationStartupPermission />')
  })

  it('removes the AuthContext permission request trigger', () => {
    expect(authContext).not.toContain('pushService.requestPermission()')
    expect(authContext).not.toContain('Requesting notification permission after authentication')
    expect(authContext).not.toContain('Requesting notification permission after sign-in')
  })

  it('keeps pushService.setAccessToken on auth state changes', () => {
    expect(authContext).toContain('pushService.setAccessToken(session.access_token)')
  })

  it('leaves push registration/listener setup in pushService.initialize', () => {
    expect(pushService).toContain('PushNotifications.addListener(\'registration\'')
    expect(pushService).toContain('PushNotifications.addListener(\'registrationError\'')
    expect(pushService).toContain('PushNotifications.addListener(\'pushNotificationReceived\'')
    expect(pushService).toContain('PushNotifications.addListener(\'pushNotificationActionPerformed\'')
    expect(pushService).toContain('PushNotifications.register()')
  })

  it('leaves permission request in pushService.requestPermission behind state checks', () => {
    expect(pushService).toContain('async requestPermission(): Promise<boolean>')
    expect(pushService).toContain("state.notifications.status === 'granted'")
    expect(pushService).toContain("state.notifications.status === 'denied'")
    expect(pushService).toContain('nativePermissionsStore.requestNotificationPermission()')
  })
})
