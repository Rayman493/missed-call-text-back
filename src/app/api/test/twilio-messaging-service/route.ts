import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

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
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, twilio_phone_number, twilio_messaging_service_sid")
      .eq("name", "Demo Plumbing Co")
      .single();

    if (businessError || !business) {
      return NextResponse.json({
        success: false,
        error: {
          message: businessError?.message ?? "Business not found",
          code: businessError?.code,
          moreInfo: businessError?.details,
        },
      });
    }

    const client = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    const service = await client.messaging.v1
      .services(business.twilio_messaging_service_sid)
      .fetch();

    return NextResponse.json({
      success: true,
      business: {
        id: business.id,
        name: business.name,
        twilio_phone_number: business.twilio_phone_number,
        twilio_messaging_service_sid: business.twilio_messaging_service_sid,
      },
      messagingService: {
        sid: service.sid,
        friendlyName: service.friendlyName,
      },
    });
  } catch (error) {
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
      error: {
        message: err?.message ?? "Unknown error",
        code: err?.code,
        status: err?.status,
        moreInfo: err?.moreInfo,
      },
    });
  }
}
