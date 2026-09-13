import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Queue a link for generation (works even if user goes offline after submit) */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const url = (body.url || "").trim();
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clip_lab_jobs")
      .insert({
        user_id: user.id,
        url,
        transcript: (body.transcript || "").trim() || null,
        notes: (body.notes || "").trim() || null,
        status: "pending",
      })
      .select("id, status, url, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message.includes("clip_lab_jobs") || error.code === "42P01"
              ? "Database table missing. Run supabase/clip-lab-jobs-schema.sql in Supabase SQL Editor once."
              : error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job: data,
      message:
        "Queued. You can leave. Generation runs on the server; refresh Clip Lab later for the script.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** List recent jobs for current user */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("clip_lab_jobs")
      .select("id, url, status, source_title, result, error, created_at, finished_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message, jobs: [] }, { status: 500 });
    }

    return NextResponse.json({ jobs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, jobs: [] }, { status: 500 });
  }
}
