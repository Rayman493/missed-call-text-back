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

export async function GET() {
  try {
    const to = "+14128553010";
    const body = "Test SMS from ReplyFlow - if you got this, Twilio is working";

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, twilio_phone_number, twilio_messaging_service_sid")
      .eq("name", "Demo Plumbing Co")
      .single();

    if (businessError || !business) {
      return NextResponse.json({
        success: false,
        message: "Test business not found",
        error: {
          message: businessError?.message ?? "Business not found",
        },
      });
    }

    console.log("Using messaging service SID:", business.twilio_messaging_service_sid);

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
