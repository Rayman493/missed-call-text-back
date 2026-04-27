import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log('[SYSTEM] [TWILIO] Voice webhook received');
    
    const body = await request.text();
    const from = request.headers.get('x-twilio-signature') ? 'Twilio verified' : 'Unverified';
    
    console.log('[SYSTEM] [TWILIO] Voice webhook processed successfully');
    
    const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error('[SYSTEM] [TWILIO] Voice webhook error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
