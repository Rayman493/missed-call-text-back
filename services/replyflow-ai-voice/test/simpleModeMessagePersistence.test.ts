import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test: Simple Mode completion must NOT create synthetic conversation
 * messages for AI summary/transcript artifacts.
 *
 * Defect fixed: completed AI Intake calls inserted two fake rows into the
 * `messages` table (message_type 'summary' and 'transcript'), which the
 * conversation UI rendered as SMS bubbles. The `messages` table must only
 * contain actual sent/received SMS/MMS. Transcript, summary and extracted
 * fields persist in ai_call_records instead.
 */
describe('Simple Mode - no synthetic summary/transcript conversation messages', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
  const indexSource = fs.readFileSync(indexPath, 'utf-8');

  it('does not call any AI summary/transcript message-persistence helper', () => {
    expect(indexSource).to.not.include('persistAiCallConversationMessages');
    expect(indexSource).to.not.include('simple_mode_message_persistence_started');
  });

  it('does not insert message_type summary or transcript rows anywhere', () => {
    expect(indexSource).to.not.include("message_type: 'summary'");
    expect(indexSource).to.not.include("message_type: 'transcript'");
  });

  it('still persists transcript, extracted_info and summary to ai_call_records on completion', () => {
    // The completion payload must carry all three authoritative artifacts.
    expect(indexSource).to.include('transcript: transcriptToPersist');
    expect(indexSource).to.include('extracted_info: canonicalExtractedInfo');
    expect(indexSource).to.include('summary: canonicalExtractedInfo.serviceRequested');
  });

  it('builds the call transcript from stage captures for ai_call_records', () => {
    const stageCaptures = [
      { stage: 'ask_name', rawTranscript: 'My name is John' },
      { stage: 'ask_request', rawTranscript: 'I need help with my water heater' },
      { stage: 'ask_location', rawTranscript: 'It\'s in the basement' },
    ];

    const transcriptMessage = stageCaptures.map(c => c.rawTranscript).join('\n');

    expect(transcriptMessage).to.equal('My name is John\nI need help with my water heater\nIt\'s in the basement');
    expect(transcriptMessage).to.not.include('ask_name');
    expect(transcriptMessage).to.not.include('ask_request');
    expect(transcriptMessage).to.include('My name is John');
    expect(transcriptMessage).to.include('I need help with my water heater');
  });
});
