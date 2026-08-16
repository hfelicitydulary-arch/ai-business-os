export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchRedditTrends } from "../../../../lib/trends/reddit";
import { fetchDevToTrends } from "../../../../lib/trends/devto";
import { notifyFailure } from "../../../../lib/notify";

export async function GET() {
  try {
    const [hackerNews, devTo] = await Promise.all([
      fetchRedditTrends(),
      fetchDevToTrends(),
    ]);
    const trends = [...hackerNews, ...devTo].sort((a, b) => b.score - a.score);
    return NextResponse.json({
      success: true,
      count: trends.length,
      trends: trends.slice(0, 20),
    });
  } catch (err) {
    console.error("Trend scan failed:", err);
    await notifyFailure("Trend scan", String(err));
    return NextResponse.json(
      { success: false, error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
