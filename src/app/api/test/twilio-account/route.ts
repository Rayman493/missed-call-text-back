import { NextResponse } from "next/server";
import Twilio from "twilio";

export async function GET() {
  try {
    const client = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    const account = await client.api.v2010
      .accounts(process.env.TWILIO_ACCOUNT_SID!)
      .fetch();

    return NextResponse.json({
      success: true,
      account: {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type,
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
