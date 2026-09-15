import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 2B — camera attachment normalization', () => {
  const actionSheetSrc = readSrc('src/components/conversation/AttachmentActionSheet.tsx')

  it('1. native Take Photo uses result.path + Capacitor.convertFileSrc', () => {
    expect(actionSheetSrc).toContain('result.path')
    expect(actionSheetSrc).toContain('Capacitor.convertFileSrc(result.path)')
  })

  it('2. non-native or missing path falls back to webPath / uri', () => {
    expect(actionSheetSrc).toContain('result.webPath || result.uri')
  })

  it('3. uses fetch + Blob to avoid base64 memory pressure', () => {
    expect(actionSheetSrc).toContain('await fetch(path)')
    expect(actionSheetSrc).toContain('await response.blob()')
    expect(actionSheetSrc).not.toContain('CameraResultType.DataUrl')
    expect(actionSheetSrc).not.toContain('atob(')
    expect(actionSheetSrc).not.toContain('dataUrl')
    expect(actionSheetSrc).not.toContain('toDataURL')
  })

  it('4. takePhoto uses modern v8 API with saveToGallery disabled', () => {
    expect(actionSheetSrc).toContain('CapacitorCamera.takePhoto')
    expect(actionSheetSrc).toContain('saveToGallery: false')
    expect(actionSheetSrc).not.toContain('getPhoto')
    expect(actionSheetSrc).not.toContain("CameraSource.Camera")
  })

  it('5. cancellation or missing path returns null, no phantom File', () => {
    expect(actionSheetSrc).toContain('if (!path) return null')
    expect(actionSheetSrc).toContain('onPickerReturnRef.current(null)')
  })

  it('6. single normalization helper produces a File with sensible MIME/name', () => {
    expect(actionSheetSrc).toContain('new File([blob], filename, { type: mime })')
    expect(actionSheetSrc).toContain('image/jpeg')
    expect(actionSheetSrc).toContain('photo_${Date.now()}')
  })
})
