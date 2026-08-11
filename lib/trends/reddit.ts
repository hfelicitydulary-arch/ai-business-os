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
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
      );
 
      if (!res.ok) {
        console.error(`Reddit fetch failed for r/${sub}: ${res.status} ${res.statusText}`);
        continue;
      }

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

