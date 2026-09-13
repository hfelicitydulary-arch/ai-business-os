import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function parseModelJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const attempts: string[] = [text];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    attempts.push(text.slice(start, end + 1));
  }
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore
    }
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      // ignore
    }
  }
  return null;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (host.endsWith("youtube.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || null;
      }
      return u.searchParams.get("v");
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchOEmbed(url: string) {
  const oembedUrl =
    "https://www.youtube.com/oembed?url=" +
    encodeURIComponent(url) +
    "&format=json";
  const res = await fetch(oembedUrl);
  if (!res.ok) return null;
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const url = (body.url || "").trim();
    const transcript = (body.transcript || "").trim();
    const notes = (body.notes || "").trim();
    // "script" = full retell script (default). "clips" = old clip-plan mode
    const mode = (body.mode || "script").trim();

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const videoId = extractYouTubeId(url);
    const oembedTarget =
      videoId && url.includes("/shorts/")
        ? "https://www.youtube.com/watch?v=" + videoId
        : url;

    let oembed: any = null;
    try {
      oembed = await fetchOEmbed(oembedTarget);
    } catch {
      oembed = null;
    }

    const title =
      oembed?.title ||
      body.title ||
      (videoId ? "YouTube " + videoId : "Unknown title");
    const author = oembed?.author_name || "";

    const prompt = `You are Clip Lab Script Writer for a faceless YouTube channel.

Niche: Making money with AI for beginners (phone-only, zero capital) — use this angle when it fits, without forcing it if the source is unrelated.

SOURCE VIDEO
- URL: ${url}
- Video ID: ${videoId || "unknown"}
- Title: ${title}
- Channel: ${author || "unknown"}
${notes ? "- User notes: " + notes : ""}
${
  transcript
    ? "- Transcript / captions (use this as the factual base):\n" +
      transcript.slice(0, 14000)
    : "- No transcript provided. Infer the likely points from the title and typical content of this kind of video. Be honest that some details are inferred."
}

TASK
Write ORIGINAL scripts the creator can film in THEIR own style (screen recording, voiceover, stock, CapCut). Same core ideas/message as the source — not a word-for-word steal, not a copy of someone else's delivery.

Return ONLY a raw JSON object. No markdown. No code fences. No text outside JSON.

{
  "sourceTitle": "string",
  "summary": "3-5 sentences: what the video is about and the main claims/points",
  "longScript": "A full spoken narration for a LONG video (about 2-4 minutes spoken, clear sections, conversational). Cover the same main points as the source. No stage directions.",
  "shortScripts": [
    {
      "rank": 1,
      "title": "Shorts title under 70 chars",
      "hook": "first line",
      "script": "30-50 second spoken script on ONE point from the video",
      "captionLines": ["short on-screen lines"]
    }
  ],
  "description": "YouTube description for the long video",
  "tags": ["8-12 tags"],
  "filmingTips": ["3-6 tips to film this on iPhone with CapCut, original footage only"]
}

Rules:
- longScript must stand alone for a full video.
- Give 3 to 5 shortScripts max, each one idea.
- Same meaning/points as source; different words and structure.
- If transcript is missing, keep claims general and avoid inventing fake stats.
- Do not output copyrighted lyrics or long verbatim quotes.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error("Claude API failed: " + res.status + " " + errText);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "{}";
    let parsed = parseModelJson(rawText);
    if (!parsed || typeof parsed !== "object") {
      parsed = parseModelJson(String(rawText).replace(/```/g, ""));
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({
        success: true,
        source: { url, videoId, title, author },
        plan: {
          sourceTitle: title,
          summary: "Could not parse model output. Tap Generate again.",
          longScript: "",
          shortScripts: [],
          description: "",
          tags: [],
          filmingTips: ["Try again", "Paste transcript for better accuracy"],
          mode,
        },
      });
    }

    if (!Array.isArray(parsed.shortScripts)) parsed.shortScripts = [];
    // backward compat if model still returns clips
    if (!parsed.longScript && Array.isArray(parsed.clips)) {
      parsed.shortScripts = parsed.clips.map((c: any, i: number) => ({
        rank: c.rank || i + 1,
        title: c.title,
        hook: c.hook,
        script: (c.captionLines || []).join(". "),
        captionLines: c.captionLines || [],
      }));
    }

    return NextResponse.json({
      success: true,
      source: { url, videoId, title, author },
      plan: parsed,
    });
  } catch (err: any) {
    console.error("Clip Lab error:", err);
    return NextResponse.json(
      { error: err.message || "Clip Lab failed" },
      { status: 500 }
    );
  }
}
