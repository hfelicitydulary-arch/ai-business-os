export interface TrendTopic {
  title: string;
  source: "hackernews";
  sourceUrl: string;
  score: number;
  subreddit: string;
}

export async function fetchRedditTrends(): Promise<TrendTopic[]> {
  const results: TrendTopic[] = [];

  try {
    const topIdsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    const topIds: number[] = await topIdsRes.json();
    const first15 = topIds.slice(0, 15);

    for (const id of first15) {
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = await itemRes.json();
      if (!item || !item.title) continue;

      results.push({
        title: item.title,
        source: "hackernews",
        sourceUrl: item.url || `https://news.ycombinator.com/item?id=${id}`,
        score: item.score || 0,
        subreddit: "hackernews",
      });
    }
  } catch (err) {
    console.error("Failed to fetch Hacker News trends:", err);
  }

  return results.sort((a, b) => b.score - a.score);
}

