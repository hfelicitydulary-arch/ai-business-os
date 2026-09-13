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
      return NextResponse.json({ error: "Not authenticated — log in again" }, { status: 401 });
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

    const prompt = `Write original YouTube scripts from this source. Same core ideas, different words. Niche when relevant: AI money for beginners, phone-only.

SOURCE title: ${title}
Channel: ${author || "unknown"}
URL: ${url}
${notes ? "Notes: " + notes : ""}
${
  transcript
    ? "Transcript:\n" + transcript.slice(0, 8000)
    : "No transcript — infer carefully from title; avoid fake stats."
}

Return ONLY raw JSON (no markdown):
{
  "sourceTitle": "string",
  "summary": "2-3 sentences",
  "longScript": "spoken long-form narration ~200-350 words, conversational",
  "shortScripts": [
    {"rank":1,"title":"Shorts title","hook":"first line","script":"35-50s spoken","captionLines":["line1","line2"]}
  ],
  "description": "YouTube description",
  "tags": ["tag1","tag2"],
  "filmingTips": ["tip1","tip2"]
}

Exactly 3 shortScripts. Be concise.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
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
        summary: "Parse failed — tap Generate again.",
        longScript: "",
        shortScripts: [],
        description: "",
        tags: [],
        filmingTips: ["Try again", "Paste transcript for accuracy"],
      };
    }
    if (!Array.isArray(parsed.shortScripts)) parsed.shortScripts = [];

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
