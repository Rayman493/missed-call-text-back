import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('AI message persistence source-level assertions', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
  const indexSource = fs.readFileSync(indexPath, 'utf-8');

  it('active Twilio-close finalization path calls the shared persistence helper', () => {
    expect(indexSource).to.include('persistAiCallConversationMessages');
  });

  it('no longer inserts summary or transcript messages directly in src/index.ts', () => {
    // Summary and transcript persistence must go through the shared helper.
    // System messages are allowed to continue using buildAiMessagePayload.
    expect(indexSource).to.not.include("message_type: 'summary'");
    expect(indexSource).to.not.include("message_type: 'transcript'");
  });
});
