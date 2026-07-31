/**
 * MIME Detection Utility
 * Detects actual MIME type from file magic bytes (file signature)
 * to prevent mislabeled files from causing issues with Twilio MMS
 */

export interface MimeTypeDetection {
  detectedMimeType: string
  canonicalExtension: string
  byteSignatureValid: boolean
  signature: string
}

// Magic byte signatures
const SIGNATURES: Record<string, { signature: number[]; mimeType: string; extension: string }> = {
  PNG: {
    signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    mimeType: 'image/png',
    extension: 'png'
  },
  JPEG: {
    signature: [0xFF, 0xD8, 0xFF],
    mimeType: 'image/jpeg',
    extension: 'jpg'
  },
  GIF: {
    signature: [0x47, 0x49, 0x46, 0x38],
    mimeType: 'image/gif',
    extension: 'gif'
  },
  WEBP: {
    signature: [0x52, 0x49, 0x46, 0x46],
    mimeType: 'image/webp',
    extension: 'webp'
  },
  BMP: {
    signature: [0x42, 0x4D],
    mimeType: 'image/bmp',
    extension: 'bmp'
  }
}

/**
 * Detect MIME type from file bytes
 */
export async function detectMimeType(file: File): Promise<MimeTypeDetection> {
  // Read first 16 bytes for signature detection
  const buffer = await file.slice(0, 16).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  
  // Convert to hex string for logging
  const signatureHex = Array.from(bytes.slice(0, 12))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
  
  // Check against known signatures
  for (const [name, info] of Object.entries(SIGNATURES)) {
    if (bytes.length >= info.signature.length) {
      const matches = info.signature.every((byte, index) => bytes[index] === byte)
      if (matches) {
        return {
          detectedMimeType: info.mimeType,
          canonicalExtension: info.extension,
          byteSignatureValid: true,
          signature: signatureHex
        }
      }
    }
  }
  
  // Special check for WebP (RIFF....WEBP)
  if (bytes.length >= 12) {
    const isRIFF = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    const isWEBP = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    if (isRIFF && isWEBP) {
      return {
        detectedMimeType: 'image/webp',
        canonicalExtension: 'webp',
        byteSignatureValid: true,
        signature: signatureHex
      }
    }
  }
  
  // Unknown signature - return the reported type but mark as invalid
  return {
    detectedMimeType: file.type || 'application/octet-stream',
    canonicalExtension: getExtensionFromFilename(file.name),
    byteSignatureValid: false,
    signature: signatureHex
  }
}

/**
 * Get extension from filename
 */
function getExtensionFromFilename(filename: string): string {
  const match = filename.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : 'bin'
}

/**
 * Check if MIME type is supported by Twilio MMS
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
  return supportedTypes.includes(mimeType.toLowerCase())
}

/**
 * Validate file for MMS upload
 * Returns error message if invalid, null if valid
 */
export async function validateMMSFile(file: File): Promise<string | null> {
  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    return 'Image must be less than 5MB'
  }
  
  // Detect actual MIME type from bytes
  const detection = await detectMimeType(file)
  
  console.log('[MIME Detection] File analysis:', {
    filename: file.name,
    reportedType: file.type,
    reportedSize: file.size,
    detectedType: detection.detectedMimeType,
    extension: detection.canonicalExtension,
    signatureValid: detection.byteSignatureValid,
    signature: detection.signature
  })
  
  // Check if detected type is supported
  if (!isSupportedMimeType(detection.detectedMimeType)) {
    if (detection.detectedMimeType === 'image/webp') {
      return 'WEBP images are not supported for MMS. Please upload a JPG or PNG.'
    }
    return `Unsupported image format: ${detection.detectedMimeType}. Please use JPG, PNG, or GIF.`
  }
  
  // Check if reported type matches detected type
  if (file.type && detection.byteSignatureValid) {
    const normalizedReported = file.type.toLowerCase()
    const normalizedDetected = detection.detectedMimeType.toLowerCase()
    
    if (normalizedReported !== normalizedDetected) {
      console.warn('[MIME Detection] Type mismatch detected:', {
        filename: file.name,
        reported: file.type,
        detected: detection.detectedMimeType
      })
    }
  }
  
  return null
}