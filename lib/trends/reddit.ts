// Fetches trending posts from fact/curiosity-focused subreddits
// No API key required — uses Reddit's public JSON endpoints

const SUBREDDITS = [
  "todayilearned",
  "interestingasfuck",
  "damnthatsinteresting",
  "askscience",
  "space",
];

export interface TrendTopic {
  title: string;
  source: "reddit";
  sourceUrl: string;
  score: number;
  subreddit: string;
}

export async function fetchRedditTrends(): Promise<TrendTopic[]> {
  const results: TrendTopic[] = [];

  for (const sub of SUBREDDITS) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?t=day&limit=10`,
        { headers: { "User-Agent": "ai-bos-trend-scanner/1.0" } }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const posts = data?.data?.children ?? [];

      for (const post of posts) {
        const p = post.data;
        if (p.stickied) continue;
        results.push({
          title: p.title,
          source: "reddit",
          sourceUrl: `https://reddit.com${p.permalink}`,
          score: p.score,
          subreddit: sub,
        });
      }
    } catch (err) {
      console.error(`Failed to fetch r/${sub}:`, err);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
 
