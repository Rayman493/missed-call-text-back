import { describe, it, expect } from 'vitest'
import { isValidStoragePath } from '@/lib/mms-path-validation'

describe('MMS Media Serve - Path Validation', () => {
  it('rejects empty paths', () => {
    expect(isValidStoragePath('')).toBe(false)
    expect(isValidStoragePath('   ')).toBe(false)
  })

  it('rejects null/undefined paths', () => {
    expect(isValidStoragePath(null as any)).toBe(false)
    expect(isValidStoragePath(undefined as any)).toBe(false)
  })

  it('rejects paths with null bytes', () => {
    expect(isValidStoragePath('business\0file.jpg')).toBe(false)
  })

  it('rejects path traversal with ..', () => {
    expect(isValidStoragePath('../business/file.jpg')).toBe(false)
    expect(isValidStoragePath('business/../file.jpg')).toBe(false)
  })

  it('rejects encoded path traversal', () => {
    expect(isValidStoragePath('%2e%2e/file.jpg')).toBe(false)
    expect(isValidStoragePath('%2E%2E/file.jpg')).toBe(false)
    expect(isValidStoragePath('business/%2e%2e/file.jpg')).toBe(false)
    expect(isValidStoragePath('business/%2E%2E/file.jpg')).toBe(false)
  })

  it('rejects mixed encoded traversal', () => {
    expect(isValidStoragePath('%2e./file.jpg')).toBe(false)
    expect(isValidStoragePath('.%2e/file.jpg')).toBe(false)
  })

  it('rejects encoded slash traversal', () => {
    expect(isValidStoragePath('..%2ffile.jpg')).toBe(false)
    expect(isValidStoragePath('..%2Ffile.jpg')).toBe(false)
    expect(isValidStoragePath('business/..%2ffile.jpg')).toBe(false)
  })

  it('rejects encoded backslash traversal', () => {
    expect(isValidStoragePath('..%5cfile.jpg')).toBe(false)
    expect(isValidStoragePath('..%5Cfile.jpg')).toBe(false)
  })

  it('rejects path traversal with backslash', () => {
    expect(isValidStoragePath('business\\..\\file.jpg')).toBe(false)
    expect(isValidStoragePath('business\\file.jpg')).toBe(false)
  })

  it('rejects paths starting with /', () => {
    expect(isValidStoragePath('/business/file.jpg')).toBe(false)
  })

  it('rejects paths with empty segments', () => {
    expect(isValidStoragePath('business//file.jpg')).toBe(false)
    expect(isValidStoragePath('business/file//sub.jpg')).toBe(false)
  })

  it('rejects paths with . segments', () => {
    expect(isValidStoragePath('business/./file.jpg')).toBe(false)
    expect(isValidStoragePath('./business/file.jpg')).toBe(false)
  })

  it('rejects paths with single segment', () => {
    expect(isValidStoragePath('business')).toBe(false)
  })

  it('rejects paths with empty filename', () => {
    expect(isValidStoragePath('business/')).toBe(false)
    expect(isValidStoragePath('business-123/')).toBe(false)
  })

  it('rejects malformed business IDs', () => {
    expect(isValidStoragePath('inv@lid/file.jpg')).toBe(false)
    expect(isValidStoragePath('inv#lid/file.jpg')).toBe(false)
    expect(isValidStoragePath('inv lid/file.jpg')).toBe(false)
  })

  it('accepts valid UUID business IDs', () => {
    expect(isValidStoragePath('550e8400-e29b-41d4-a716-446655440000/file.jpg')).toBe(true)
    expect(isValidStoragePath('123e4567-e89b-12d3-a456-426614174000/images/photo.png')).toBe(true)
  })

  it('accepts valid alphanumeric business IDs', () => {
    expect(isValidStoragePath('business-123/file.jpg')).toBe(true)
    expect(isValidStoragePath('abc-789/images/photo.jpeg')).toBe(true)
    expect(isValidStoragePath('test123/subfolder/image.png')).toBe(true)
  })
})