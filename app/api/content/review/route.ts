import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { title, script } = await req.json();

    if (!title || !script) {
      return NextResponse.json(
        { error: "title and script are required" },
        { status: 400 }
      );
    }

    const prompt = `You are reviewing a script for an automated YouTube channel BEFORE it gets turned into a video and uploaded. Your job is to catch things that risk a channel strike, demonetization, or ban.

Check specifically for:
1. Copyright risk — lyrics, close paraphrasing of a specific article/source, named copyrighted characters
2. Misleading or clickbait claims not supported by the content
3. YouTube's "reused/repetitious content" policy — is this generic enough that it reads as mass-produced, low-effort, or interchangeable with hundreds of other AI-generated videos? This is a real ban risk for automated channels specifically.
4. Community guideline risks — hate, harassment, dangerous claims, medical/financial misinformation
5. Whether the title accurately reflects the script content (title/thumbnail mismatch is a policy violation)

Title: "${title}"

Script:
"""
${script}
"""

Respond ONLY in this exact JSON format, no other text:
{
  "riskLevel": "low" | "medium" | "high",
  "issues": ["issue 1", "issue 2"],
  "suggestion": "one sentence on what to fix, or 'No changes needed' if riskLevel is low"
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
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "{}";

    let review;
    try {
      review = JSON.parse(rawText);
    } catch {
      review = {
        riskLevel: "medium",
        issues: ["Could not parse review — check manually"],
        suggestion: "Review this one yourself before uploading",
      };
    }

    return NextResponse.json({ success: true, review });
  } catch (err: any) {
    console.error("Compliance check error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
