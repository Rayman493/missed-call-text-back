import { expect } from 'chai';
import { buildAiMessagePayload } from '../src/lib/ai-message-builder';

describe('AI message insert contract', () => {
  it('summary payload uses body, outbound direction, from_phone, to_phone - matches SMS contract', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      from_phone: '+15551234567',
      to_phone: '+15559876543',
      body: 'NEW CUSTOMER REQUEST\nService: plumbing',
      direction: 'outbound',
      message_type: 'summary',
    });

    expect(payload.body).to.equal('NEW CUSTOMER REQUEST\nService: plumbing');
    expect(payload.direction).to.equal('outbound');
    expect(payload.message_type).to.equal('summary');
    expect(payload.from_phone).to.equal('+15551234567');
    expect(payload.to_phone).to.equal('+15559876543');
    expect(payload.twilio_message_sid).to.equal(null);
    expect(payload.status).to.equal(null);
    expect(payload.media_count).to.equal(0);
    expect(payload).to.not.have.property('sender');
    expect(payload).to.not.have.property('content');
    expect(payload).to.not.have.property('business_id');
    expect(payload.conversation_id).to.equal('conv-1');
    expect(payload.lead_id).to.equal('lead-1');
  });

  it('transcript payload uses body, inbound direction, from_phone, to_phone - matches SMS contract', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      from_phone: '+15551234567',
      to_phone: '+15559876543',
      body: 'Assistant: hello\nCaller: hi',
      direction: 'inbound',
      message_type: 'transcript',
    });

    expect(payload.body).to.equal('Assistant: hello\nCaller: hi');
    expect(payload.direction).to.equal('inbound');
    expect(payload.message_type).to.equal('transcript');
    expect(payload.from_phone).to.equal('+15551234567');
    expect(payload.to_phone).to.equal('+15559876543');
    expect(payload.twilio_message_sid).to.equal(null);
    expect(payload.status).to.equal(null);
    expect(payload.media_count).to.equal(0);
    expect(payload).to.not.have.property('sender');
    expect(payload).to.not.have.property('content');
  });

  it('rejects missing from_phone', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        from_phone: '',
        to_phone: '+15559876543',
        body: 'text',
        direction: 'outbound',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('rejects missing to_phone', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        from_phone: '+15551234567',
        to_phone: '',
        body: 'text',
        direction: 'outbound',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('rejects missing body', () => {
    expect(() =>
      buildAiMessagePayload({
        conversation_id: 'conv-1',
        lead_id: 'lead-1',
        from_phone: '+15551234567',
        to_phone: '+15559876543',
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
        from_phone: '+15551234567',
        to_phone: '+15559876543',
        body: 'text',
        // @ts-ignore
        direction: 'sideways',
        message_type: 'summary',
      } as any)
    ).to.throw();
  });

  it('includes call_sid in structured_data when provided', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      from_phone: '+15551234567',
      to_phone: '+15559876543',
      body: 'summary',
      direction: 'outbound',
      message_type: 'summary',
      call_sid: 'CA123',
      structured_data: { customerName: 'Ryan' },
    });

    expect(payload.structured_data).to.deep.equal({ customerName: 'Ryan', call_sid: 'CA123' });
  });

  it('includes structured_data with call_sid when only call_sid provided', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      from_phone: '+15551234567',
      to_phone: '+15559876543',
      body: 'transcript',
      direction: 'inbound',
      message_type: 'transcript',
      call_sid: 'CA123',
    });

    expect(payload.structured_data).to.deep.equal({ call_sid: 'CA123' });
  });

  it('omits structured_data when neither call_sid nor structured_data provided', () => {
    const payload = buildAiMessagePayload({
      conversation_id: 'conv-1',
      lead_id: 'lead-1',
      from_phone: '+15551234567',
      to_phone: '+15559876543',
      body: 'transcript',
      direction: 'inbound',
      message_type: 'transcript',
    });

    expect(payload).to.not.have.property('structured_data');
  });
});
