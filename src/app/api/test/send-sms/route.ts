import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'

export async function GET() {
  try {
    console.log('[test/send-sms] Starting SMS test')
    
    // Hardcoded test phone number and message
    const to = "+14128553010"
    const message = "Test SMS from ReplyFlow - if you got this, Twilio is working"
    
    console.log(`[test/send-sms] Sending test SMS to: ${to}`)
    
    // Send SMS using existing sendSms helper
    const messageSid = await sendSms(to, message)
    
    if (!messageSid) {
      console.error('[test/send-sms] Failed to send SMS')
      return NextResponse.json({
        success: false,
        message: "Failed to send SMS",
        error: "Twilio API error"
      }, { status: 500 })
    }
    
    console.log(`[test/send-sms] SMS sent successfully, SID: ${messageSid}`)
    
    return NextResponse.json({
      success: true,
      message: "SMS sent",
      messageSid: messageSid,
      to: to,
      body: message
    })
    
  } catch (error) {
    console.error('[test/send-sms] Error:', error)
    
    return NextResponse.json({
      success: false,
      message: "Error sending SMS",
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
