import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? null,
    hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    authTokenLength: process.env.TWILIO_AUTH_TOKEN?.length ?? 0,
  });
}
