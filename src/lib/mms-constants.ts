/**
 * Canonical MMS attachment size limits.
 *
 * Single source of truth for validation, UI copy, and oversize errors.
 */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
export const MAX_DOCUMENT_SIZE = 600 * 1024 // 600 KB
export const MAX_VIDEO_SIZE = 600 * 1024 // 600 KB
export const MAX_TOTAL_PAYLOAD_SIZE = 5 * 1024 * 1024 // 5 MB
export const MAX_ATTACHMENTS = 10

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
export const SUPPORTED_DOCUMENT_TYPES = ['application/pdf', 'text/csv']
export const SUPPORTED_VIDEO_TYPES = ['video/mp4']
export const SUPPORTED_ATTACHMENT_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
]

/** Accept string for HTML file inputs. */
export const FILE_ACCEPT = SUPPORTED_ATTACHMENT_TYPES.join(',') + ',.mp4'

/** Human-readable helper shown in the attachment selector. */
export function attachmentSizeHelperText(): string {
  return `Images up to ${MAX_IMAGE_SIZE / 1024 / 1024} MB • PDFs/CSV/videos up to ${MAX_DOCUMENT_SIZE / 1024} KB • ${MAX_ATTACHMENTS} files total`
}

export function maxSizeForMimeType(mimeType: string): number {
  if (SUPPORTED_DOCUMENT_TYPES.includes(mimeType) || SUPPORTED_VIDEO_TYPES.includes(mimeType)) {
    return MAX_DOCUMENT_SIZE
  }
  return MAX_IMAGE_SIZE
}
