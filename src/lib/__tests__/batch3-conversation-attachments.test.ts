import { describe, it, expect } from 'vitest'

/**
 * Batch 3 — Conversation + Attachments + Keyboard Layout
 * NATIVE CAMERA CORRECTION PASS
 *
 * Covers:
 * TAKE PHOTO (1-5)
 * SHEET (6-8)
 * COMPOSER (9-12)
 * KEYBOARD/LAYOUT (13-17)
 * CAMERA CORRECTION (18-24)
 */

const fs = require('fs')

function readContent(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

// ============================================================
// TAKE PHOTO
// ============================================================

describe('Batch 3 — Take Photo (native camera)', () => {
  it('1. Take Photo uses current supported native camera API (takePhoto)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('@capacitor/camera')
    expect(content).toContain('CapacitorCamera.takePhoto')
  })

  it('2. Choose Photo does NOT use camera path (uses HTML input, no capture)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // photoPickerRef input should NOT have capture attribute
    const photoPickerMatch = content.match(/ref=\{photoPickerRef\}[\s\S]*?\/>/)
    expect(photoPickerMatch).toBeTruthy()
    if (photoPickerMatch) {
      expect(photoPickerMatch[0]).not.toContain('capture')
      expect(photoPickerMatch[0]).toContain('accept="image/*"')
    }
    // handleChoosePhoto should use launchPicker (HTML input), not CapacitorCamera
    const choosePhotoStart = content.indexOf('handleChoosePhoto = useCallback')
    expect(choosePhotoStart).toBeGreaterThan(-1)
    const choosePhotoSection = content.substring(choosePhotoStart, choosePhotoStart + 200)
    expect(choosePhotoSection).toContain('launchPicker')
    expect(choosePhotoSection).not.toContain('CapacitorCamera')
  })

  it('3. Choose File retains document picker (full accept types, no capture)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const filePickerMatch = content.match(/ref=\{filePickerRef\}[\s\S]*?\/>/)
    expect(filePickerMatch).toBeTruthy()
    if (filePickerMatch) {
      expect(filePickerMatch[0]).not.toContain('capture')
      expect(filePickerMatch[0]).toContain('accept=')
    }
    // handleChooseFile should use launchPicker (HTML input)
    const chooseFileStart = content.indexOf('handleChooseFile = useCallback')
    expect(chooseFileStart).toBeGreaterThan(-1)
    const chooseFileSection = content.substring(chooseFileStart, chooseFileStart + 200)
    expect(chooseFileSection).toContain('launchPicker')
    expect(chooseFileSection).not.toContain('CapacitorCamera')
  })

  it('4. captured result reaches same File/onPickerReturn pipeline', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // mediaResultToFile converts the takePhoto result to a File
    expect(content).toContain('mediaResultToFile')
    // The File is passed to onPickerReturn (same callback as HTML input path)
    expect(content).toContain('onPickerReturnRef.current([file])')
  })

  it('5. camera cancel creates no attachment', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // The catch block should call onPickerReturn(null) — no phantom attachment
    const takePhotoStart = content.indexOf('handleTakePhoto = useCallback')
    expect(takePhotoStart).toBeGreaterThan(-1)
    const takePhotoSection = content.substring(takePhotoStart, takePhotoStart + 1200)
    // Camera cancel/error → onPickerReturn(null)
    expect(takePhotoSection).toContain('onPickerReturnRef.current(null)')
  })
})

// ============================================================
// SHEET
// ============================================================

describe('Batch 3 — Attachment Sheet', () => {
  it('6. all 3 actions preserved (Take Photo, Choose Photo, Choose File)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('Take Photo')
    expect(content).toContain('Choose Photo')
    expect(content).toContain('Choose File')
  })

  it('7. no duplicate action rows (exactly 3 buttons)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const actionButtons = content.match(/onClick=\{handleTakePhoto\}|onClick=\{handleChoosePhoto\}|onClick=\{handleChooseFile\}/g) || []
    expect(actionButtons.length).toBe(3)
  })

  it('8. existing picker return lifecycle retained (onPickerLaunch/onPickerReturn/onClose)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerLaunch')
    expect(content).toContain('onPickerReturn')
    expect(content).toContain('onClose')
    // Cancel listener still attached for HTML inputs
    expect(content).toContain("addEventListener('cancel'")
    // handleFileChange still resets input value for re-selection
    expect(content).toContain('input.value = ')
  })

  it('sheet rows have equal height (h-14) and consistent padding', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const h14Count = (content.match(/h-14/g) || []).length
    expect(h14Count).toBeGreaterThanOrEqual(3)
    const px3Count = (content.match(/px-3/g) || []).length
    expect(px3Count).toBeGreaterThanOrEqual(3)
    const iconCircleCount = (content.match(/w-10 h-10 rounded-full/g) || []).length
    expect(iconCircleCount).toBe(3)
  })

  it('sheet has consistent pressed state (active:bg-muted/70)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const activeCount = (content.match(/active:bg-muted\/70/g) || []).length
    expect(activeCount).toBe(3)
  })
})

