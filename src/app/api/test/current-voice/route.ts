import { NextResponse } from "next/server";

// Test endpoint to verify current voice webhook TwiML generation
export async function GET() {
  // Import the actual voice generation function
  const voiceContent = `
    <Say voice="Polly.Joanna" language="en-US">Hey, thanks for calling Test Business. Sorry we missed your call — we'll send you a quick text message shortly.</Say>
    <Pause length="1"/>
  `;

  const twiml = `
<Response>
  ${voiceContent}
  <Hangup/>
</Response>
`.trim();

  console.log('[Test Current Voice] Current TwiML generation test');
  console.log('[Test Current Voice] Voice: Polly.Joanna');
  console.log('[Test Current Voice] Script: Hey, thanks for calling Test Business. Sorry we missed your call — we will send you a quick text message shortly.');
  console.log('[Test Current Voice] Final TwiML:', twiml);

  return new NextResponse(twiml, {
    status: 200,
    headers: { 
      "Content-Type": "text/xml",
      "X-ReplyFlow-Voice-Version": "v2"
    },
  });
}
