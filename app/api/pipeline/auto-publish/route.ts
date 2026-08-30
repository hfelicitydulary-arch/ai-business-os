import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchRedditTrends } from "../../../../lib/trends/reddit";
import { fetchDevToTrends } from "../../../../lib/trends/devto";
import { notifyFailure } from "../../../../lib/notify";
import { startVideoGeneration } from "../../../../lib/heygen";

async function sendDiscordUpdate(message: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch {}
}

async function askClaude(prompt: string, maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 1. Get fresh trends, filter out anything scripted in the last 30 days
    const [hackerNews, devTo] = await Promise.all([
      fetchRedditTrends(),
      fetchDevToTrends(),
    ]);
    const allTrends = [...hackerNews, ...devTo].sort((a, b) => b.score - a.score);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: used } = await supabase
      .from("used_trends")
      .select("title")
      .gte("generated_at", thirtyDaysAgo);
    const usedTitles = new Set((used || []).map((u) => u.title));

    const NICHE_KEYWORDS = [
      "ai", "artificial intelligence", "llm", "gpt", "claude", "openai",
      "machine learning", "chatbot", "automation", "software", "app",
      "coding", "developer", "programming", "startup", "saas", "tech",
      "google", "microsoft", "apple", "meta", "api", "open source",
      "framework", "cloud", "data", "algorithm", "robot", "chip",
    ];

    const nicheFiltered = allTrends.filter((t) =>
      NICHE_KEYWORDS.some((kw) => t.title.toLowerCase().includes(kw))
    );

    // Fall back to the full trend list only if nothing matches the niche today
    const pool = nicheFiltered.length > 0 ? nicheFiltered : allTrends;

    const candidates = pool.filter((t) => !usedTitles.has(t.title)).slice(0, 8);

    if (candidates.length === 0) {
      await sendDiscordUpdate("⚠️ Auto-publish: no fresh (unused) trends available right now.");
      return NextResponse.json({ success: false, reason: "No fresh trends" });
    }

    // 2. Let Claude judge which candidate is actually most video-worthy —
    // not just highest upvote score, but genuinely interesting to watch.
    const judgePrompt = `You're picking which trending topic to turn into a video today for a small, growing YouTube channel focused on AI tools and technology explainers. Judge based on which has the most genuine hook/story potential for an audience learning about AI and tech — not just which is most upvoted.

Candidates:
${candidates.map((c, i) => `${i}. "${c.title}" (source: ${c.source}, score: ${c.score})`).join("\n")}

Respond ONLY in this JSON format:
{"chosenIndex": 0, "reason": "one sentence on why this one has the best video potential"}`;

    let chosenIndex = 0;
    let reason = "Highest-scoring available trend";
    try {
      const judgeText = await askClaude(judgePrompt, 200);
      const judged = JSON.parse(judgeText);
      if (typeof judged.chosenIndex === "number" && candidates[judged.chosenIndex]) {
        chosenIndex = judged.chosenIndex;
        reason = judged.reason || reason;
      }
    } catch {
      // Fall back to highest-scored candidate (index 0) if judging fails
    }

    const candidate = candidates[chosenIndex];

    // 3. Decide format: cycle 1 Short, 2 long per day (positions 0=short, 1=long, 2=long)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from("content_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    const position = (todayCount ?? 0) % 3;
    const format = position === 0 ? "short" : "long";

    // 4. Generate script + metadata, tailored to format
    const lengthInstruction =
      format === "short"
        ? "Write for a YouTube Short: 15-30 seconds spoken, 40-70 words, punchy, hook in the first line."
        : "Write for a standard YouTube video: 30-45 seconds spoken, 90-120 words, conversational.";

    const scriptPrompt = `Create YouTube video content for an AI tools and technology explainer channel, based on this trending topic. Prioritize a genuinely specific, non-generic angle — avoid the flat, interchangeable "AI slop" tone that reads as mass-produced. Explain what it actually means for someone who uses tech day-to-day, not just industry insiders.

${lengthInstruction}

Open with a hook in the first sentence that gives someone a real reason to keep watching — a surprising fact, a concrete stake, or a clear question — not a generic "today we're talking about" opener. This directly affects watch time, which is what YouTube's algorithm rewards most.

For the SEO title: front-load the most searchable, specific term. For tags: include a mix of broad category tags (e.g. "AI", "technology") and specific long-tail tags matching likely search phrases — this affects discoverability more than the video content itself.

Topic: "${candidate.title}"
Source: ${candidate.source}

Respond ONLY in this exact JSON format, no other text:
{
  "script": "the spoken narration script, no stage directions",
  "seoTitle": "a specific, accurate YouTube title under 70 characters, must genuinely match the script${format === "short" ? ' — include "#Shorts" at the end' : ""}",
  "description": "2-3 sentence YouTube description, plain text, include 1-2 relevant hashtags at the end",
  "tags": ["8-12 relevant search tags mixing broad and specific, as an array of short strings"]
}`;

    const rawText = await askClaude(scriptPrompt, 700);
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { script: rawText, seoTitle: candidate.title, description: "", tags: [] };
    }

    // 5. Save to queue + mark trend as used
    const { data: queueItem, error: insertError } = await supabase
      .from("content_queue")
      .insert({
        trend_title: candidate.title,
        seo_title: parsed.seoTitle || candidate.title,
        description: parsed.description || "",
        tags: parsed.tags || [],
        script: parsed.script,
        format,
        selection_reason: reason,
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    await supabase.from("used_trends").insert({
      title: candidate.title,
      source: candidate.source,
    });

    // Immediately kick off HeyGen rendering — no manual tap needed.
    // A separate scheduled job (GitHub Actions) checks on this render
    // and auto-publishes once it's done, so the whole thing runs
    // without anyone opening the app.
    try {
      const videoId = await startVideoGeneration(parsed.script, format);
      await supabase
        .from("content_queue")
        .update({ heygen_video_id: videoId, video_status: "rendering" })
        .eq("id", queueItem.id);

      await sendDiscordUpdate(
        `🎬 New ${format === "short" ? "Short" : "video"} in production: **${parsed.seoTitle}**\n💡 Why this trend: ${reason}\nRendering now — will auto-publish once ready.`
      );
    } catch (heygenErr: any) {
      console.error("HeyGen auto-start failed:", heygenErr);
      await notifyFailure("HeyGen auto-generation", heygenErr.message);
      await sendDiscordUpdate(
        `📝 Draft ready but video generation failed to start: **${parsed.seoTitle}**\nCheck /queue to generate manually.`
      );
    }

    return NextResponse.json({ success: true, queueItem });
  } catch (err: any) {
    console.error("Auto-publish pipeline error:", err);
    await notifyFailure("Auto-publish pipeline", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


