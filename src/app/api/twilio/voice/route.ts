import { NextResponse } from "next/server";

export async function POST() {
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
}
