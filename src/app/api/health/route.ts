import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    service: 'replyflow-next',
    timestamp: new Date().toISOString(),
  })
}
