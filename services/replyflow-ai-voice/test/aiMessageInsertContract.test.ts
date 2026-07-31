import { expect } from 'chai';
import { buildAiMessagePayload } from '../src/lib/ai-message-builder';

describe('AI message insert contract', () => {
  it('summary payload uses body and outbound direction, not content', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      business_id: 'biz-1',
      body: 'NEW CUSTOMER REQUEST\nService: plumbing',
      direction: 'outbound',
      message_type: 'summary',
    });

    expect(payload.body).to.equal('NEW CUSTOMER REQUEST\nService: plumbing');
    expect(payload.direction).to.equal('outbound');
    expect(payload.message_type).to.equal('summary');
    expect(payload.sender).to.equal('ai');
    expect(payload).to.not.have.property('content');
    expect(payload.conversation_id).to.equal('conv-1');
    expect(payload.lead_id).to.equal('lead-1');
    expect(payload.business_id).to.equal('biz-1');
  });

  it('transcript payload uses body and inbound direction, not content', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      business_id: 'biz-1',
      body: 'Assistant: hello\nCaller: hi',
      direction: 'inbound',
      message_type: 'transcript',
    });

    expect(payload.body).to.equal('Assistant: hello\nCaller: hi');
    expect(payload.direction).to.equal('inbound');
    expect(payload.message_type).to.equal('transcript');
    expect(payload.sender).to.equal('caller');
    expect(payload).to.not.have.property('content');
  });

  it('rejects the legacy content-only shape', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        business_id: 'biz-1',
        // @ts-ignore
        content: 'legacy text',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('rejects missing body', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        business_id: 'biz-1',
        // @ts-ignore
        body: undefined,
        direction: 'outbound',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('rejects invalid direction', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        business_id: 'biz-1',
        body: 'text',
        // @ts-ignore
        direction: 'sideways',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('rejects missing business_id', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        // @ts-ignore
        business_id: '',
        body: 'text',
        direction: 'outbound',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('preserves structured_data when provided', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      business_id: 'biz-1',
      body: 'summary',
      direction: 'outbound',
      message_type: 'summary',
      structured_data: { customerName: 'Ryan' },
    });

    expect(payload.structured_data).to.deep.equal({ customerName: 'Ryan' });
  });

  it('omits structured_data when not provided', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      business_id: 'biz-1',
      body: 'transcript',
      direction: 'inbound',
      message_type: 'transcript',
    });

    expect(payload).to.not.have.property('structured_data');
  });
});
