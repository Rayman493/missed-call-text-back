import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const payload = Object.fromEntries(formData.entries());
    console.log("[twilio voice-status] payload:", payload);

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("[twilio voice-status] error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}
