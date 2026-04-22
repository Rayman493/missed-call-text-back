export async function POST(req: Request) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="5"/>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
