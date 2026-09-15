import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/browser'

export interface BillingPdfDeliveryOptions {
  documentId: string
  documentNumber: string
  documentType: 'quote' | 'invoice'
  onStart?: () => void
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
  onFinally?: () => void
}

export function getBillingPdfFilename(documentNumber: string, documentType: 'quote' | 'invoice') {
  const sanitized = documentNumber.replace(/[^a-zA-Z0-9-_]/g, '')
  return documentType === 'quote'
    ? `Quote-${sanitized}.pdf`
    : `Invoice-${sanitized}.pdf`
}

async function fetchPdfBlob(documentId: string): Promise<Blob> {
  const supabase = createBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {}
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const res = await fetch(`/api/billing-documents/${documentId}/pdf`, { headers })
  if (!res.ok) {
    throw new Error('Failed to download PDF')
  }
  return res.blob()
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result?.split(',')[1]
      if (!base64) {
        reject(new Error('Failed to encode PDF'))
      } else {
        resolve(base64)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read PDF'))
    reader.readAsDataURL(blob)
  })
}

async function getFilesystemAndShare() {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  return { Filesystem, Directory, Share }
}

/**
 * Android: attempt a true public Documents save.
 * Requires the publicStorage permission. If the permission is not granted or
 * the write fails, fall back to cache + share so the user still has a path.
 */
async function saveAndroidPdf(blob: Blob, filename: string) {
  const { Filesystem, Directory, Share } = await getFilesystemAndShare()
  const base64 = await blobToBase64(blob)

  const permission = await Filesystem.requestPermissions().catch(() => ({ publicStorage: 'denied' } as any))

  if (permission?.publicStorage === 'granted') {
    try {
      await Filesystem.deleteFile({ path: filename, directory: Directory.Documents }).catch(() => {})
      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
      })
      return { saved: true, message: `${filename} saved to Documents`, uri }
    } catch (docErr) {
      console.error('[Android PDF] Documents write failed:', docErr)
    }
  }

  // Fallback: cache + share so the user can choose where to put it.
  await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {})
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
  const shareTitle = filename.replace(/\.pdf$/, '')
  await Share.share({
    title: shareTitle,
    files: [uri],
    dialogTitle: 'Save PDF to Files',
  })
  return { saved: false, message: 'PDF ready to save', uri }
}

/**
 * iOS: the app cannot write to a public user-visible location directly.
 * Write the PDF to the app Documents directory and present the OS share sheet
 * with "Save to Files" as the canonical handoff.
 */
async function saveIosPdf(blob: Blob, filename: string) {
  const { Filesystem, Directory, Share } = await getFilesystemAndShare()
  const base64 = await blobToBase64(blob)

  await Filesystem.deleteFile({ path: filename, directory: Directory.Documents }).catch(() => {})
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
  })

  const shareTitle = filename.replace(/\.pdf$/, '')
  await Share.share({
    title: shareTitle,
    files: [uri],
    dialogTitle: 'Save PDF to Files',
  })

  return 'PDF ready to save'
}

async function downloadWebPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
  return `${filename} downloaded`
}

/**
 * Shared delivery abstraction for billing PDFs.
 *
 * Web/desktop: normal browser download.
 * Android: attempts a true public Documents save; falls back to cache + share.
 * iOS: writes to app Documents, then presents the OS share/save sheet.
 */
export async function deliverBillingPdf(options: BillingPdfDeliveryOptions) {
  const { documentId, documentNumber, documentType, onStart, onSuccess, onError, onFinally } = options
  const filename = getBillingPdfFilename(documentNumber, documentType)

  onStart?.()
  try {
    const blob = await fetchPdfBlob(documentId)

    let message: string
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform()
      if (platform === 'android') {
        const result = await saveAndroidPdf(blob, filename)
        message = result.message
      } else {
        message = await saveIosPdf(blob, filename)
      }
    } else {
      message = await downloadWebPdf(blob, filename)
    }

    onSuccess?.(message)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to deliver PDF'
    onError?.(message)
  } finally {
    onFinally?.()
  }
}
