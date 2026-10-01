import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('AI message persistence source-level assertions', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
  const indexSource = fs.readFileSync(indexPath, 'utf-8');

  it('never inserts synthetic summary/transcript rows into the messages table', () => {
    // The messages table must only contain real SMS/MMS/customer messaging.
    // AI call summary and transcript artifacts belong exclusively in
    // ai_call_records — they must never become conversation message rows.
    expect(indexSource).to.not.include('persistAiCallConversationMessages');
    expect(indexSource).to.not.include("message_type: 'summary'");
    expect(indexSource).to.not.include("message_type: 'transcript'");
    expect(indexSource).to.not.include("message_type: \"summary\"");
    expect(indexSource).to.not.include("message_type: \"transcript\"");
    expect(indexSource).to.not.include("message_type === 'summary'");
    expect(indexSource).to.not.include("message_type === 'transcript'");
  });

  it('no messages insert uses a summary- or transcript-derived body', () => {
    // Guard against re-adding a differently-named helper that writes AI
    // summary/transcript text into messages. Only 'system' and real-SMS
    // message types are legitimate inserts.
    const insertBlocks = indexSource.match(/\.from\('messages'\)\s*\.insert\([\s\S]{0,1200}?\)\s*\)/g) || [];
    for (const block of insertBlocks) {
      expect(block).to.not.include("message_type: 'summary'");
      expect(block).to.not.include("message_type: 'transcript'");
    }
  });

  it('ai_call_records remains the authoritative store for transcript, summary and extracted_info', () => {
    expect(indexSource).to.include("from('ai_call_records')");
    expect(indexSource).to.include('transcript: transcriptToPersist');
    expect(indexSource).to.include('extracted_info: canonicalExtractedInfo');
  });
});
