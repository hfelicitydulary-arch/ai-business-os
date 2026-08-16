import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { title, source } = await req.json();

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const prompt = `Write a short, engaging video script (30-45 seconds when spoken, roughly 90-120 words) explaining this trending topic to a general audience. Keep it punchy and conversational, suitable for a talking-head video. Do not include stage directions or timestamps, just the spoken narration.

Topic: "${title}"
Source: ${source || "trending topic"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const script = data.content?.[0]?.text || "";

    return NextResponse.json({ success: true, script, title });
  } catch (err: any) {
    console.error("Script generation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
