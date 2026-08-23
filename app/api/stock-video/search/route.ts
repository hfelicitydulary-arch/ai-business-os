import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  if (!process.env.PEXELS_API_KEY) {
    return NextResponse.json(
      { error: "PEXELS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        query
      )}&orientation=landscape&size=medium&per_page=6`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );

    if (!res.ok) {
      throw new Error(`Pexels API failed: ${res.status}`);
    }

    const data = await res.json();

    const clips = (data.videos || []).map((v: any) => {
      // Pick a reasonably sized file — prefer HD, fall back to whatever's smallest
      const files = v.video_files || [];
      const hdFile =
        files.find((f: any) => f.quality === "hd") || files[0];

      return {
        id: v.id,
        thumbnail: v.image,
        duration: v.duration,
        downloadUrl: hdFile?.link,
        photographer: v.user?.name,
        photographerUrl: v.user?.url,
      };
    }).filter((c: any) => c.downloadUrl);

    return NextResponse.json({ clips });
  } catch (err: any) {
    console.error("Stock video search error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
