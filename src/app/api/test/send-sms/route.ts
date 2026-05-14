import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";

export const dynamic = 'force-dynamic';

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

// Simple in-memory rate limiter for test SMS (for production, use Redis)
const testSmsAttempts = new Map<string, number[]>()
const TEST_SMS_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const MAX_TEST_SMS_ATTEMPTS = 3 // Max 3 test SMS per user per hour

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  const userIds = Array.from(testSmsAttempts.keys())
  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i]
    const timestamps = testSmsAttempts.get(userId) || []
    const validTimestamps = timestamps.filter(ts => now - ts < TEST_SMS_RATE_LIMIT_WINDOW)
    if (validTimestamps.length === 0) {
      testSmsAttempts.delete(userId)
    } else {
      testSmsAttempts.set(userId, validTimestamps)
    }
  }
}, 5 * 60 * 1000) // Clean up every 5 minutes

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

    // Rate limiting check
    const now = Date.now()
    const attempts = testSmsAttempts.get(user.id) || []
    const recentAttempts = attempts.filter(ts => now - ts < TEST_SMS_RATE_LIMIT_WINDOW)
    
    if (recentAttempts.length >= MAX_TEST_SMS_ATTEMPTS) {
      console.error('[Security] Rate limit exceeded for test SMS:', user.id)
      return NextResponse.json({ 
        error: 'Too many test SMS attempts',
        retryAfter: Math.ceil((TEST_SMS_RATE_LIMIT_WINDOW - (now - recentAttempts[0])) / 1000)
      }, { status: 429 })
    }
    
    // Add this attempt to tracking
    recentAttempts.push(now)
    testSmsAttempts.set(user.id, recentAttempts)

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
