import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const Body = params.get('Body')
    
    console.log(`[incoming-sms] From: ${From}, Body: ${Body}`)
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Got your message</Message>
</Response>`

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
    
  } catch (error) {
    console.error('[incoming-sms] Error:', error)
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`

    return new Response(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}
