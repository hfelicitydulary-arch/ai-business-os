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

    const prompt = `Create YouTube video content based on this trending topic. Prioritize a genuinely specific, non-generic angle — avoid the flat, interchangeable "AI slop" tone that makes mass-produced content read as low-effort (this matters for avoiding YouTube's repetitious/spam content policy, not just quality).

Topic: "${title}"
Source: ${source || "trending topic"}

Respond ONLY in this exact JSON format, no other text:
{
  "script": "30-45 second spoken narration script, 90-120 words, conversational, no stage directions",
  "seoTitle": "a specific, accurate YouTube title under 70 characters — no generic clickbait, no ALL CAPS spam, must genuinely match the script content",
  "description": "2-3 sentence YouTube description, plain text",
  "tags": ["5-8 relevant search tags as an array of short strings"]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback: treat the whole response as the script if JSON parsing fails
      parsed = { script: rawText, seoTitle: title, description: "", tags: [] };
    }

    return NextResponse.json({
      success: true,
      script: parsed.script,
      seoTitle: parsed.seoTitle || title,
      description: parsed.description || "",
      tags: parsed.tags || [],
      title,
    });
  } catch (err: any) {
    console.error("Script generation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
