/**
 * Customer detail header — the subtitle under the name must render the SAME
 * canonical current request as Customer Context "Reason for Calling".
 *
 * Regression: a completed AI intake captured "driveway cleaned from the snow"
 * but the header showed "Pressure Washing" — the old title-mapper output
 * (ai-intake-formatter maps /\bdriveway\s*(?:wash|clean)/ → 'Pressure Washing')
 * plus stale stored fields. The header now resolves via the shared
 * getCurrentCustomerContext selector, so latest completed intake wins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCurrentCustomerContext } from '@/lib/customer-context';

const pageClientSrc = readFileSync(
  join(__dirname, '../../app/dashboard/leads/[id]/page-client.tsx'),
  'utf8'
);

const leadWithStaleStoredTitle = {
  id: 'lead-1',
  name: 'Josh Johnson',
  caller_phone: '+14125551234',
  raw_metadata: {
    service: 'Pressure Washing',
    extracted_info: { serviceRequested: 'pressure washing' },
  },
  aiCallRecords: [
    {
      id: 'old-call',
      created_at: '2026-09-01T10:00:00Z',
      completed_at: '2026-09-01T10:08:00Z',
      outcome: 'completed',
      extracted_info: {
        customerName: 'Josh Johnson',
        serviceRequested: 'pressure washing',
        conciseRequestTitle: 'Pressure Washing',
      },
    },
    {
      id: 'new-call',
      created_at: '2026-10-06T20:50:00Z',
      completed_at: '2026-10-06T20:54:00Z',
      outcome: 'completed',
      extracted_info: {
        customerName: 'Josh Johnson',
        serviceRequested: 'driveway cleaned from the snow',
        serviceAddress: '6510 Johnson Road',
      },
    },
  ],
};

describe('customer header canonical request', () => {
  it('latest completed AI intake wins over stale stored/historical values', () => {
    const ctx = getCurrentCustomerContext(leadWithStaleStoredTitle);
    expect(ctx.reasonForCalling).toBe('Driveway cleaned from the snow');
    expect(ctx.customerName).toBe('Josh Johnson');
  });

  it('newer non-completed records do not shadow the last completed intake', () => {
    const lead = {
      ...leadWithStaleStoredTitle,
      aiCallRecords: [
        ...leadWithStaleStoredTitle.aiCallRecords,
        {
          id: 'partial-call',
          created_at: '2026-10-07T00:00:00Z',
          outcome: 'caller_hung_up',
          extracted_info: { serviceRequested: 'gutter cleaning' },
        },
      ],
    };
    expect(getCurrentCustomerContext(lead).reasonForCalling).toBe('Driveway cleaned from the snow');
  });

  it('manual customers (no AI records) still resolve a reason', () => {
    const manual = {
      id: 'm1',
      name: 'Manual Customer',
      source: 'manual',
      raw_metadata: { extracted_info: { serviceRequested: 'fence repair' }, creation_source: 'manual' },
    };
    expect(getCurrentCustomerContext(manual).reasonForCalling).toBe('Fence repair');
  });

  it('header renders the same canonical source as Customer Context Reason for Calling', () => {
    // The header subtitle must use getCurrentCustomerContext(...).reasonForCalling —
    // not getLeadRequestTitle (title mapper can miscategorize, e.g.
    // "driveway cleaned" → "Pressure Washing").
    expect(pageClientSrc).toContain('getCurrentCustomerContext(leadData || lead).reasonForCalling');
    expect(pageClientSrc).toContain('capitalizeFirstAlpha(headerReason)');
    // The old stale chain is gone from the header line
    expect(pageClientSrc).not.toContain(
      "getLeadRequestTitle(leadData || lead) || getLeadAIIntake(leadData || lead).serviceRequested || 'No request'"
    );
  });
});
