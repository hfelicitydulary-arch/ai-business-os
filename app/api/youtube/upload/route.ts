import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN!;

  // Step 1: exchange refresh token for a fresh access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.json({ error: "Failed to refresh access token", tokenData }, { status: 500 });
  }

  return NextResponse.json({
    message: "Access token refreshed successfully. Ready to upload once video file handling is added.",
    accessTokenPreview: tokenData.access_token.slice(0, 20) + "...",
  });
}
