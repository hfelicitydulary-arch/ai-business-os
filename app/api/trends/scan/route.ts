export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchRedditTrends } from "@/lib/trends/reddit";

export async function GET() {
  try {
    const trends = await fetchRedditTrends();
    return NextResponse.json({
      success: true,
      count: trends.length,
      trends: trends.slice(0, 20),
    });
  } catch (err) {
    console.error("Trend scan failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
