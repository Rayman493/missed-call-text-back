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

async function saveAndShareNativePdf(blob: Blob, filename: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const base64 = await blobToBase64(blob)

  // Remove any stale copy of this filename before writing a fresh one.
  // This runs BEFORE the share sheet is presented, so it never races the OS
  // while the user is still saving/opening the file.
  await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {})

  // Write to cache so the OS can hand it off. Cache is private and safe for temp PDFs.
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })

  const shareTitle = filename.replace(/\.pdf$/, '')

  // Present the native share sheet. On iOS this enables "Save to Files";
  // on Android it lets the user open/save the file.
  // Only resolve after the share sheet completes so the OS has had its chance
  // to read/copy the file before any future download overwrites the path.
  await Share.share({
    title: shareTitle,
    files: [uri],
    dialogTitle: 'Save or share PDF',
  })

  return true
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
  return true
}

/**
 * Shared delivery abstraction for billing PDFs.
 * Web/desktop: normal browser download.
 * Native Capacitor: write to a cache file and invoke the OS share sheet.
 */
export async function deliverBillingPdf(options: BillingPdfDeliveryOptions) {
  const { documentId, documentNumber, documentType, onStart, onSuccess, onError, onFinally } = options
  const filename = getBillingPdfFilename(documentNumber, documentType)

  onStart?.()
  try {
    const blob = await fetchPdfBlob(documentId)

    if (Capacitor.isNativePlatform()) {
      await saveAndShareNativePdf(blob, filename)
    } else {
      await downloadWebPdf(blob, filename)
    }

    const readyMessage = documentType === 'quote' ? 'Quote ready' : 'Invoice ready'
    onSuccess?.(readyMessage)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to deliver PDF'
    onError?.(message)
  } finally {
    onFinally?.()
  }
}