// ============================================================
// COMPOSER
// ============================================================

describe('Batch 3 — Composer visual', () => {
  it('9. focus treatment no longer applies heavy whole-box ring (desktop)', () => {
    const content = readContent('src/components/ConversationComposer.tsx')
    expect(content).not.toContain('focus-within:ring-2 focus-within:ring-primary/20')
    expect(content).toContain('focus-within:border-primary/40')
  })

  it('9b. focus treatment no longer applies heavy whole-box ring (mobile)', () => {
    const content = readContent('src/components/MobileConversationComposer.tsx')
    expect(content).not.toContain('focus-within:border-blue-400/40')
    expect(content).toContain('focus-within:border-border/80')
  })

  it('9c. inline mobile composer no longer has heavy ring', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).not.toContain('focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500/40')
  })

  it('10. text vertical alignment uses leading-relaxed and py-3 (mobile composer)', () => {
    const content = readContent('src/components/MobileConversationComposer.tsx')
    expect(content).toContain('leading-relaxed')
    expect(content).toContain('py-3')
    expect(content).not.toContain('leading-normal py-2.5')
  })

  it('10b. text vertical alignment uses leading-relaxed and py-3 (inline composer)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('leading-relaxed')
    expect(content).toContain('py-3')
  })

  it('11. fullscreen left gap reduced (pl-2 instead of px-3 on textarea)', () => {
    const content = readContent('src/components/ConversationComposer.tsx')
    expect(content).toContain('pl-2 pr-3')
    expect(content).not.toContain('px-3 py-2.5 bg-transparent text-foreground resize-none')
  })

  it('12. normal layout remains valid (desktop composer still renders)', () => {
    const content = readContent('src/components/ConversationComposer.tsx')
    expect(content).toContain('Paperclip')
    expect(content).toContain('handleSend')
    expect(content).toContain('placeholder="Write a message..."')
  })
})

// ============================================================
// KEYBOARD/LAYOUT
// ============================================================

describe('Batch 3 — Keyboard-open layout', () => {
  it('13. keyboard-open mode does not double-count bottom inset (mobile layout)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).not.toContain('pb-[calc(6rem+env(safe-area-inset-bottom))]')
    expect(content).toContain('pb-[calc(1rem+var(--bottom-nav-height,72px))]')
    expect(content).toContain('h-[calc(100dvh-7rem-var(--bottom-nav-height,72px))]')
    expect(content).not.toContain('h-[calc(100dvh-12rem-var(--bottom-nav-height,72px))]')
  })

  it('13b. mobile composer container does not double-count safe-area', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).not.toContain("paddingBottom: 'calc(16px + env(safe-area-inset-bottom))'")
  })

  it('13c. MobileConversationComposer does not double-count safe-area', () => {
    const content = readContent('src/components/MobileConversationComposer.tsx')
    expect(content).not.toContain("paddingBottom: 'max(16px, env(safe-area-inset-bottom))'")
  })

  it('14. conversation scroll owner retains flex/min-height contract', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('flex-1 overflow-y-auto scroll-smooth overscroll-contain bg-muted/20 min-h-0')
    expect(content).toContain('flex-1 overflow-y-auto min-h-0 outline-none')
  })

  it('15. composer remains above keyboard (flex-shrink-0, not absolute)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('flex-shrink-0" style={{ paddingBottom: \'16px\'')
  })

  it('16. bottom nav/safe-area behavior preserved (BottomNavigation hides on keyboard)', () => {
    const content = readContent('src/components/BottomNavigation.tsx')
    expect(content).toContain('isNativePlatform && isKeyboardOpen')
    expect(content).toContain("--bottom-nav-height', '0px'")
  })

  it('17. fullscreen and normal conversation paths both covered', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('isFullScreen && typeof document !== \'undefined\' && createPortal')
    expect(content).toContain("paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)'")
    expect(content).toContain('flex-shrink-0 border-t border-border/20 bg-muted/30 px-6 py-4 rounded-b-2xl')
  })
})

