import { NextRequest, NextResponse } from "next/server";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token as string;
} 

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, title, description, tags } = await req.json();

    if (!videoUrl || !title) {
      return NextResponse.json(
        { error: "videoUrl and title are required" },
        { status: 400 }
      );
    }

    // 1. Get a fresh access token
    const accessToken = await getAccessToken();

    // 2. Fetch the video file from the generator's URL
    const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) {
      throw new Error(
        `Failed to fetch video from ${videoUrl} — status ${videoRes.status} ${videoRes.statusText}`
      );
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    // 3. Build metadata for YouTube
    const metadata = {
      snippet: {
        title,
        description: description || "",
        tags: tags || [],
        categoryId: "22", // People & Blogs — change if needed
      },
      status: {
        privacyStatus: "private", // switch to "public" once you trust the pipeline
      },
    };

    // 4. Multipart upload to YouTube Data API v3 (videos.insert)
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

    return NextResponse.json({
      success: true,
      videoId: uploadData.id,
      url: `https://youtube.com/watch?v=${uploadData.id}`,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
