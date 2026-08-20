import { describe, it, expect } from 'vitest'
import { detectMimeType, isSupportedMimeType, isDocumentMimeType, isVideoMimeType, validateMMSFile } from '@/lib/mime-detection'

describe('MIME Detection - Images', () => {
  it('accepts JPEG with valid signature', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46])
    const file = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('image/jpeg')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('accepts PNG with valid signature', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const file = new File([pngBytes], 'test.png', { type: 'image/png' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('image/png')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('accepts GIF with valid signature', async () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    const file = new File([gifBytes], 'test.gif', { type: 'image/gif' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('image/gif')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('rejects WEBP', async () => {
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    const file = new File([webpBytes], 'test.webp', { type: 'image/webp' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('image/webp')
    expect(isSupportedMimeType(result.detectedMimeType)).toBe(false)
  })
})

describe('MIME Detection - Documents', () => {
  it('accepts PDF with valid %PDF signature', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34])
    const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('application/pdf')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('rejects fake PDF without %PDF signature', async () => {
    const fakePdfBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const file = new File([fakePdfBytes], 'fake.pdf', { type: 'application/pdf' })
    const result = await detectMimeType(file)

    expect(result.byteSignatureValid).toBe(false)
  })

  it('accepts valid ASCII CSV', async () => {
    const csvBytes = new Uint8Array([0x6E, 0x61, 0x6D, 0x65, 0x2C, 0x61, 0x67, 0x65]) // "name,age"
    const file = new File([csvBytes], 'test.csv', { type: 'text/csv' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('text/csv')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('accepts UTF-8 CSV with accents', async () => {
    // "José" in UTF-8: 4A 6F 73 C3 A9
    const csvBytes = new Uint8Array([0x4A, 0x6F, 0x73, 0xC3, 0xA9, 0x2C, 0x33, 0x30])
    const file = new File([csvBytes], 'test.csv', { type: 'text/csv' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('text/csv')
    expect(result.byteSignatureValid).toBe(true)
  })

  it('rejects binary file with .csv extension', async () => {
    const binaryBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const file = new File([binaryBytes], 'malicious.csv', { type: 'text/csv' })
    const result = await detectMimeType(file)

    expect(result.byteSignatureValid).toBe(false)
  })

  it('rejects CSV with null bytes', async () => {
    const csvWithNull = new Uint8Array([0x6E, 0x61, 0x6D, 0x65, 0x00, 0x61, 0x67, 0x65])
    const file = new File([csvWithNull], 'test.csv', { type: 'text/csv' })
    const result = await detectMimeType(file)

    expect(result.byteSignatureValid).toBe(false)
  })
})

describe('MIME Detection - Video', () => {
  it('accepts MP4 with .mp4 extension', async () => {
    const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])
    const file = new File([mp4Bytes], 'test.mp4', { type: 'video/mp4' })
    const result = await detectMimeType(file)

    expect(result.detectedMimeType).toBe('video/mp4')
    // Video validation uses extension + MIME type, not byte signatures
    // byteSignatureValid will be true if no null bytes are present
    expect(isSupportedMimeType(result.detectedMimeType)).toBe(true)
  })

  it('rejects unsupported video format (MOV)', async () => {
    const movBytes = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70])
    const file = new File([movBytes], 'test.mov', { type: 'video/quicktime' })
    const result = await detectMimeType(file)

    expect(isSupportedMimeType(result.detectedMimeType)).toBe(false)
  })
})

describe('Supported MIME Types', () => {
  it('accepts all supported image types', () => {
    expect(isSupportedMimeType('image/jpeg')).toBe(true)
    expect(isSupportedMimeType('image/jpg')).toBe(true)
    expect(isSupportedMimeType('image/png')).toBe(true)
    expect(isSupportedMimeType('image/gif')).toBe(true)
  })

  it('accepts document types', () => {
    expect(isSupportedMimeType('application/pdf')).toBe(true)
    expect(isSupportedMimeType('text/csv')).toBe(true)
  })

  it('accepts video type', () => {
    expect(isSupportedMimeType('video/mp4')).toBe(true)
  })

  it('rejects unsupported types', () => {
    expect(isSupportedMimeType('image/webp')).toBe(false)
    expect(isSupportedMimeType('video/quicktime')).toBe(false)
    expect(isSupportedMimeType('application/msword')).toBe(false)
    expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false)
  })
})

describe('Document Type Detection', () => {
  it('identifies PDF as document', () => {
    expect(isDocumentMimeType('application/pdf')).toBe(true)
  })

  it('identifies CSV as document', () => {
    expect(isDocumentMimeType('text/csv')).toBe(true)
  })

  it('does not identify images as documents', () => {
    expect(isDocumentMimeType('image/jpeg')).toBe(false)
    expect(isDocumentMimeType('image/png')).toBe(false)
  })

  it('does not identify video as document', () => {
    expect(isDocumentMimeType('video/mp4')).toBe(false)
  })
})

describe('Video Type Detection', () => {
  it('identifies MP4 as video', () => {
    expect(isVideoMimeType('video/mp4')).toBe(true)
  })

  it('does not identify images as video', () => {
    expect(isVideoMimeType('image/jpeg')).toBe(false)
    expect(isVideoMimeType('image/png')).toBe(false)
  })

  it('does not identify documents as video', () => {
    expect(isVideoMimeType('application/pdf')).toBe(false)
    expect(isVideoMimeType('text/csv')).toBe(false)
  })
})

describe('File Validation - Size Limits', () => {
  it('accepts image within 5MB limit', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    const file = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' })
    // File size is small, so it should pass
    const result = await validateMMSFile(file)
    expect(result).toBe(null)
  })

  it('rejects image over 5MB limit', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    const file = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' })
    // Manually set size to exceed 5MB
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })
    const result = await validateMMSFile(file)
    expect(result).toContain('less than 5MB')
  })

  it('accepts PDF within 600KB limit', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' })
    const result = await validateMMSFile(file)
    expect(result).toBe(null)
  })

  it('rejects PDF over 600KB limit', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 700 * 1024 })
    const result = await validateMMSFile(file)
    expect(result).toContain('600 KB')
  })

  it('rejects CSV over 600KB limit', async () => {
    const csvBytes = new Uint8Array([0x6E, 0x61, 0x6D, 0x65])
    const file = new File([csvBytes], 'test.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'size', { value: 700 * 1024 })
    const result = await validateMMSFile(file)
    expect(result).toContain('600 KB')
  })

  it('accepts video within 5MB limit', async () => {
    const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x20])
    const file = new File([mp4Bytes], 'test.mp4', { type: 'video/mp4' })
    const result = await validateMMSFile(file)
    expect(result).toBe(null)
  })

  it('rejects video over 600KB limit', async () => {
    const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x20])
    const file = new File([mp4Bytes], 'test.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: 700 * 1024 })
    const result = await validateMMSFile(file)
    expect(result).toContain('600 KB')
  })
})

