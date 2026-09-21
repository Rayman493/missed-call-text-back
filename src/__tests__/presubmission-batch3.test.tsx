import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Native-platform simulation: convertFileSrc maps file:/// URIs to WebView URLs
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    convertFileSrc: (p: string) => `https://localhost/_capacitor_file_/${encodeURIComponent(p)}`,
  },
}))
vi.mock('@capacitor/camera', () => ({
  Camera: { takePhoto: vi.fn() },
}))

import { mediaResultToFile, isCameraCancel } from '@/components/conversation/AttachmentActionSheet'
import { getDisplayFilename } from '@/components/MessageMediaRenderer'
import { mergeMessageWithMonotonicity } from '@/lib/message-merge'

const jpegResponse = () => new Response(new Blob(['fake-jpeg-bytes']), {
  status: 200,
  headers: { 'Content-Type': 'image/jpeg' },
})

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('B3 — camera MediaResult normalization', () => {
  it('native uri is converted via convertFileSrc and fetched into a File', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jpegResponse())
    const file = await mediaResultToFile({ uri: 'file:///data/photo.jpg' })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const calledUrl = (fetchSpy.mock.calls[0][0] as string)
    expect(calledUrl).toContain('/_capacitor_file_/')
    expect(file).not.toBeNull()
    expect(file!.type).toBe('image/jpeg')
    expect(file!.name).toMatch(/^photo_\d+\.jpg$/)
    expect(file!.size).toBeGreaterThan(0)
  })

  it('webPath-only result (web/native without uri) is fetched directly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['png']), { status: 200, headers: { 'Content-Type': 'image/png' } })
    )
    const file = await mediaResultToFile({ webPath: 'https://localhost/img.png' })
    expect(fetchSpy).toHaveBeenCalledWith('https://localhost/img.png')
    expect(file!.type).toBe('image/png')
    expect(file!.name).toMatch(/^photo_\d+\.png$/)
  })

  it('falls back to metadata.format when blob type is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, blob: async () => new Blob(['x']) } as unknown as Response
    )
    const file = await mediaResultToFile({ webPath: 'https://x/img', metadata: { format: 'png' } })
    expect(file!.type).toBe('image/png')
    expect(file!.name).toMatch(/\.png$/)
  })

  it('no usable url → null (no phantom attachment)', async () => {
    const file = await mediaResultToFile({})
    expect(file).toBeNull()
  })

  it('failed fetch → null, no File produced', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    expect(await mediaResultToFile({ uri: 'file:///x.jpg' })).toBeNull()
  })

  it('empty blob → null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, blob: async () => ({ size: 0, type: '' }) } as unknown as Response
    )
    expect(await mediaResultToFile({ uri: 'file:///x.jpg' })).toBeNull()
  })
})

describe('B3 — camera cancel semantics', () => {
  it('recognizes plugin cancellation rejection', () => {
    expect(isCameraCancel(new Error('User cancelled photos app'))).toBe(true)
    expect(isCameraCancel({ message: 'User cancelled photos app' })).toBe(true)
  })
  it('does not treat real errors as cancel', () => {
    expect(isCameraCancel(new Error('Camera permission denied'))).toBe(false)
    expect(isCameraCancel(new Error('fetch failed'))).toBe(false)
    expect(isCameraCancel(null)).toBe(false)
  })
})

describe('B3 — attachment display names', () => {
  const base = { id: 'm1', message_id: 'msg1', media_url: '', mime_type: 'application/pdf', created_at: '' }

  it('prefers a meaningful persisted filename', () => {
    expect(getDisplayFilename({ ...base, filename: 'invoice-march.pdf' })).toBe('invoice-march.pdf')
  })

  it('UUID-only filename gets a semantic fallback, not the raw UUID', () => {
    const name = getDisplayFilename({
      ...base,
      filename: 'b3f1c2a4-1111-4222-8333-9abcdef01234.pdf',
    })
    expect(name).toBe('Document.pdf')
    expect(name).not.toContain('b3f1c2a4')
  })

  it('missing filename never falls back to the URL tail', () => {
    const name = getDisplayFilename({
      ...base,
      media_url: 'https://x.supabase.co/storage/v1/object/sign/mms-media/9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c.bin',
    })
    expect(name).toBe('Document.pdf')
  })

  it('recovers the original name embedded in our signed storage path', () => {
    const name = getDisplayFilename({
      ...base,
      media_url: 'https://app.replyflowhq.com/api/mms-media/serve?path=biz/lead/1720000000000-abc123def-receipt%20final.pdf&token=x.y.z',
    })
    expect(name).toBe('receipt final.pdf')
  })

  it('image mime without filename → Photo', () => {
    expect(getDisplayFilename({ ...base, mime_type: 'image/jpeg' })).toBe('Photo')
  })

  it('long filenames are truncated with extension preserved', () => {
    const name = getDisplayFilename({
      ...base,
      filename: 'a-very-long-original-customer-filename-that-keeps-going.pdf',
    })
    expect(name.length).toBeLessThanOrEqual(30)
    expect(name.endsWith('.pdf')).toBe(true)
  })
})

describe('B3 — optimistic/realtime dedup', () => {
  it('server message with same clientMessageId replaces the optimistic row', () => {
    const optimistic = {
      id: 'cmid-1', clientMessageId: 'cmid-1', direction: 'outbound',
      body: 'hi', status: 'sending', isOptimistic: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    const persisted = {
      id: 'real-uuid', client_message_id: 'cmid-1', direction: 'outbound',
      body: 'hi', status: 'sent', created_at: '2026-01-01T00:00:01Z',
    }
    const merged = mergeMessageWithMonotonicity([optimistic], persisted, 'test')
    expect(merged.length).toBe(1)
    expect(merged[0].id).toBe('real-uuid')
    expect(merged[0].isOptimistic).toBe(false)
  })

  it('same message arriving twice does not duplicate', () => {
    const msg = { id: 'real-uuid', direction: 'outbound', body: 'x', status: 'sent', created_at: '2026-01-01T00:00:00Z' }
    const once = mergeMessageWithMonotonicity([], msg, 'test')
    const twice = mergeMessageWithMonotonicity(once, { ...msg }, 'test')
    expect(twice.length).toBe(1)
  })
})

describe('B3 — media settle wiring (source contract)', () => {
  const fs = require('fs')
  const rendererSrc = fs.readFileSync('src/components/MessageMediaRenderer.tsx', 'utf8')
  const pageSrc = fs.readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('every media load notifies the parent (not just the first)', () => {
    expect(rendererSrc).not.toContain('if (!hasLoadedFirstImage && onImageLoad)')
    expect(rendererSrc).toContain('onImageLoad()')
  })

  it('video metadata load participates in settle', () => {
    expect(rendererSrc).toContain('onLoadedMetadata')
  })

  it('outgoing media still force-anchors via outgoingMediaAnchorRef', () => {
    expect(pageSrc).toContain('outgoingMediaAnchorRef.current = true')
    expect(pageSrc).toContain("scrollToBottom('auto', true)")
  })

  it('inbound settle stays gated on followLatestRef via canonical reconciler', () => {
    expect(pageSrc).toContain("reconcileConversationBottom('inbound-image-load')")
    expect(pageSrc).toContain('if (!followLatestRef.current)')
  })
})
