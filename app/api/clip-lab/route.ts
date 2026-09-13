import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseModelJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const attempts: string[] = [text];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* ignore */
    }
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      /* ignore */
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
    /* ignore */
  }
  return null;
}

async function fetchOEmbed(url: string) {
  const res = await fetch(
    "https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json"
  );
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
      return NextResponse.json({ error: "Not authenticated — log in again" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json();
    const url = (body.url || "").trim();
    const transcript = (body.transcript || "").trim();
    const notes = (body.notes || "").trim();
    const niche =
      (body.niche || "").trim() ||
      "General educational / faceless YouTube (match the source topic)";

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
      oembed?.title || body.title || (videoId ? "YouTube " + videoId : "Unknown title");
    const author = oembed?.author_name || "";

    const prompt = `You are a scriptwriter for faceless YouTube creators.

CREATOR NICHE (this user's channel focus — adapt tone and CTA to this):
${niche}

SOURCE VIDEO
- Title: ${title}
- Channel: ${author || "unknown"}
- URL: ${url}
${notes ? "- Extra notes from creator: " + notes : ""}
${
  transcript
    ? "- Transcript/captions (raw words — use to understand MEANING, do not copy phrasing):\n" +
      transcript.slice(0, 9000)
    : "- No transcript. Infer meaning from title and typical structure of this content type. Mark uncertain claims as general."
}

YOUR JOB
1) Understand what the video is REALLY about: core message, argument, story beats, promises, and takeaways — not just repeating the same sentences.
2) Write ORIGINAL scripts in a new voice/structure that teach or tell the SAME underlying content/ideas.
3) Fit the creator's niche when natural (hooks, examples, CTA). If source is off-niche, still cover the source accurately; optionally add a light bridge to the niche only if honest.

Return ONLY raw JSON (no markdown, no code fences):
{
  "sourceTitle": "string",
  "contentBreakdown": "What the video is about in plain language: main topic, 3-6 key points/claims, and the overall takeaway",
  "summary": "2-3 sentences",
  "longScript": "Original spoken long-form narration (about 200-350 words). Same ideas as source, new wording and flow. Conversational, no stage directions.",
  "shortScripts": [
    {
      "rank": 1,
      "title": "Shorts title under 70 chars",
      "hook": "strong first line",
      "script": "35-55 second spoken script on ONE key idea from the video",
      "captionLines": ["short on-screen lines"]
    }
  ],
  "description": "YouTube description",
  "tags": ["8-12 tags"],
  "filmingTips": ["3-5 tips for original phone/CapCut filming"]
}

Exactly 3 shortScripts. Prefer meaning-accurate scripts over word-matching the transcript.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error("Claude API failed: " + res.status + " " + errText.slice(0, 300));
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
        contentBreakdown: "Parse failed — try Generate again.",
        summary: "",
        longScript: "",
        shortScripts: [],
        description: "",
        tags: [],
        filmingTips: ["Try again", "Paste transcript for better meaning accuracy"],
      };
    }
    if (!Array.isArray(parsed.shortScripts)) parsed.shortScripts = [];

    return NextResponse.json({
      success: true,
      source: { url, videoId, title, author },
      niche,
      plan: parsed,
    });
  } catch (err: any) {
    console.error("Clip Lab error:", err);
    return NextResponse.json({ error: err.message || "Clip Lab failed" }, { status: 500 });
  }
}
