/**
 * Storage Lifecycle Management Utility
 *
 * Provides utilities for managing storage lifecycle:
 * - Retention metadata
 * - Storage timestamps
 * - Cleanup-ready structure
 * - Orphan detection helpers
 *
 * This does not automatically delete data - only provides structure for cleanup policies.
 */

export interface StorageMetadata {
  storage_type: 'voicemail' | 'mms_media' | 'transcript' | 'attachment'
  business_id: string
  lead_id?: string
  file_path: string
  file_size_bytes?: number
  created_at: string
  last_accessed_at?: string
  retention_policy?: string
  is_orphan?: boolean
  orphan_reason?: string
}

/**
 * Generate storage metadata for a file
 *
 * Call this when storing files to ensure proper lifecycle tracking.
 */
export function generateStorageMetadata(params: {
  storageType: StorageMetadata['storage_type']
  businessId: string
  leadId?: string
  filePath: string
  fileSizeBytes?: number
}): StorageMetadata {
  return {
    storage_type: params.storageType,
    business_id: params.businessId,
    lead_id: params.leadId,
    file_path: params.filePath,
    file_size_bytes: params.fileSizeBytes,
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  }
}

/**
 * Mark storage as accessed
 *
 * Call this when a file is accessed to update last_accessed_at.
 */
export function markStorageAccessed(metadata: StorageMetadata): StorageMetadata {
  return {
    ...metadata,
    last_accessed_at: new Date().toISOString(),
  }
}

/**
 * Check if storage is orphaned
 *
 * Storage is considered orphaned if:
 * - The business no longer exists
 * - The lead no longer exists (for lead-specific files)
 * - The file has not been accessed in retention period
 */
export function isStorageOrphan(metadata: StorageMetadata, options: {
  businessExists: boolean
  leadExists?: boolean
  retentionDays: number
}): { isOrphan: boolean; reason?: string } {
  // Business doesn't exist
  if (!options.businessExists) {
    return { isOrphan: true, reason: 'Business does not exist' }
  }

  // Lead-specific file but lead doesn't exist
  if (metadata.lead_id && options.leadExists === false) {
    return { isOrphan: true, reason: 'Lead does not exist' }
  }

  // File not accessed in retention period
  const lastAccessed = metadata.last_accessed_at || metadata.created_at
  const retentionDate = new Date()
  retentionDate.setDate(retentionDate.getDate() - options.retentionDays)

  if (new Date(lastAccessed) < retentionDate) {
    return { isOrphan: true, reason: `Not accessed in ${options.retentionDays} days` }
  }

  return { isOrphan: false }
}

/**
 * Get retention policy for storage type
 *
 * Returns recommended retention period in days.
 */
export function getRetentionPolicy(storageType: StorageMetadata['storage_type']): {
  retentionDays: number
  policy: string
} {
  switch (storageType) {
    case 'voicemail':
      return {
        retentionDays: 90,
        policy: 'Voicemails retained for 90 days after last access'
      }
    case 'mms_media':
      return {
        retentionDays: 365,
        policy: 'MMS media retained for 1 year after last access'
      }
    case 'transcript':
      return {
        retentionDays: 365,
        policy: 'Transcripts retained for 1 year after creation'
      }
    case 'attachment':
      return {
        retentionDays: 365,
        policy: 'Attachments retained for 1 year after last access'
      }
    default:
      return {
        retentionDays: 365,
        policy: 'Default retention: 1 year'
      }
  }
}

/**
 * Calculate storage age in days
 */
export function getStorageAgeInDays(metadata: StorageMetadata): number {
  const created = new Date(metadata.created_at)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - created.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Get storage size in human-readable format
 */
export function formatStorageSize(bytes?: number): string {
  if (!bytes) return 'Unknown size'
  
  const kb = bytes / 1024
  const mb = kb / 1024
  const gb = mb / 1024

  if (gb >= 1) return `${gb.toFixed(2)} GB`
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  if (kb >= 1) return `${kb.toFixed(2)} KB`
  return `${bytes} bytes`
}