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

/** Best-effort public captions fetch (many videos work; some block). */
async function fetchYoutubeCaptions(videoId: string): Promise<string> {
  try {
    const watchRes = await fetch("https://www.youtube.com/watch?v=" + videoId, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!watchRes.ok) return "";
    const html = await watchRes.text();

    // Find caption track URLs from ytInitialPlayerResponse
    const langPrefs = ["en", "en-US", "en-GB", "a.en"];
    const trackMatches = [
      ...html.matchAll(/"captionTracks":(\[[\s\S]*?\])/g),
    ];
    let tracks: any[] = [];
    if (trackMatches[0]) {
      try {
        tracks = JSON.parse(trackMatches[0][1]);
      } catch {
        tracks = [];
      }
    }

    if (!tracks.length) {
      // alternate escaped form
      const m = html.match(/captionTracks\\":(\[.*?\])/);
      if (m) {
        try {
          const unescaped = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          tracks = JSON.parse(unescaped);
        } catch {
          tracks = [];
        }
      }
    }

    if (!tracks.length) return "";

    let track =
      tracks.find((t) => langPrefs.includes(t.languageCode)) ||
      tracks.find((t) => (t.languageCode || "").startsWith("en")) ||
      tracks[0];

    const baseUrl = track?.baseUrl;
    if (!baseUrl) return "";

    const capRes = await fetch(baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!capRes.ok) return "";
    const xml = await capRes.text();

    // Extract text from <text ...>...</text>
    const parts: string[] = [];
    const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const decoded = m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (decoded) parts.push(decoded);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 12000);
  } catch {
    return "";
  }
}

function fallbackPlanFromRaw(title: string, raw: string) {
  // If model returned prose, use it as longScript
  const cleaned = raw
    .replace(/^```[\s\S]*?```/m, "")
    .replace(/```/g, "")
    .trim();
  return {
    sourceTitle: title,
    contentBreakdown:
      "Automatic structure failed; raw model text is provided as the long script. Generate again if needed.",
    summary: "See long script below.",
    longScript: cleaned.slice(0, 4000) || "Generation failed. Please try again.",
    shortScripts: [
      {
        rank: 1,
        title: title.slice(0, 60),
        hook: "Here's what actually matters from this topic.",
        script: cleaned.slice(0, 600),
        captionLines: ["Key takeaway", "Watch this", "Try it yourself"],
      },
    ],
    description: title,
    tags: ["youtube", "tutorial", "tips"],
    filmingTips: [
      "Screen-record the tool or topic on your phone",
      "Read the long script as voiceover in CapCut",
      "Add big captions for the first 3 seconds",
    ],
  };
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
    let transcript = (body.transcript || "").trim();
    const notes = (body.notes || "").trim();
    const niche =
      (body.niche || "").trim() ||
      "General educational faceless YouTube — match the source topic";

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

    // Auto-fetch captions if user didn't paste transcript
    let captionSource = "user";
    if (!transcript && videoId) {
      const auto = await fetchYoutubeCaptions(videoId);
      if (auto && auto.length > 80) {
        transcript = auto;
        captionSource = "auto";
      }
    }

    const prompt = `You are a skilled YouTube scriptwriter.

CREATOR NICHE: ${niche}

SOURCE
- Title: ${title}
- Channel: ${author || "unknown"}
- URL: ${url}
${notes ? "- Notes: " + notes : ""}
${
  transcript
    ? "- CONTENT SOURCE (" +
      captionSource +
      " captions/transcript). Extract MEANING and key points; do NOT copy wording:\n" +
      transcript.slice(0, 10000)
    : "- No captions available. Use the title and honest general knowledge of this topic type. Do not invent specific fake stats."
}

Write scripts that capture what the video is ABOUT (ideas, features, tips, story), not a word-for-word readback.

Respond with ONLY valid JSON (no markdown fences):
{
  "sourceTitle": ${JSON.stringify(title)},
  "contentBreakdown": "Main topic + 4-7 concrete key points from the content",
  "summary": "2-3 sentences",
  "longScript": "200-350 word spoken narration, original wording, same substance",
  "shortScripts": [
    {"rank":1,"title":"...","hook":"...","script":"40-55s spoken","captionLines":["...","..."]}
  ],
  "description": "...",
  "tags": ["..."],
  "filmingTips": ["...","...","..."]
}
Include exactly 3 shortScripts. JSON only.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error("Claude API failed: " + res.status + " " + errText.slice(0, 300));
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "";
    let parsed = parseModelJson(rawText);
    if (!parsed || typeof parsed !== "object") {
      parsed = parseModelJson(String(rawText).replace(/```/g, ""));
    }

    // If still bad or empty longScript, fallback so UI never looks empty
    if (!parsed || typeof parsed !== "object" || !parsed.longScript) {
      parsed = fallbackPlanFromRaw(title, rawText);
    }
    if (!Array.isArray(parsed.shortScripts) || parsed.shortScripts.length === 0) {
      parsed.shortScripts = fallbackPlanFromRaw(title, parsed.longScript || rawText).shortScripts;
    }

    return NextResponse.json({
      success: true,
      source: { url, videoId, title, author },
      captionSource: transcript ? captionSource : "none",
      niche,
      plan: parsed,
    });
  } catch (err: any) {
    console.error("Clip Lab error:", err);
    return NextResponse.json({ error: err.message || "Clip Lab failed" }, { status: 500 });
  }
}