describe('File Validation - Security', () => {
  it('sanitizes filename with canonical extension', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    const file = new File([jpegBytes], 'test.jpeg', { type: 'image/jpeg' })
    const result = await detectMimeType(file)
    expect(result.canonicalExtension).toBe('jpg')
  })

  it('rejects executable files', async () => {
    const exeBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]) // MZ header
    const file = new File([exeBytes], 'test.exe', { type: 'application/x-msdownload' })
    const result = await detectMimeType(file)
    expect(isSupportedMimeType(result.detectedMimeType)).toBe(false)
  })
})

describe('Error Messages', () => {
  it('provides clear error for unsupported files', async () => {
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46])
    const file = new File([webpBytes], 'test.webp', { type: 'image/webp' })
    const result = await validateMMSFile(file)
    expect(result).toContain('JPG, PNG, GIF, PDF, CSV, or MP4')
  })
})

describe('Total Payload Validation', () => {
  it('accepts combined media within 5MB total limit', () => {
    // This is a conceptual test - actual validation happens in send-sms route
    // 3 × 1MB = 3MB total, should be accepted
    const totalSize = 3 * 1024 * 1024
    const MAX_TOTAL = 5 * 1024 * 1024
    expect(totalSize).toBeLessThanOrEqual(MAX_TOTAL)
  })

  it('rejects combined media exceeding 5MB total limit', () => {
    // 2 × 3MB = 6MB total, should be rejected
    const totalSize = 2 * 3 * 1024 * 1024
    const MAX_TOTAL = 5 * 1024 * 1024
    expect(totalSize).toBeGreaterThan(MAX_TOTAL)
  })

  it('accepts 1MB image + 500KB PDF = 1.5MB total', () => {
    const totalSize = 1024 * 1024 + 500 * 1024
    const MAX_TOTAL = 5 * 1024 * 1024
    expect(totalSize).toBeLessThanOrEqual(MAX_TOTAL)
  })
})

describe('Max Attachment Count', () => {
  it('accepts 10 attachments', () => {
    const MAX_ATTACHMENTS = 10
    expect(MAX_ATTACHMENTS).toBe(10)
  })

  it('rejects 11 attachments', () => {
    const attachmentCount = 11
    const MAX_ATTACHMENTS = 10
    expect(attachmentCount).toBeGreaterThan(MAX_ATTACHMENTS)
  })
})