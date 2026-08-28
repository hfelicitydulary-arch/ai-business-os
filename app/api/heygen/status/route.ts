import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkVideoStatus } from "@/lib/heygen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const queueItemId = searchParams.get("queueItemId");

  if (!queueItemId) {
    return NextResponse.json({ error: "queueItemId is required" }, { status: 400 });
  }

  const { data: item, error: fetchError } = await supabase
    .from("content_queue")
    .select("heygen_video_id, video_status")
    .eq("id", queueItemId)
    .single();

  if (fetchError || !item?.heygen_video_id) {
    return NextResponse.json({ error: "No HeyGen video started for this item" }, { status: 404 });
  }

  if (item.video_status === "completed") {
    return NextResponse.json({ status: "completed" });
  }

  try {
    const result = await checkVideoStatus(item.heygen_video_id);

    if (result.status === "completed" && result.videoUrl) {
      await supabase
        .from("content_queue")
        .update({ video_status: "completed", video_url: result.videoUrl })
        .eq("id", queueItemId);
    } else if (result.status === "failed") {
      await supabase
        .from("content_queue")
        .update({ video_status: "failed" })
        .eq("id", queueItemId);
    }

    return NextResponse.json({
      status: result.status,
      videoUrl: result.videoUrl,
      error: result.error,
    });
  } catch (err: any) {
    console.error("HeyGen status check error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
