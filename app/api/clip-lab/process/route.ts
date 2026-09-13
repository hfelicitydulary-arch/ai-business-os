import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseModelJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = start !== -1 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

async function generatePlan(url: string, transcript: string, notes: string) {
  let title = "Unknown title";
  try {
    const oe = await fetch(
      "https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json"
    );
    if (oe.ok) {
      const j = await oe.json();
      title = j.title || title;
    }
  } catch {
    /* ignore */
  }

  const prompt = `Write original YouTube scripts from this source. Same core ideas, different words. Niche when relevant: AI money for beginners.

SOURCE title: ${title}
URL: ${url}
${notes ? "Notes: " + notes : ""}
${transcript ? "Transcript:\n" + transcript.slice(0, 8000) : "No transcript — infer carefully."}

Return ONLY raw JSON:
{
  "sourceTitle": "string",
  "summary": "2-3 sentences",
  "longScript": "spoken narration 200-350 words",
  "shortScripts": [
    {"rank":1,"title":"Shorts title","hook":"first line","script":"35-50s spoken","captionLines":["l1","l2"]}
  ],
  "description": "description",
  "tags": ["t1","t2"],
  "filmingTips": ["tip1"]
}
Exactly 3 shortScripts.`;

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
    throw new Error("Claude failed: " + res.status + " " + (await res.text()).slice(0, 200));
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";
  let parsed = parseModelJson(raw);
  if (!parsed) parsed = { sourceTitle: title, summary: "parse failed", longScript: "", shortScripts: [] };
  return { title, plan: parsed };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.CRONSECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No ANTHROPIC_API_KEY" }, { status: 500 });
  }

  try {
    const supabase = createAdminClient();
    const { data: jobs, error } = await supabase
      .from("clip_lab_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (error) {
      return NextResponse.json({ error: error.message, processed: 0 }, { status: 500 });
    }
    if (!jobs?.length) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    let processed = 0;
    for (const job of jobs) {
      await supabase
        .from("clip_lab_jobs")
        .update({ status: "processing" })
        .eq("id", job.id);

      try {
        const { title, plan } = await generatePlan(
          job.url,
          job.transcript || "",
          job.notes || ""
        );
        await supabase
          .from("clip_lab_jobs")
          .update({
            status: "done",
            source_title: title,
            result: plan,
            finished_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", job.id);
        processed++;
      } catch (e: any) {
        await supabase
          .from("clip_lab_jobs")
          .update({
            status: "failed",
            error: e.message || "failed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return NextResponse.json({ success: true, processed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
