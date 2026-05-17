import { NextResponse } from "next/server";

// Test endpoint to verify TwiML generation
export async function GET() {
  // Use the same premium voice as production
  const voice = "Polly.Joanna-Neural";
  
  // Shortened message matching production for improved reliability
  // Forwarded carrier calls sometimes bridge audio late, so we use pauses to improve playback reliability
  const greetingText = "Sorry we missed your call. We'll text you shortly.";

  const twiml = `
<Response>
  <Pause length="1"/>
  <Say voice="${voice}" language="en-US">
    ${greetingText}
  </Say>
  <Pause length="3"/>
  <Hangup/>
</Response>
`.trim();

  console.log('[Test Voice TwiML] DEBUG: Generated test TwiML');
  console.log('[Test Voice TwiML] DEBUG: Voice:', voice);
  console.log('[Test Voice TwiML] DEBUG: Greeting Text:', greetingText);
  console.log('[Test Voice TwiML] DEBUG: Final TwiML:', twiml);

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
