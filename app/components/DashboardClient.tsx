'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Trend {
  title: string;
  source: string;
  sourceUrl: string;
  score: number;
  subreddit: string;
}

interface Channel {
  id: string;
  channel_name: string;
}

interface UploadResult {
  title: string;
  success: boolean;
  url?: string;
  error?: string;
  timestamp: string;
}

export default function DashboardClient() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [trendsError, setTrendsError] = useState('');

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<UploadResult[]>([]);

  const [scripts, setScripts] = useState<Record<number, { script: string; seoTitle: string; description: string; tags: string[] }>>({});
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [scriptError, setScriptError] = useState<Record<number, string>>({});
  const [usedTitles, setUsedTitles] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Record<number, { riskLevel: string; issues: string[]; suggestion: string }>>({});

  useEffect(() => {
    fetchTrends();
    fetchChannels();
    fetchUsedTitles();
  }, []);

  async function fetchUsedTitles() {
    try {
      const res = await fetch('/api/scripts/used');
      const data = await res.json();
      if (data.titles) {
        setUsedTitles(new Set(data.titles));
      }
    } catch (err) {
      // Non-fatal
    }
  }

  async function fetchTrends() {
    setLoadingTrends(true);
    setTrendsError('');
    try {
      const res = await fetch('/api/trends/scan');
      const data = await res.json();
      if (data.success) {
        setTrends(data.trends);
      } else {
        setTrendsError(data.error || 'Failed to load trends');
      }
    } catch (err) {
      setTrendsError('Failed to reach trends API');
    } finally {
      setLoadingTrends(false);
    }
  }

  async function fetchChannels() {
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      if (data.channels) {
        setChannels(data.channels);
        if (data.channels.length > 0) {
          setSelectedChannelId(data.channels[0].id);
        }
      }
    } catch (err) {
      // Non-fatal
    }
  }

  async function generateScript(idx: number, trend: Trend) {
    setGeneratingIdx(idx);
    setScriptError((prev) => ({ ...prev, [idx]: '' }));
    try {
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trend.title, source: trend.source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate script');
      setScripts((prev) => ({
        ...prev,
        [idx]: {
          script: data.script,
          seoTitle: data.seoTitle,
          description: data.description,
          tags: data.tags,
        },
      }));
      setUsedTitles((prev) => new Set(prev).add(trend.title));

      // Run compliance check automatically after script generation
      try {
        const reviewRes = await fetch('/api/content/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: data.seoTitle, script: data.script }),
        });
        const reviewData = await reviewRes.json();
        if (reviewRes.ok) {
          setReviews((prev) => ({ ...prev, [idx]: reviewData.review }));
        }
      } catch (reviewErr) {
        // Non-fatal — script still usable even if compliance check fails to run
      }
    } catch (err) {
      setScriptError((prev) => ({
        ...prev,
        [idx]: err instanceof Error ? err.message : 'Something went wrong',
      }));
    } finally {
      setGeneratingIdx(null);
    }
  }

  function useScriptAsTitle(idx: number) {
    const s = scripts[idx];
    if (!s) return;
    setTitle(s.seoTitle);
    setDescription(s.description);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrl || !title || !selectedChannelId) return;
    setUploading(true);
    try {
      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, title, description, channelId: selectedChannelId }),
      });
      const data = await res.json();
      setHistory((prev) => [
        {
          title,
          success: res.ok,
          url: data.url,
          error: data.error,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      if (res.ok) {
        setVideoUrl('');
        setTitle('');
        setDescription('');
      }
    } catch (err) {
      setHistory((prev) => [
        {
          title,
          success: false,
          error: 'Network error',
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-4xl font-bold">AI BOS</h1>
        <div className="flex gap-2">
          <Link
            href="/queue"
            className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10"
          >
            Content queue
          </Link>
          <Link
            href="/channels"
            className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10"
          >
            Manage channels
          </Link>
        </div>
      </div>
      <p className="text-green-400 mb-8">Your AI Business Team is Ready</p>

      {/* Trends section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Trending Topics</h2>
          <button
            onClick={fetchTrends}
            className="text-sm px-3 py-1 border border-white/30 rounded hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {loadingTrends && <p className="text-white/50">Scanning trends...</p>}
        {trendsError && <p className="text-red-400">{trendsError}</p>}

        <div className="space-y-2">
          {trends.map((t, i) => (
            <div key={i} className="border border-white/10 rounded p-3 hover:bg-white/5">
              <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
                <div className="flex justify-between text-sm text-white/50 mb-1">
                  <span>{t.source}</span>
                  <span>score: {t.score}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{t.title}</span>
                  {usedTitles.has(t.title) && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Already scripted
                    </span>
                  )}
                </div>
              </a>

              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => generateScript(i, t)}
                  disabled={generatingIdx === i}
                  className="text-xs px-2 py-1 border border-white/20 rounded hover:bg-white/10 disabled:opacity-50"
                >
                  {generatingIdx === i ? 'Generating...' : 'Generate script'}
                </button>
                {scripts[i] && (
                  <button
                    onClick={() => useScriptAsTitle(i)}
                    className="text-xs px-2 py-1 border border-green-500/40 text-green-400 rounded hover:bg-green-500/10"
                  >
                    Use as upload title
                  </button>
                )}
              </div>

              {scriptError[i] && (
                <p className="text-red-400 text-xs mt-2">{scriptError[i]}</p>
              )}

              {scripts[i] && (
                <div className="mt-2 bg-white/5 border border-white/10 rounded p-3 text-sm whitespace-pre-wrap">
                  <p className="text-white/50 text-xs mb-1">Suggested title: {scripts[i].seoTitle}</p>
                  {scripts[i].script}
                </div>
              )}

              {reviews[i] && (
                <div
                  className={`mt-2 border rounded p-3 text-xs ${
                    reviews[i].riskLevel === 'high'
                      ? 'border-red-500/40 bg-red-500/10'
                      : reviews[i].riskLevel === 'medium'
                      ? 'border-yellow-500/40 bg-yellow-500/10'
                      : 'border-green-500/40 bg-green-500/10'
                  }`}
                >
                  <div className="font-semibold uppercase mb-1">
                    Ban risk: {reviews[i].riskLevel}
                  </div>
                  {reviews[i].issues.length > 0 && (
                    <ul className="list-disc list-inside mb-1">
                      {reviews[i].issues.map((issue, j) => (
                        <li key={j}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <div className="text-white/70">{reviews[i].suggestion}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Upload section */}
      <section>
        <h2 className="text-xl font-semibold mb-3">YouTube Upload</h2>

        {channels.length === 0 ? (
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded p-4 mb-6 text-sm">
            No channels connected yet.{' '}
            <Link href="/channels" className="text-yellow-400 underline">
              Connect a channel
            </Link>{' '}
            before uploading.
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-3 mb-6">
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded p-2 text-white"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id} className="bg-black">
                  {c.channel_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Video URL (from video-gen API)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded p-2 text-white"
            />
            <input
              type="text"
              placeholder="Video title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded p-2 text-white"
            />
            <textarea
              placeholder="Video description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded p-2 text-white text-sm"
              rows={2}
            />
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-green-500 text-black font-semibold rounded disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload to YouTube'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {history.map((h, i) => (
            <div
              key={i}
              className={`border rounded p-3 text-sm ${
                h.success ? 'border-green-500/40' : 'border-red-500/40'
              }`}
            >
              <div className="flex justify-between text-white/50 mb-1">
                <span>{h.timestamp}</span>
                <span>{h.success ? 'Success' : 'Failed'}</span>
              </div>
              <div>{h.title}</div>
              {h.url && (
                <a href={h.url} target="_blank" className="text-green-400 underline">
                  {h.url}
                </a>
              )}
              {h.error && <div className="text-red-400">{h.error}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}




