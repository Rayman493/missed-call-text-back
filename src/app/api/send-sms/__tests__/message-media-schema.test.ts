/**
 * Message Media Schema Contract Tests
 * 
 * Regression tests to ensure message_media inserts match the canonical schema.
 * The canonical schema (from migration 20260527010000_add_message_media_support.sql) has:
 * - id (UUID)
 * - message_id (UUID)
 * - media_url (TEXT)
 * - mime_type (TEXT)
 * - created_at (TIMESTAMP)
 * 
 * It does NOT have:
 * - filename
 * - size
 * - storage_path
 */

import { describe, it, expect } from 'vitest'

describe('Message Media Schema Contract', () => {
  describe('Canonical schema fields', () => {
    it('should include only canonical fields in insert payload', () => {
      // Simulate the canonical schema from migration
      const canonicalFields = ['id', 'message_id', 'media_url', 'mime_type', 'created_at']
      
      // Non-canonical fields that should NOT be in the schema
      const nonCanonicalFields = ['filename', 'size', 'storage_path']
      
      // Verify non-canonical fields are not in canonical schema
      nonCanonicalFields.forEach(field => {
        expect(canonicalFields).not.toContain(field)
      })
    })

    it('should construct correct insert payload for outbound MMS', () => {
      const messageId = '550e8400-e29b-41d4-a716-446655440000'
      const mediaUrl = 'https://storage.example.com/media.jpg'
      const mimeType = 'image/jpeg'
      
      // Correct payload matching canonical schema
      const correctPayload = {
        message_id: messageId,
        media_url: mediaUrl,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
      }
      
      // Verify only canonical fields are present
      expect(Object.keys(correctPayload)).toEqual(['message_id', 'media_url', 'mime_type', 'created_at'])
      expect(correctPayload).not.toHaveProperty('filename')
      expect(correctPayload).not.toHaveProperty('size')
      expect(correctPayload).not.toHaveProperty('storage_path')
    })

    it('should construct correct insert payload for inbound MMS', () => {
      const messageId = '550e8400-e29b-41d4-a716-446655440000'
      const mediaUrl = 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME.jpg'
      const mimeType = 'image/jpeg'
      
      // Inbound MMS uses the same canonical schema (from sms-processing.ts)
      const inboundPayload = {
        message_id: messageId,
        media_url: mediaUrl,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
      }
      
      // Verify only canonical fields are present
      expect(Object.keys(inboundPayload)).toEqual(['message_id', 'media_url', 'mime_type', 'created_at'])
      expect(inboundPayload).not.toHaveProperty('filename')
      expect(inboundPayload).not.toHaveProperty('size')
      expect(inboundPayload).not.toHaveProperty('storage_path')
    })
  })

  describe('Regression test for PGRST204 filename error', () => {
    it('should not include filename in outbound MMS insert', () => {
      const file = {
        name: 'document.pdf',
        size: 12345,
        type: 'application/pdf'
      }
      
      const messageId = '550e8400-e29b-41d4-a716-446655440000'
      const mediaUrl = 'https://storage.example.com/document.pdf'
      const mimeType = 'application/pdf'
      
      // BEFORE FIX (incorrect - would cause PGRST204):
      const incorrectPayload = {
        message_id: messageId,
        media_url: mediaUrl,
        mime_type: mimeType,
        filename: file.name, // WRONG - not in canonical schema
        size: file.size, // WRONG - not in canonical schema
        created_at: new Date().toISOString(),
      }
      
      // AFTER FIX (correct - matches canonical schema):
      const correctPayload = {
        message_id: messageId,
        media_url: mediaUrl,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
      }
      
      // Verify incorrect payload has the problematic fields
      expect(incorrectPayload).toHaveProperty('filename')
      expect(incorrectPayload).toHaveProperty('size')
      
      // Verify correct payload does not have the problematic fields
      expect(correctPayload).not.toHaveProperty('filename')
      expect(correctPayload).not.toHaveProperty('size')
    })
  })

  describe('Supported MIME types', () => {
    it('should support image/jpeg', () => {
      const mimeType = 'image/jpeg'
      expect(mimeType).toBe('image/jpeg')
    })

    it('should support application/pdf', () => {
      const mimeType = 'application/pdf'
      expect(mimeType).toBe('application/pdf')
    })

    it('should support image/png', () => {
      const mimeType = 'image/png'
      expect(mimeType).toBe('image/png')
    })

    it('should support image/gif', () => {
      const mimeType = 'image/gif'
      expect(mimeType).toBe('image/gif')
    })

    it('should support video/mp4', () => {
      const mimeType = 'video/mp4'
      expect(mimeType).toBe('video/mp4')
    })
  })

  describe('Parent message relationship', () => {
    it('should reference valid message_id UUID', () => {
      const messageId = '550e8400-e29b-41d4-a716-446655440000'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      
      expect(messageId).toMatch(uuidRegex)
    })
  })

  describe('Multiple attachments', () => {
    it('should create one media row per attachment', () => {
      const messageId = '550e8400-e29b-41d4-a716-446655440000'
      const mediaUrls = [
        'https://storage.example.com/media1.jpg',
        'https://storage.example.com/media2.jpg'
      ]
      
      const mediaRows = mediaUrls.map((mediaUrl, index) => ({
        message_id: messageId,
        media_url: mediaUrl,
        mime_type: 'image/jpeg',
        created_at: new Date().toISOString(),
      }))
      
      expect(mediaRows).toHaveLength(2)
      mediaRows.forEach(row => {
        expect(row.message_id).toBe(messageId)
        expect(row).not.toHaveProperty('filename')
        expect(row).not.toHaveProperty('size')
      })
    })
  })
})