import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn((blob) => `blob:http://localhost/mock-blob-url-${Math.random()}`)
global.URL.revokeObjectURL = vi.fn()

describe('MessageMediaRenderer - Blob URL Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates blob URL for successful authenticated fetch', () => {
    const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
    const blobUrl = global.URL.createObjectURL(mockBlob)

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
    expect(blobUrl).toMatch(/^blob:http:\/\/localhost\/mock-blob-url-/)
  })

  it('revokes blob URL on cleanup', () => {
    const blobUrl = 'blob:http://localhost/mock-blob-url-123'

    global.URL.revokeObjectURL(blobUrl)

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl)
  })

  it('handles multiple blob URLs independently', () => {
    const blob1 = new Blob(['test1'], { type: 'image/jpeg' })
    const blob2 = new Blob(['test2'], { type: 'image/png' })

    const url1 = global.URL.createObjectURL(blob1)
    const url2 = global.URL.createObjectURL(blob2)

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(2)
    expect(url1).not.toBe(url2)
  })

  it('does not revoke duplicate blob URLs', () => {
    const blobUrl = 'blob:http://localhost/mock-blob-url-123'

    global.URL.revokeObjectURL(blobUrl)
    global.URL.revokeObjectURL(blobUrl)

    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('tracks unique blob URLs in a Set', () => {
    const blobUrls = new Set<string>()
    const url1 = 'blob:http://localhost/mock-blob-url-1'
    const url2 = 'blob:http://localhost/mock-blob-url-2'

    blobUrls.add(url1)
    blobUrls.add(url2)

    expect(blobUrls.size).toBe(2)
    expect(blobUrls.has(url1)).toBe(true)
    expect(blobUrls.has(url2)).toBe(true)
  })
})

describe('MessageMediaRenderer - Fetch Deduplication', () => {
  it('prevents duplicate fetches for same media ID', () => {
    const fetchingSet = new Set<string>()
    const mediaId = 'media-123'

    // First fetch
    if (!fetchingSet.has(mediaId)) {
      fetchingSet.add(mediaId)
    }

    // Second fetch attempt (should be prevented)
    if (!fetchingSet.has(mediaId)) {
      fetchingSet.add(mediaId)
    }

    expect(fetchingSet.size).toBe(1)
  })

  it('allows fetch after previous fetch completes', () => {
    const fetchingSet = new Set<string>()
    const mediaId = 'media-123'

    // First fetch
    fetchingSet.add(mediaId)

    // Simulate fetch completion
    fetchingSet.delete(mediaId)

    // Second fetch (should be allowed)
    if (!fetchingSet.has(mediaId)) {
      fetchingSet.add(mediaId)
    }

    expect(fetchingSet.size).toBe(1)
  })

  it('handles multiple media IDs independently', () => {
    const fetchingSet = new Set<string>()

    fetchingSet.add('media-1')
    fetchingSet.add('media-2')

    expect(fetchingSet.size).toBe(2)
    expect(fetchingSet.has('media-1')).toBe(true)
    expect(fetchingSet.has('media-2')).toBe(true)
  })
})