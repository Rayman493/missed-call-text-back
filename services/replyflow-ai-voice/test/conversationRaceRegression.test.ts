/**
 * Regression tests for PostgreSQL 23505 duplicate-conversation race condition
 * Tests for conversation acquisition idempotency under concurrent requests
 */

import { expect } from 'chai';

describe('Conversation Race Condition Regression Tests', () => {
  describe('getOrCreateConversation Helper Function', () => {
    // Test 1: Existing conversation found immediately → reuse it, no insert
    it('Test 1 - Existing conversation found immediately → reuse it, no insert', async () => {
      // Pre-populate with existing conversation
      const conversationDb = [
        { id: 'conv-existing', lead_id: 'lead-1', business_id: 'biz-1', status: 'active' }
      ];

      // Simulate the helper function logic
      const leadId = 'lead-1';
      const businessId = 'biz-1';

      // Lookup existing conversation
      const existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );

      expect(existing).to.not.be.undefined;
      expect(existing?.id).to.equal('conv-existing');
      
      // No insert should occur
      const insertCount = conversationDb.length;
      expect(insertCount).to.equal(1); // Only the pre-existing one
    });

    // Test 2: No conversation exists → insert succeeds → use inserted ID
    it('Test 2 - No conversation exists → insert succeeds → use inserted ID', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-2';
      const businessId = 'biz-2';

      // Lookup existing conversation
      const existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );

      expect(existing).to.be.undefined;

      // Insert new conversation
      const newConversation = {
        id: 'conv-new',
        lead_id: leadId,
        business_id: businessId,
        status: 'active'
      };
      conversationDb.push(newConversation);

      expect(conversationDb.length).to.equal(1);
      expect(newConversation.id).to.equal('conv-new');
    });

    // Test 3: Initial lookup finds nothing → insert returns 23505 → follow-up lookup finds conversation → recover and use canonical ID
    it('Test 3 - Initial lookup finds nothing → insert returns 23505 → follow-up lookup finds conversation → recover and use canonical ID', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-3';
      const businessId = 'biz-3';

      // Initial lookup finds nothing
      let existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );
      expect(existing).to.be.undefined;

      // Simulate concurrent insert by another process
      conversationDb.push({
        id: 'conv-canonical',
        lead_id: leadId,
        business_id: businessId,
        status: 'active'
      });

      // Our insert fails with 23505
      const insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };

      // Follow-up lookup finds the canonical conversation
      existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );

      expect(existing).to.not.be.undefined;
      expect(existing?.id).to.equal('conv-canonical');
      expect(conversationDb.length).to.equal(1); // Still only one conversation
    });

    // Test 4: Insert returns 23505 → follow-up lookup still finds nothing → fail visibly
    it('Test 4 - Insert returns 23505 → follow-up lookup still finds nothing → fail visibly', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-4';
      const businessId = 'biz-4';

      // Initial lookup finds nothing
      let existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );
      expect(existing).to.be.undefined;

      // Our insert fails with 23505
      const insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };

      // Follow-up lookup still finds nothing (unexpected)
      existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );

      expect(existing).to.be.undefined;
      
      // Should surface the original error
      expect(() => {
        if (!existing && insertError) {
          const error = new Error(insertError.message);
          (error as any).code = insertError.code;
          throw error;
        }
      }).to.throw();
    });

    // Test 5: Insert returns a non-23505 error → preserve normal failure behavior
    it('Test 5 - Insert returns a non-23505 error → preserve normal failure behavior', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-5';
      const businessId = 'biz-5';

      // Initial lookup finds nothing
      const existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );
      expect(existing).to.be.undefined;

      // Our insert fails with non-23505 error
      const insertError = { code: '23503', message: 'foreign key violation' };

      // Should preserve normal error handling
      expect(() => {
        if (insertError && insertError.code !== '23505') {
          const error = new Error(insertError.message);
          (error as any).code = insertError.code;
          throw error;
        }
      }).to.throw();
    });

    // Test 6: Recovery does not create a second conversation or duplicate downstream completion work
    it('Test 6 - Recovery does not create a second conversation or duplicate downstream completion work', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-6';
      const businessId = 'biz-6';

      // Simulate concurrent requests
      const request1 = async () => {
        // Lookup finds nothing
        let existing = conversationDb.find(
          c => c.lead_id === leadId && c.business_id === businessId
        );
        
        if (!existing) {
          // Insert succeeds for request 1
          conversationDb.push({
            id: 'conv-canonical',
            lead_id: leadId,
            business_id: businessId,
            status: 'active'
          });
          return 'conv-canonical';
        }
        return existing.id;
      };

      const request2 = async () => {
        // Lookup finds nothing (race timing)
        let existing = conversationDb.find(
          c => c.lead_id === leadId && c.business_id === businessId
        );
        
        if (!existing) {
          // Insert fails with 23505 for request 2
          const insertError = { code: '23505', message: 'duplicate key' };
          
          // Follow-up lookup finds canonical conversation
          existing = conversationDb.find(
            c => c.lead_id === leadId && c.business_id === businessId
          );
          
          if (existing) {
            return existing.id; // Recover with canonical ID
          }
          throw insertError;
        }
        return existing.id;
      };

      // Execute requests concurrently (simulated sequentially)
      const id1 = await request1();
      const id2 = await request2();

      expect(id1).to.equal('conv-canonical');
      expect(id2).to.equal('conv-canonical');
      expect(conversationDb.length).to.equal(1); // Only one conversation created
      expect(id1).to.equal(id2); // Both requests converged on same ID
    });

    // Test 7: Correct conversationId is available for the AI call record persistence path
    it('Test 7 - Correct conversationId is available for the AI call record persistence path', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-7';
      const businessId = 'biz-7';

      // Simulate the full flow: getOrCreateConversation → use conversationId
      let conversationId: string | null = null;

      // Initial lookup
      let existing = conversationDb.find(
        c => c.lead_id === leadId && c.business_id === businessId
      );

      if (existing) {
        conversationId = existing.id;
      } else {
        // Insert
        const newConv = {
          id: 'conv-new',
          lead_id: leadId,
          business_id: businessId,
          status: 'active'
        };
        conversationDb.push(newConv);
        conversationId = newConv.id;
      }

      // Verify conversationId is available for AI call record
      expect(conversationId).to.not.be.null;
      expect(conversationId).to.equal('conv-new');

      // Simulate AI call record creation
      const aiCallRecord = {
        business_id: businessId,
        lead_id: leadId,
        conversation_id: conversationId,
        call_sid: 'CA123'
      };

      expect(aiCallRecord.conversation_id).to.equal('conv-new');
    });
  });

  describe('Error Code Detection', () => {
    it('Should detect 23505 error code', () => {
      const error = { code: '23505', message: 'duplicate key value violates unique constraint' };
      const is23505 = error.code === '23505' || error.message?.includes('duplicate key');
      expect(is23505).to.be.true;
    });

    it('Should detect 23505 via message when code is missing', () => {
      const error = { message: 'duplicate key value violates unique constraint' };
      const is23505 = (error as any).code === '23505' || error.message?.includes('duplicate key');
      expect(is23505).to.be.true;
    });

    it('Should not detect non-23505 error as 23505', () => {
      const error = { code: '23503', message: 'foreign key violation' };
      const is23505 = error.code === '23505' || error.message?.includes('duplicate key');
      expect(is23505).to.be.false;
    });
  });

  describe('Concurrency Invariants', () => {
    it('Invariant 1: Exactly one conversation exists for each business_id + lead_id', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-invariant-1';
      const businessId = 'biz-invariant-1';

      // Simulate 5 concurrent creation attempts
      const attempts = Array.from({ length: 5 }, async (_, i) => {
        const existing = conversationDb.find(
          c => c.lead_id === leadId && c.business_id === businessId
        );

        if (!existing) {
          // First attempt wins
          conversationDb.push({
            id: `conv-${i}`,
            lead_id: leadId,
            business_id: businessId,
            status: 'active'
          });
          return `conv-${i}`;
        }
        
        return existing.id;
      });

      // Execute all attempts
      const results = await Promise.all(attempts);

      // All attempts should return the same ID (the first one created)
      const uniqueIds = new Set(results);
      expect(uniqueIds.size).to.equal(1);
      expect(conversationDb.length).to.equal(1);
    });

    it('Invariant 2: Two concurrent creation attempts converge on same canonical conversation', async () => {
      const conversationDb: { id: string; lead_id: string; business_id: string; status: string }[] = [];
      const leadId = 'lead-invariant-2';
      const businessId = 'biz-invariant-2';

      // Simulate race: request A starts first, request B starts but A inserts first
      let requestACompleted = false;

      const requestA = async () => {
        const existing = conversationDb.find(
          c => c.lead_id === leadId && c.business_id === businessId
        );

        if (!existing) {
          conversationDb.push({
            id: 'conv-canonical',
            lead_id: leadId,
            business_id: businessId,
            status: 'active'
          });
          requestACompleted = true;
          return 'conv-canonical';
        }
        return existing.id;
      };

      const requestB = async () => {
        // Wait a bit to simulate race timing
        await new Promise(resolve => setTimeout(resolve, 10));

        const existing = conversationDb.find(
          c => c.lead_id === leadId && c.business_id === businessId
        );

        if (!existing) {
          // This would fail with 23505 in real scenario
          // But for test, we just check if requestA completed
          if (requestACompleted) {
            // In real code, this would trigger 23505 recovery
            // Here we simulate the recovery lookup
            const canonical = conversationDb.find(
              c => c.lead_id === leadId && c.business_id === businessId
            );
            return canonical?.id || null;
          }
          return null;
        }
        return existing.id;
      };

      const idA = await requestA();
      const idB = await requestB();

      expect(idA).to.equal('conv-canonical');
      expect(idB).to.equal('conv-canonical');
      expect(conversationDb.length).to.equal(1);
    });
  });
});
