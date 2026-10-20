import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * iOS build 5 — App Store rejection fixes.
 * Issue 1: iPadOS 27 EXC_BREAKPOINT on launch —
 *   ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption —
 *   the app must declare UIApplicationSceneManifest (scene lifecycle is
 *   enforced as fatal on OS 27).
 * Issue 2: placeholder icon/splash artwork (Guideline 2.3.8).
 */
describe('iOS scene lifecycle adoption', () => {
  const plist = read('ios/App/App/Info.plist')

  it('declares UIApplicationSceneManifest with a default scene configuration', () => {
    expect(plist).toContain('<key>UIApplicationSceneManifest</key>')
    expect(plist).toContain('<key>UIWindowSceneSessionRoleApplication</key>')
    expect(plist).toContain('<key>UISceneDelegateClassName</key>')
    expect(plist).toContain('.SceneDelegate')
  })

  it('keeps the Main storyboard as the scene storyboard (bridge VC unchanged)', () => {
    expect(plist).toContain('<key>UISceneStoryboardFile</key>')
    const idx = plist.indexOf('<key>UISceneStoryboardFile</key>')
    expect(plist.slice(idx, idx + 120)).toContain('<string>Main</string>')
    // legacy app-lifecycle storyboard key removed — scenes own window creation
    expect(plist).not.toContain('<key>UIMainStoryboardFile</key>')
  })

  it('does not enable multiple scenes (single-window app)', () => {
    const idx = plist.indexOf('<key>UIApplicationSupportsMultipleScenes</key>')
    expect(idx).toBeGreaterThan(-1)
    expect(plist.slice(idx, idx + 120)).toContain('<false/>')
  })

  it('SceneDelegate.swift exists and forwards deep links + universal links to Capacitor', () => {
    const path = 'ios/App/App/SceneDelegate.swift'
    expect(existsSync(join(root, path))).toBe(true)
    const src = read(path)
    expect(src).toContain('UIWindowSceneDelegate')
    expect(src).toContain('openURLContexts')
    expect(src).toContain('connectionOptions.urlContexts')
    expect(src).toContain('connectionOptions.userActivities')
    expect(src).toContain('ApplicationDelegateProxy.shared.application')
  })

  it('SceneDelegate.swift is registered in the Xcode project', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    expect(pbx).toContain('SceneDelegate.swift in Sources')
    expect(pbx).toContain('path = SceneDelegate.swift')
  })

  it('AppDelegate still owns APNs callbacks and Capacitor proxies (unchanged)', () => {
    const src = read('ios/App/App/AppDelegate.swift')
    expect(src).toContain('capacitorDidRegisterForRemoteNotifications')
    expect(src).toContain('ApplicationDelegateProxy.shared.application(app, open: url')
    expect(src).toContain('CustomBridgeViewController')
  })
})

describe('iOS branded assets', () => {
  it('AppIcon is the finalized 1024x1024 opaque brand asset', () => {
    const p = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
    const buf = readFileSync(join(root, p))
    expect(buf.slice(1, 4).toString()).toBe('PNG')
    expect(buf.readUInt32BE(16)).toBe(1024)
    expect(buf.readUInt32BE(20)).toBe(1024)
    // PNG color type 2 = truecolor RGB (no alpha) — Apple app-icon requirement
    expect(buf[25]).toBe(2)
  })

  it('icon set references the single 1024 asset', () => {
    const c = read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json')
    expect(c).toContain('AppIcon-512@2x.png')
    expect(c).toContain('1024x1024')
  })

  it('splash images exist at 2732x2732', () => {
    for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
      const buf = readFileSync(join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', n))
      expect(buf.readUInt32BE(16)).toBe(2732)
      expect(buf.readUInt32BE(20)).toBe(2732)
    }
  })
})
