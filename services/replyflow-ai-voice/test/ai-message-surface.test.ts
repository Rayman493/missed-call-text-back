import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression: synthetic AI summary/transcript rows must never be inserted
 * into the `messages` table. Defect observed in production (CallSid
 * CAe761d69a9c7b33cebb257644cdc47a32): Simple Mode completion inserted two
 * fake conversation bubbles (message_type 'summary' and 'transcript')
 * before the real ai_summary SMS was sent.
 *
 * Contract:
 * - messages table = actual SMS/MMS/customer messaging only
 * - transcript/summary/extracted_info live in ai_call_records
 * - the real outbound ai_summary SMS (sent via Twilio, carrying a real
 *   twilio_message_sid) is still persisted through the web app route
 */
describe('AI intake message surface — no synthetic summary/transcript rows', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
  const indexSource = fs.readFileSync(indexPath, 'utf-8');

  const libDir = path.join(__dirname, '..', 'src', 'lib');
  const helperExists = fs.existsSync(path.join(libDir, 'persist-ai-messages.ts'));

  it('completed intake persists transcript to ai_call_records, not messages', () => {
    expect(indexSource).to.include('transcript: transcriptToPersist');
    expect(indexSource).to.include("from('ai_call_records')");
  });

  it('completed intake persists summary to ai_call_records, not messages', () => {
    expect(indexSource).to.include('summary: canonicalExtractedInfo.serviceRequested');
  });

  it('completed intake persists extracted_info to ai_call_records', () => {
    expect(indexSource).to.include('extracted_info: canonicalExtractedInfo');
  });

  it('no code path inserts message_type summary into messages', () => {
    expect(indexSource).to.not.include("message_type: 'summary'");
    expect(indexSource).to.not.include('message_type: "summary"');
    expect(indexSource).to.not.include("message_type === 'summary'");
  });

  it('no code path inserts message_type transcript into messages', () => {
    expect(indexSource).to.not.include("message_type: 'transcript'");
    expect(indexSource).to.not.include('message_type: "transcript"');
    expect(indexSource).to.not.include("message_type === 'transcript'");
  });

  it('the persistAiCallConversationMessages helper is fully removed', () => {
    expect(helperExists).to.equal(false);
    expect(indexSource).to.not.include('persistAiCallConversationMessages');
    expect(indexSource).to.not.include('persist-ai-messages');
  });

  it('the real ai_summary SMS persist path (twilio_message_sid via web route) is intact', () => {
    // The service hands the actually-sent SMS (with a real Twilio SID) to
    // the app's /api/ai-voice/summary-message route — that row is a real
    // outbound SMS and must remain.
    expect(indexSource).to.include('/api/ai-voice/summary-message');
    expect(indexSource).to.include('twilioMessageSid: messageSid');
  });

  it('partial intake still persists transcript to ai_call_records', () => {
    // Early-hangup/partial paths write ai_call_records with transcript arrays.
    const recordInserts = indexSource.match(/from\('ai_call_records'\)[\s\S]{0,600}?transcript/g) || [];
    expect(recordInserts.length).to.be.greaterThan(0);
  });

  it('early hangup path persists ai_call_records (transcript survives)', () => {
    expect(indexSource).to.include("'early_hangup'");
    expect(indexSource).to.include("'partial_intake'");
  });

  it('ai_call_records upsert still keys on call_sid for idempotency', () => {
    expect(indexSource).to.include("onConflict: 'call_sid'");
  });

  it('voicemail-fallback system message remains the only direct messages insert', () => {
    const inserts = indexSource.match(/from\('messages'\)\s*\n?\s*\.insert/g) || [];
    expect(inserts.length).to.equal(1);
    expect(indexSource).to.include("message_type: 'system'");
  });
});
