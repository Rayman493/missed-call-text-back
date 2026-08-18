/**
 * Provisioning Conflict Diagnostics Tests
 * Tests for diagnostic helper functions used in provisioning
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  getExistingAssignment,
  getAllBusinessAssignments,
  DiagnosticAssignmentSnapshot
} from '../twilio-assignment-helper';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn()
} as any;

describe('Provisioning Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from = vi.fn();
  });

  describe('getAllBusinessAssignments', () => {
    it('should query all rows for a business without status filter', async () => {
      const mockData = [
        {
          id: 'twilio-1',
          business_id: 'business-123',
          phone_number: '+1234567890',
          twilio_sid: 'PN123',
          status: 'assigned',
          sms_status: 'ready',
          provisioning_status: 'ready',
          released_at: null,
          detached_at: null,
          retired_at: null,
          reserved_for_business_id: null,
          reserved_at: null,
          assigned_at: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockResolve = vi.fn().mockResolvedValue({ data: mockData, error: null });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq
      });

      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockResolvedValue({ data: mockData, error: null });

      const result = await getAllBusinessAssignments(mockSupabase, 'business-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('twilio_numbers');
      expect(mockSelect).toHaveBeenCalledWith('id, business_id, phone_number, twilio_sid, status, sms_status, provisioning_status, released_at, detached_at, retired_at, reserved_for_business_id, reserved_at, assigned_at, created_at, updated_at');
      expect(mockEq).toHaveBeenCalledWith('business_id', 'business-123');
      expect(result).toEqual(mockData);
    });

    it('should return null on error', async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      const result = await getAllBusinessAssignments(mockSupabase, 'business-123');

      expect(result).toBeNull();
    });

    it('should select only safe operational columns', async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      await getAllBusinessAssignments(mockSupabase, 'business-123');

      const selectCall = mockSelect.mock.calls[0][0];
      expect(selectCall).toContain('id');
      expect(selectCall).toContain('business_id');
      expect(selectCall).toContain('phone_number');
      expect(selectCall).toContain('twilio_sid');
      expect(selectCall).toContain('status');
      expect(selectCall).toContain('sms_status');
      expect(selectCall).toContain('provisioning_status');
      expect(selectCall).toContain('released_at');
      expect(selectCall).toContain('detached_at');
      expect(selectCall).toContain('retired_at');
      expect(selectCall).toContain('reserved_for_business_id');
      expect(selectCall).toContain('reserved_at');
      expect(selectCall).toContain('assigned_at');
      expect(selectCall).toContain('created_at');
      expect(selectCall).toContain('updated_at');

      // Should NOT contain sensitive columns
      expect(selectCall).not.toContain('auth_token');
      expect(selectCall).not.toContain('stripe_secret');
      expect(selectCall).not.toContain('service_role_key');
    });

    it('should NOT mutate any rows (read-only query)', async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      await getAllBusinessAssignments(mockSupabase, 'business-123');

      // Verify only select is called, no update/insert/delete
      expect(mockSelect).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('getExistingAssignment with diagnostics', () => {
    it('should still use canonical predicate (business_id + status IN assigned/active)', async () => {
      const mockData = {
        id: 'twilio-1',
        phone_number: '+1234567890',
        twilio_sid: 'PN123',
        status: 'assigned',
        sms_status: 'ready',
        provisioning_status: 'ready'
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockIn = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        in: mockIn,
        maybeSingle: mockMaybeSingle
      });

      const result = await getExistingAssignment(mockSupabase, 'business-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('twilio_numbers');
      expect(mockSelect).toHaveBeenCalledWith('id, phone_number, twilio_sid, status, sms_status, provisioning_status');
      expect(mockEq).toHaveBeenCalledWith('business_id', 'business-123');
      expect(mockIn).toHaveBeenCalledWith('status', ['assigned', 'active']);
      expect(mockMaybeSingle).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });

    it('should log active query result for diagnostics', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      const mockIn = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        in: mockIn,
        maybeSingle: mockMaybeSingle
      });

      await getExistingAssignment(mockSupabase, 'business-123');

      // Verify diagnostic logging occurred
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[AssignmentHelper] ACTIVE QUERY RESULT',
        expect.objectContaining({
          businessId: 'business-123',
          dataFound: false,
          errorPresent: true,
          errorCode: 'PGRST116'
        })
      );

      consoleLogSpy.mockRestore();
    });
  });
});