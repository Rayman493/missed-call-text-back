import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    accountSid: process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 8)}...` : null,
    hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    // Remove token length for security
  });
}
