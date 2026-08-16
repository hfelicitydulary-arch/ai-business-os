import { TrendTopic } from "./reddit";

export async function fetchDevToTrends(): Promise<TrendTopic[]> {
  const results: TrendTopic[] = [];

  try {
    const res = await fetch("https://dev.to/api/articles?top=1&per_page=15");
    const articles = await res.json();

    for (const article of articles) {
      if (!article.title) continue;

      results.push({
        title: article.title,
        source: "devto",
        sourceUrl: article.url,
        score: article.positive_reactions_count || 0,
        subreddit: "dev.to",
      });
    }
  } catch (err) {
    console.error("Failed to fetch Dev.to trends:", err);
  }

  return results;
}
