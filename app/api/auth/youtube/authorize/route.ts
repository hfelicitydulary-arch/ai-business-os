import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect("https://ai-business-os-sigma-six.vercel.app/login");
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const redirectUri = "https://ai-business-os-sigma-six.vercel.app/api/auth/youtube/callback";
  const scope = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(
    scope
  )}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
