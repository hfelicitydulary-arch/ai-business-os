import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Siri / Shortcuts endpoint for Aether
 * POST { "text": "user request", "speak": true }
 * Returns { "reply": "..." }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || body.query || body.message || "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "Missing text", reply: "I didn't catch that. Please say it again." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        reply:
          "Aether is online but no AI key is configured. Add ANTHROPIC_API_KEY in Vercel.",
      });
    }

    const system = `You are Aether, a personal AI assistant on the user's phone.
Be concise and spoken-friendly (1-5 short sentences unless they ask for detail).
Help with planning, scripts, YouTube/content ideas, learning, and practical tasks.
You cannot control the phone OS, send texts, or break the law.
If they ask you to do something only Siri/Shortcuts can do, tell them the exact next step.
Niche default if relevant: making money with AI for beginners, phone-only.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Aether Claude error", err);
      return NextResponse.json({
        reply: "Aether hit an AI error. Try again in a moment.",
        error: err.slice(0, 200),
      });
    }

    const data = await res.json();
    const reply =
      data.content?.[0]?.text?.trim() ||
      "I couldn't generate a reply. Please try again.";

    return NextResponse.json({ reply, ok: true });
  } catch (e: any) {
    return NextResponse.json({
      reply: "Aether had a connection problem. Please try again.",
      error: e.message,
    });
  }
}

/** GET for quick browser test: /api/aether/ask?text=hello */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text") || "Hello";
  const fakeReq = {
    json: async () => ({ text }),
  } as NextRequest;
  return POST(fakeReq);
}
