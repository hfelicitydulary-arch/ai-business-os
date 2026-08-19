import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchRedditTrends } from "../../../../lib/trends/reddit";
import { fetchDevToTrends } from "../../../../lib/trends/devto";
import { notifyFailure } from "../../../../lib/notify";

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

export async function GET(req: NextRequest) {
  // Only Vercel's cron scheduler (or someone with the secret) can trigger this
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 1. Get fresh trends and filter out anything scripted in the last 30 days
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

    const candidate = allTrends.find((t) => !usedTitles.has(t.title));

    if (!candidate) {
      await sendDiscordUpdate("⚠️ Auto-publish: no fresh (unused) trends available right now.");
      return NextResponse.json({ success: false, reason: "No fresh trends" });
    }

    // 2. Decide format: alternate based on how many queue items exist today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from("content_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    const format = (todayCount ?? 0) % 2 === 0 ? "short" : "long";

    // 3. Generate script + metadata, tailored to format
    const lengthInstruction =
      format === "short"
        ? "Write for a YouTube Short: 15-30 seconds spoken, 40-70 words, punchy, hook in the first line."
        : "Write for a standard YouTube video: 30-45 seconds spoken, 90-120 words, conversational.";

    const prompt = `Create YouTube video content based on this trending topic. Prioritize a genuinely specific, non-generic angle — avoid the flat, interchangeable "AI slop" tone that reads as mass-produced.

${lengthInstruction}

Topic: "${candidate.title}"
Source: ${candidate.source}

Respond ONLY in this exact JSON format, no other text:
{
  "script": "the spoken narration script, no stage directions",
  "seoTitle": "a specific, accurate YouTube title under 70 characters, must genuinely match the script${format === "short" ? ' — include "#Shorts" at the end' : ""}",
  "description": "2-3 sentence YouTube description, plain text",
  "tags": ["5-8 relevant search tags as an array of short strings"]
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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

    if (!claudeRes.ok) {
      throw new Error(`Claude API failed: ${claudeRes.status} ${await claudeRes.text()}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { script: rawText, seoTitle: candidate.title, description: "", tags: [] };
    }

    // 4. Save to queue + mark trend as used
    const { data: queueItem, error: insertError } = await supabase
      .from("content_queue")
      .insert({
        trend_title: candidate.title,
        seo_title: parsed.seoTitle || candidate.title,
        description: parsed.description || "",
        tags: parsed.tags || [],
        script: parsed.script,
        format,
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    await supabase.from("used_trends").insert({
      title: candidate.title,
      source: candidate.source,
    });

    await sendDiscordUpdate(
      `📝 New ${format === "short" ? "Short" : "video"} draft ready: **${parsed.seoTitle}**\nAttach a video and publish from the /queue page.`
    );

    return NextResponse.json({ success: true, queueItem });
  } catch (err: any) {
    console.error("Auto-publish pipeline error:", err);
    await notifyFailure("Auto-publish pipeline", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
