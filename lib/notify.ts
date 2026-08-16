export async function notifyFailure(context: string, error: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🚨 **AI-BOS Failure**\n**Where:** ${context}\n**Error:** ${error}`,
      }),
    });
  } catch (err) {
    console.error("Failed to send Discord notification:", err);
  }
}
