import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // { intent, diagnostic }

    if (!body?.intent || !body?.diagnostic) {
      return NextResponse.json(
        {
          error: true,
          code: "PIPELINE_INVALID_INPUT",
          message: "intent and diagnostic are required",
        },
        { status: 400 }
      );
    }

    const bridgeBase = process.env.VPS_BRIDGE_URL || process.env.AIVORY_BRIDGE_URL || 'http://43.156.108.96:3003'
    const bridgeUrl = `${bridgeBase}/llm/aivory/pipeline`

    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("api/aivory/pipeline error", err);
    return NextResponse.json(
      {
        error: true,
        code: "PIPELINE_INTERNAL_ERROR",
        message: "Failed to run Aivory pipeline",
      },
      { status: 500 }
    );
  }
}
