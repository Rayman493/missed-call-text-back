import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
