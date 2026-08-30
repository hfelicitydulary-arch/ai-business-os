import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { checkVideoStatus } from "../../../../lib/heygen";
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

async function getAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function uploadToYoutube(
  refreshToken: string,
  videoUrl: string,
  title: string,
  description: string,
  tags: string[]
) {
  const accessToken = await getAccessToken(refreshToken);

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch rendered video — status ${videoRes.status}`);
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  const metadata = {
    snippet: { title, description, tags, categoryId: "22" },
    status: { privacyStatus: "private" },
  };

  const boundary = "AIBOS_BOUNDARY";
  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata
      )}\r\n--${boundary}\r\nContent-Type: video/*\r\n\r\n`
    ),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`YouTube upload failed: ${JSON.stringify(uploadData)}`);
  }

  return `https://youtube.com/watch?v=${uploadData.id}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: pending } = await supabase
    .from("content_queue")
    .select("*")
    .eq("video_status", "rendering");

  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const { data: channels } = await supabase
    .from("youtube_channels")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  const defaultChannel = channels?.[0];

  let processed = 0;
  let stillRendering = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const status = await checkVideoStatus(item.heygen_video_id);

      if (status.status === "processing") {
        stillRendering++;
        continue;
      }

      if (status.status === "failed") {
        await supabase
          .from("content_queue")
          .update({ video_status: "failed" })
          .eq("id", item.id);
        failed++;
        await sendDiscordUpdate(`⚠️ Video render failed: **${item.seo_title}**`);
        continue;
      }

      if (status.status === "completed" && status.videoUrl) {
        if (!defaultChannel) {
          await sendDiscordUpdate(
            `⚠️ Video ready but no YouTube channel connected: **${item.seo_title}**\nConnect one at /channels, then it'll publish on the next check.`
          );
          continue;
        }

        const publishedUrl = await uploadToYoutube(
          defaultChannel.refresh_token,
          status.videoUrl,
          item.seo_title,
          item.description || "",
          item.tags || []
        );

        await supabase
          .from("content_queue")
          .update({
            video_status: "completed",
            video_url: status.videoUrl,
            published_url: publishedUrl,
            status: "published",
            published_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        processed++;
        await sendDiscordUpdate(
          `✅ Published automatically: **${item.seo_title}**\n${publishedUrl}`
        );
      }
    } catch (err: any) {
      console.error(`Failed to process queue item ${item.id}:`, err);
      await notifyFailure("Auto-publish (process-pending)", err.message);
      failed++;
    }
  }

  return NextResponse.json({ success: true, processed, stillRendering, failed });
}
