const { expect } = require('chai');
const { persistAiCallConversationMessages } = require('../src/lib/persist-ai-messages');

interface FakeRow {
  id?: string;
  conversation_id: string;
  message_type: string;
  structured_data?: { call_sid?: string };
  body?: string;
}

function createFakeSupabase(existing: FakeRow[] = [], insertError?: string) {
  const rows = [...existing];
  return {
    from(table: string) {
      const q: { table: string; conditions: { key: string; value: any }[]; mode: string | null } = {
        table,
        conditions: [],
        mode: null,
      };
      const self = {
        select(..._args: any[]) {
          q.mode = 'select';
          return self;
        },
        eq(key: string, value: any) {
          q.conditions.push({ key, value });
          return self;
        },
        maybeSingle: async () => {
          const match = rows.find((r) =>
            q.conditions.every((c) => {
              if (c.key === 'structured_data->>call_sid') {
                return r.structured_data?.call_sid === c.value;
              }
              return (r as any)[c.key] === c.value;
            })
          );
          if (match) return { data: match, error: null };
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        },
        insert: async (payload: any) => {
          if (insertError) {
            return { error: { code: '23505', message: insertError } };
          }
          rows.push(payload);
          return { error: null };
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
  it('inserts summary and transcript rows when none exist', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      businessId: 'biz-1',
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
    expect(summary.sender).to.equal('ai');
    expect(summary.structured_data.call_sid).to.equal('CA123');
    expect(summary.structured_data.customerName).to.equal('Ryan');

    expect(transcript.body).to.equal('Assistant: hi\nCaller: hello');
    expect(transcript.direction).to.equal('inbound');
    expect(transcript.sender).to.equal('caller');
    expect(transcript.structured_data.call_sid).to.equal('CA123');
  });

  it('skips duplicate messages for the same call SID', async () => {
    const existing: FakeRow[] = [
      {
        id: 'existing-summary',
        conversation_id: 'conv-1',
        message_type: 'summary',
        structured_data: { call_sid: 'CA123' },
      },
      {
        id: 'existing-transcript',
        conversation_id: 'conv-1',
        message_type: 'transcript',
        structured_data: { call_sid: 'CA123' },
      },
    ];
    const supabase = createFakeSupabase(existing) as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      businessId: 'biz-1',
      summary: 'AI summary',
      transcript: 'Assistant: hi\nCaller: hello',
    });

    expect(result.summary.status).to.equal('already_exists');
    expect(result.transcript.status).to.equal('already_exists');
    expect(supabase.rows).to.have.length(2);
  });

  it('inserts for two different call SIDs on the same conversation', async () => {
    const existing: FakeRow[] = [
      {
        id: 'existing-summary',
        conversation_id: 'conv-1',
        message_type: 'summary',
        structured_data: { call_sid: 'CA123' },
      },
    ];
    const supabase = createFakeSupabase(existing) as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA456',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      businessId: 'biz-1',
      summary: 'Second summary',
      transcript: 'Second transcript',
    });

    expect(result.summary.status).to.equal('inserted');
    expect(result.transcript.status).to.equal('inserted');
    expect(supabase.rows).to.have.length(3);
    const summary = supabase.rows.find((r: any) => r.message_type === 'summary' && r.structured_data.call_sid === 'CA456');
    expect(summary).to.exist;
  });

  it('skips blank summary and transcript bodies', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      businessId: 'biz-1',
      summary: '',
      transcript: '',
    });

    expect(result.summary.status).to.equal('skipped');
    expect(result.transcript.status).to.equal('skipped');
    expect(supabase.rows).to.have.length(0);
  });

  it('surfaces insert errors without throwing', async () => {
    const supabase = createFakeSupabase([], 'unique constraint violation') as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: 'conv-1',
      leadId: 'lead-1',
      businessId: 'biz-1',
      summary: 'AI summary',
      transcript: 'Transcript',
    });

    expect(result.summary.status).to.equal('failed');
    expect(result.transcript.status).to.equal('failed');
  });

  it('fails gracefully when required IDs are missing', async () => {
    const supabase = createFakeSupabase() as any;

    const result = await persistAiCallConversationMessages({
      supabase,
      callSid: 'CA123',
      conversationId: '',
      leadId: 'lead-1',
      businessId: 'biz-1',
      summary: 'AI summary',
      transcript: 'Transcript',
    });

    expect(result.summary.status).to.equal('failed');
    expect(result.transcript.status).to.equal('failed');
    expect(supabase.rows).to.have.length(0);
  });
});
