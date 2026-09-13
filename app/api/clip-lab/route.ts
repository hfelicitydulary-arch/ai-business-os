import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function parseModelJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences
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
      const cleaned = candidate.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
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

    const prompt = `You are Clip Lab — a free alternative workflow to paid tools like Viblo.

The user will turn a SOURCE video into short vertical clips for YouTube Shorts / TikTok.
Niche focus: Making money with AI for beginners (phone-only, zero capital) when possible — but still extract the strongest moments from THIS video.

SOURCE
- URL: ${url}
- Video ID: ${videoId || "unknown"}
- Title: ${title}
- Channel: ${author || "unknown"}
${notes ? "- User notes: " + notes : ""}
${
  transcript
    ? "- Transcript / captions (may be partial):\n" + transcript.slice(0, 12000)
    : "- No transcript provided. Infer likely moments from the title and typical structure of this kind of video. Mark timestamps as estimates."
}

Return ONLY a raw JSON object. No markdown. No code fences. No commentary before or after. Shape:
{
  "sourceTitle": "string",
  "angle": "one sentence: how to reuse this for a beginner AI-money or high-retention faceless channel",
  "clips": [
    {
      "rank": 1,
      "start": "0:00",
      "end": "0:30",
      "durationSec": 30,
      "hook": "first line spoken or on-screen hook",
      "title": "YouTube Short title under 70 chars",
      "captionLines": ["3-6 short caption lines for on-screen text"],
      "whyItWorks": "one sentence",
      "estimated": true
    }
  ],
  "descriptionTemplate": "YouTube description template with CTA",
  "tags": ["8-12 tags"],
  "capcutSteps": ["3-6 practical steps to cut this in CapCut on iPhone"]
}

Rules:
- Propose 4 to 7 clips max.
- Prefer 15-45 second clips.
- If no transcript, set estimated:true and still give useful start/end guesses.
- Do not encourage copyright abuse; frame as commentary, reaction structure, or educational reuse where relevant.
- Strong hooks first.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
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
      parsed = {
        sourceTitle: title,
        angle:
          "Model returned unreadable formatting. Tap Generate again — usually works on retry.",
        clips: [],
        descriptionTemplate: "",
        tags: [],
        capcutSteps: [
          "Tap Generate clip plan again",
          "Or paste the video transcript for cleaner results",
          "This tool builds a PLAN — CapCut still cuts the video (free Viblo-style workflow)",
        ],
      };
    }

    if (!Array.isArray(parsed.clips)) {
      parsed.clips = [];
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
