const { expect } = require('chai');
const { persistAiCallConversationMessages } = require('../src/lib/persist-ai-messages');

interface FakeRow {
  id?: string;
  conversation_id: string;
  message_type: string;
  created_at?: string;
  body?: string;
}

function createFakeSupabase(existing: FakeRow[] = [], insertError?: any) {
  const rows = [...existing];
  return {
    from(table: string) {
      const q: { table: string; conditions: { key: string; value: any; op?: string }[] } = {
        table,
        conditions: [],
      };
      const self = {
        select(..._args: any[]) {
          return self;
        },
        eq(key: string, value: any) {
          q.conditions.push({ key, value });
          return self;
        },
        gte(key: string, value: any) {
          q.conditions.push({ key, value, op: 'gte' });
          return self;
        },
        maybeSingle: async () => {
          const now = Date.now();
          const match = rows.find((r) => {
            // Check conversation_id and message_type
            const matchesConversation = q.conditions.some(c => c.key === 'conversation_id' && c.value === r.conversation_id);
            const matchesType = q.conditions.some(c => c.key === 'message_type' && c.value === r.message_type);
            // Check time window (created_at >= oneHourAgo)
            const gteCondition = q.conditions.find(c => c.op === 'gte');
            let matchesTime = true;
            if (gteCondition && r.created_at) {
              const rowTime = new Date(r.created_at).getTime();
              const oneHourAgo = now - 60 * 60 * 1000;
              matchesTime = rowTime >= oneHourAgo;
            }
            return matchesConversation && matchesType && matchesTime;
          });
          if (match) return { data: match, error: null };
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        },
        single: async () => {
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        },
        insert: (payload: any) => {
          return {
            select: (..._args: any[]) => {
              return {
                single: async () => {
                  if (insertError) {
                    return { data: null, error: insertError };
                  }
                  const newRow = { ...payload, id: 'new-id-' + Math.random() };
                  rows.push(newRow);
                  return {
                    data: { id: newRow.id, message_type: payload.message_type, conversation_id: payload.conversation_id },
                    error: null
                  };
                }
              };
            }
          };
        },
      };
      return self;
    },
    get rows() {
      return rows;
    },
  };
}

describe('persistAiCallConversationMessages', () => {
  it('inserts summary and transcript rows with only valid public.messages columns', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: 'AI summary',
      transcript: 'Assistant: hi\nCaller: hello',
      extractedFields: { customerName: 'Ryan' },
    });

    expect(result.summary.status).to.equal('inserted');
    expect(result.transcript.status).to.equal('inserted');
    expect(supabase.rows).to.have.length(2);

    const summary = supabase.rows.find((r: any) => r.message_type === 'summary');
    const transcript = supabase.rows.find((r: any) => r.message_type === 'transcript');

    expect(summary.body).to.equal('AI summary');
    expect(summary.direction).to.equal('outbound');
    expect(summary.from_phone).to.equal('+15551234567');
    expect(summary.to_phone).to.equal('+15559876543');
    expect(summary.twilio_message_sid).to.equal(null);
    expect(summary.status).to.equal(null);
    expect(summary.media_count).to.equal(0);
    expect(summary).to.not.have.property('structured_data');
    expect(summary).to.not.have.property('sender');
    expect(summary).to.not.have.property('content');
    expect(summary).to.not.have.property('business_id');

    expect(transcript.body).to.equal('Assistant: hi\nCaller: hello');
    expect(transcript.direction).to.equal('inbound');
    expect(transcript.from_phone).to.equal('+15551234567');
    expect(transcript.to_phone).to.equal('+15559876543');
    expect(transcript.twilio_message_sid).to.equal(null);
    expect(transcript.status).to.equal(null);
    expect(transcript.media_count).to.equal(0);
    expect(transcript).to.not.have.property('structured_data');
  });

  it('deduplicates by conversation_id and message_type within time window', async () => {
    const oneHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const existing: FakeRow[] = [
      {
        id: 'existing-summary',
        conversation_id: 'conv-1',
        message_type: 'summary',
        created_at: oneHourAgo,
      },
      {
        id: 'existing-transcript',
        conversation_id: 'conv-1',
        message_type: 'transcript',
        created_at: oneHourAgo,
      },
    ];
    const supabase = createFakeSupabase(existing) as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: 'AI summary',
      transcript: 'Assistant: hi\nCaller: hello',
    });

    expect(result.summary.status).to.equal('already_exists');
    expect(result.transcript.status).to.equal('already_exists');
    expect(supabase.rows).to.have.length(2);
  });

  it('inserts when no existing message of same type in conversation within time window', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const existing: FakeRow[] = [
      {
        id: 'old-summary',
        conversation_id: 'conv-1',
        message_type: 'summary',
        created_at: twoHoursAgo,
      },
    ];
    const supabase = createFakeSupabase(existing) as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA456',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: 'New summary',
      transcript: 'New transcript',
    });

    expect(result.summary.status).to.equal('inserted');
    expect(result.transcript.status).to.equal('inserted');
    expect(supabase.rows).to.have.length(3);
  });

  it('skips blank summary and transcript bodies', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: '',
      transcript: '',
    });

    expect(result.summary.status).to.equal('skipped');
    expect(result.transcript.status).to.equal('skipped');
    expect(supabase.rows).to.have.length(0);
  });

  it('surfaces insert errors with full diagnostics', async () => {
    const insertError = {
      code: '23505',
      message: 'unique constraint violation',
      hint: 'Check your data',
      details: 'Constraint violation on messages_twilio_message_sid_unique',
    };
    const supabase = createFakeSupabase([], insertError) as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: 'AI summary',
      transcript: 'Transcript',
    });

    expect(result.summary.status).to.equal('failed');
    expect(result.transcript.status).to.equal('failed');
    expect(result.summary.errorCode).to.equal('23505');
    expect(result.summary.errorMessage).to.equal('unique constraint violation');
    expect(result.summary.errorHint).to.equal('Check your data');
    expect(result.summary.errorDetails).to.include('Constraint violation');
  });

  it('fails gracefully when required IDs are missing', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: '',
      leadId: 'lead-1',
      fromPhone: '+15551234567',
      toPhone: '+15559876543',
      summary: 'AI summary',
      transcript: 'Transcript',
    });

    expect(result.summary.status).to.equal('failed');
    expect(result.transcript.status).to.equal('failed');
    expect(supabase.rows).to.have.length(0);
  });

  it('fails gracefully when from_phone or to_phone are missing', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      fromPhone: '',
      toPhone: '+15559876543',
      summary: 'AI summary',
      transcript: 'Transcript',
    });

    expect(result.summary.status).to.equal('failed');
    expect(result.transcript.status).to.equal('failed');
    expect(supabase.rows).to.have.length(0);
  });
});