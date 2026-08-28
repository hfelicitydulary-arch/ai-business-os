import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startVideoGeneration } from "@/lib/heygen";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { queueItemId } = await req.json();
  if (!queueItemId) {
    return NextResponse.json({ error: "queueItemId is required" }, { status: 400 });
  }

  const { data: item, error: fetchError } = await supabase
    .from("content_queue")
    .select("script, format")
    .eq("id", queueItemId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  try {
    const videoId = await startVideoGeneration(item.script, item.format);

    await supabase
      .from("content_queue")
      .update({ heygen_video_id: videoId, video_status: "rendering" })
      .eq("id", queueItemId);

    return NextResponse.json({ success: true, videoId });
  } catch (err: any) {
    console.error("HeyGen generation start error:", err);
    await supabase
      .from("content_queue")
      .update({ video_status: "failed" })
      .eq("id", queueItemId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
