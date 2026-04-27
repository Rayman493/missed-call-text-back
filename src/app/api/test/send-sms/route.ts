import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
);

// TODO: Implement rate limiting (max 3 test SMS per user per hour)
// Consider using Redis/Upstash or in-memory store for rate limiting

export async function GET(request: Request) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Security] Unauthorized request to /api/test/send-sms - missing auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Security] Unauthorized request to /api/test/send-sms - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, twilio_phone_number, twilio_messaging_service_sid, personal_phone_number, auto_reply_message")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (businessError || !business) {
      return NextResponse.json({
        success: false,
        message: "Business not found",
        error: {
          message: businessError?.message ?? "Business not found",
        },
      });
    }

    // Validate personal_phone_number exists
    if (!business.personal_phone_number) {
      console.error('[Test SMS] No personal_phone_number saved for user', user.id)
      return NextResponse.json({
        success: false,
        message: "Please add your personal phone number in settings to receive test SMS",
      });
    }

    const to = business.personal_phone_number;
    const body = business.auto_reply_message || `Hi, this is ${business.name || 'ReplyFlow'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`;

    console.log('[Test SMS] Sending to saved personal_phone_number only for user', user.id);

    const result = await sendSms(business, to, body);

    return NextResponse.json({
      success: true,
      message: "SMS sent",
      messageSid: result,
      to,
      body,
      business: {
        id: business.id,
        name: business.name,
        twilio_phone_number: business.twilio_phone_number,
        twilio_messaging_service_sid: business.twilio_messaging_service_sid,
      },
    });
  } catch (error) {
    console.error("[test/send-sms] Error:", error);

    const err =
      error && typeof error === "object"
        ? (error as {
            message?: string;
            code?: string | number;
            status?: string | number;
            moreInfo?: string;
          })
        : null;

    return NextResponse.json({
      success: false,
      message: "Failed to send SMS",
      error: {
        message: err?.message ?? "Unknown error",
        code: err?.code,
        status: err?.status,
        moreInfo: err?.moreInfo,
      },
    });
  }
}
