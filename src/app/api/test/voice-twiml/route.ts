import { NextResponse } from "next/server";

// Test endpoint to verify TwiML generation
export async function GET() {
  // Simulate the generateVoiceGreeting function
  const voice = "Polly.Joanna";
  const businessName = "Test Business";
  const greetingText = `Hey, thanks for calling ${businessName}. Sorry we missed your call — we'll send you a quick text message shortly.`;

  const twiml = `
<Response>
  <Say voice="${voice}" language="en-US">${greetingText}</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`.trim();

  console.log('[Test Voice TwiML] DEBUG: Generated test TwiML');
  console.log('[Test Voice TwiML] DEBUG: Voice:', voice);
  console.log('[Test Voice TwiML] DEBUG: Business Name:', businessName);
  console.log('[Test Voice TwiML] DEBUG: Greeting Text:', greetingText);
  console.log('[Test Voice TwiML] DEBUG: Final TwiML:', twiml);

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
