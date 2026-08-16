import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect("https://ai-business-os-sigma-six.vercel.app/login");
  }

  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
  const redirectUri = "https://ai-business-os-sigma-six.vercel.app/api/auth/youtube/callback";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.refresh_token) {
    return NextResponse.json(
      {
        error: "No refresh_token returned. This can happen if the channel was already authorized before — remove access at myaccount.google.com/permissions and try again.",
        tokenData,
      },
      { status: 400 }
    );
  }

  // Look up the actual channel name using the fresh access token
  let channelName = "Unnamed channel";
  try {
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const channelData = await channelRes.json();
    channelName = channelData.items?.[0]?.snippet?.title || channelName;
  } catch (err) {
    console.error("Failed to fetch channel name:", err);
  }

  const { error: insertError } = await supabase.from("youtube_channels").insert({
    channel_name: channelName,
    refresh_token: tokenData.refresh_token,
    connected_by: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.redirect("https://ai-business-os-sigma-six.vercel.app/channels?connected=true");
}
