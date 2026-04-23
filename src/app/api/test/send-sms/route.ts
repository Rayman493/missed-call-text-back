import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    console.log('[test/send-sms] Starting SMS test')
    
    // Load test business from database by name
    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('name', 'Demo Plumbing Co')
      .single()
    
    if (error || !business) {
      console.error('[test/send-sms] Failed to load test business:', error)
      return NextResponse.json({
        success: false,
        message: "Failed to load test business",
        error: error instanceof Error ? error.message : 'Business not found'
      }, { status: 500 })
    }
    
    // Hardcoded test phone number and message
    const to = "+14128553010"
    const message = "Test SMS from ReplyFlow - if you got this, Twilio is working"
    
    // Log business details
    console.log(`[test/send-sms] Using business:`, {
      id: business.id,
      name: business.name,
      messaging_service_sid: business.twilio_messaging_service_sid,
      phone_number: business.twilio_phone_number
    })
    
    console.log(`[test/send-sms] Sending test SMS to: ${to}`)
    
    // Log business details before send attempt
    console.log(`[test/send-sms] Attempting to send SMS via business:`, {
      id: business.id,
      name: business.name,
      messaging_service_sid: business.twilio_messaging_service_sid,
      phone_number: business.twilio_phone_number
    })
    
    // Send SMS using real business configuration
    try {
      const messageSid = await sendSms(business, to, message)
      
      if (!messageSid) {
        console.error('[test/send-sms] Failed to send SMS')
        const err = error as unknown as {
          message?: string;
          code?: string | number;
          status?: string | number;
          moreInfo?: string;
        }
        return NextResponse.json({
          success: false,
          message: "Failed to send SMS",
          error: {
            message: err.message ?? "Unknown error",
            code: err.code,
            status: err.status,
            moreInfo: err.moreInfo
          }
        }, { status: 500 })
      }
      
      console.log(`[test/send-sms] SMS sent successfully, SID: ${messageSid}`)
      
      return NextResponse.json({
        success: true,
        message: "SMS sent",
        messageSid: messageSid,
        to: to,
        body: message,
        business: {
          id: business.id,
          name: business.name,
          twilio_phone_number: business.twilio_phone_number,
          twilio_messaging_service_sid: business.twilio_messaging_service_sid,
        }
      })
    } catch (error) {
      console.error('[test/send-sms] Error sending SMS:', error)
      
      return NextResponse.json({
        success: false,
        message: "Error sending SMS",
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: error instanceof Error && 'code' in error ? error.code : undefined,
          status: error instanceof Error && 'status' in error ? error.status : undefined,
          moreInfo: error instanceof Error && 'moreInfo' in error ? error.moreInfo : undefined
        }
      }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      message: "SMS sent",
  } catch (error) {
    console.error('[test/send-sms] Error:', error)
    
    return NextResponse.json({
      success: false,
      message: "Error sending SMS",
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error instanceof Error && 'code' in error ? error.code : undefined,
        status: error instanceof Error && 'status' in error ? error.status : undefined,
        moreInfo: error instanceof Error && 'moreInfo' in error ? error.moreInfo : undefined
      }
    }, { status: 500 })
  }
}