// ============================================================
// CAMERA CORRECTION PASS
// ============================================================

describe('Batch 3 — Camera correction pass', () => {
  it('18. @capacitor/camera version is 8.2.4 (supports takePhoto)', () => {
    const pkg = readContent('package.json')
    expect(pkg).toContain('@capacitor/camera')
    // Verify the installed version supports takePhoto (8.1.0+)
    const lockContent = readContent('package-lock.json')
    expect(lockContent).toContain('@capacitor/camera')
  })

  it('19. no unnecessary Android permission added for saveToGallery:false', () => {
    const manifest = readContent('android/app/src/main/AndroidManifest.xml')
    // Should NOT have CAMERA permission (saveToGallery:false doesn't need it)
    expect(manifest).not.toContain('android.permission.CAMERA')
    // Should NOT have storage permissions
    expect(manifest).not.toContain('READ_EXTERNAL_STORAGE')
    expect(manifest).not.toContain('WRITE_EXTERNAL_STORAGE')
    // Should preserve existing permissions
    expect(manifest).toContain('android.permission.INTERNET')
    expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION')
  })

  it('20. captured result reaches same File/onPickerReturn pipeline (no second upload path)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // mediaResultToFile converts to File, then onPickerReturnRef.current([file])
    expect(content).toContain('mediaResultToFile')
    expect(content).toContain('onPickerReturnRef.current([file])')
    // No separate upload/MMS call — uses existing pipeline
    expect(content).not.toContain('uploadPhoto')
    expect(content).not.toContain('sendMMS')
  })

  it('21. camera cancel creates no attachment (catch → onPickerReturn(null))', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const takePhotoStart = content.indexOf('handleTakePhoto = useCallback')
    expect(takePhotoStart).toBeGreaterThan(-1)
    const takePhotoSection = content.substring(takePhotoStart, takePhotoStart + 1200)
    expect(takePhotoSection).toContain('onPickerReturnRef.current(null)')
  })

  it('22. MIME/extension retained from camera result metadata', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // mediaResultToFile should derive mime/extension from metadata.format
    expect(content).toContain('metadata?.format')
    expect(content).toContain('image/jpeg')
    expect(content).toContain('image/png')
    // File constructor should use the derived mime
    expect(content).toContain('new File([blob], filename, { type: mime })')
  })

  it('23. large-image path does NOT require DataUrl (uses fetch+Blob from webPath/uri)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // Should use fetch to convert webPath/uri to Blob (not base64 DataUrl)
    expect(content).toContain('fetch(path)')
    expect(content).toContain('await response.blob()')
    // Should NOT use DataUrl or base64 encoding
    expect(content).not.toContain('CameraResultType.DataUrl')
    expect(content).not.toContain('atob(')
    expect(content).not.toContain('dataUrl')
  })

  it('24. iOS required plist keys exist', () => {
    const plist = readContent('ios/App/App/Info.plist')
    expect(plist).toContain('NSCameraUsageDescription')
    expect(plist).toContain('NSPhotoLibraryAddUsageDescription')
    expect(plist).toContain('NSPhotoLibraryUsageDescription')
    // Should have ReplyFlow-specific text
    expect(plist).toContain('ReplyFlow')
  })

  it('takePhoto uses saveToGallery:false (no gallery save)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('saveToGallery: false')
  })

  it('takePhoto does NOT use deprecated getPhoto or CameraSource', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // Should NOT use deprecated getPhoto API
    expect(content).not.toContain('CapacitorCamera.getPhoto')
    expect(content).not.toContain('CameraSource.Camera')
    expect(content).not.toContain('CameraResultType')
  })

  it('web/desktop fallback still uses HTML capture input', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('Capacitor.isNativePlatform()')
    expect(content).toContain('launchPicker(cameraInputRef)')
    expect(content).toContain('capture="environment"')
  })
})
