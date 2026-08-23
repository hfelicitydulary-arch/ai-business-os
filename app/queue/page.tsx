'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface QueueItem {
  id: string;
  trend_title: string;
  seo_title: string;
  description: string;
  tags: string[];
  script: string;
  format: 'short' | 'long';
  status: 'awaiting_video' | 'published';
  video_url: string | null;
  published_url: string | null;
  selection_reason?: string;
  created_at: string;
}

interface Clip {
  id: number;
  thumbnail: string;
  duration: number;
  downloadUrl: string;
  photographer: string;
  photographerUrl: string;
}

interface Channel {
  id: string;
  channel_name: string;
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const [clipsByItem, setClipsByItem] = useState<Record<string, Clip[]>>({});
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<Record<string, Clip>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [errorByItem, setErrorByItem] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchItems();
    fetchChannels();
  }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChannels() {
    const res = await fetch('/api/channels');
    const data = await res.json();
    setChannels(data.channels || []);
    if (data.channels?.length > 0) setSelectedChannelId(data.channels[0].id);
  }

  async function findStockVideo(item: QueueItem) {
    setSearchingId(item.id);
    setErrorByItem((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const res = await fetch(
        `/api/stock-video/search?q=${encodeURIComponent(item.trend_title)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setClipsByItem((prev) => ({ ...prev, [item.id]: data.clips || [] }));
    } catch (err) {
      setErrorByItem((prev) => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : 'Something went wrong',
      }));
    } finally {
      setSearchingId(null);
    }
  }

  async function publish(item: QueueItem) {
    const clip = selectedClip[item.id];
    if (!clip || !selectedChannelId) return;

    setPublishingId(item.id);
    setErrorByItem((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const descriptionWithCredit = `${item.description}\n\nFootage: ${clip.photographer} via Pexels (${clip.photographerUrl})`;

      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: clip.downloadUrl,
          title: item.seo_title,
          description: descriptionWithCredit,
          tags: item.tags,
          channelId: selectedChannelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          videoUrl: clip.downloadUrl,
          publishedUrl: data.url,
        }),
      });

      fetchItems();
    } catch (err) {
      setErrorByItem((prev) => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : 'Publish failed',
      }));
    } finally {
      setPublishingId(null);
    }
  }

  const awaitingItems = items.filter((i) => i.status === 'awaiting_video');
  const publishedItems = items.filter((i) => i.status === 'published');

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Content Queue</h1>
        <Link href="/" className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10">
          Back to dashboard
        </Link>
      </div>

      {channels.length > 0 && (
        <div className="mb-6">
          <label className="text-sm text-white/50 block mb-1">Publish to channel:</label>
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="bg-white/5 border border-white/20 rounded p-2 text-white"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id} className="bg-black">
                {c.channel_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="text-white/50">Loading...</p>}

      <h2 className="text-xl font-semibold mb-3">
        Awaiting video ({awaitingItems.length})
      </h2>

      <div className="space-y-4 mb-10">
        {awaitingItems.length === 0 && !loading && (
          <p className="text-white/50 text-sm">
            No drafts yet. The auto-publish cron will drop new ones here 3x daily.
          </p>
        )}

        {awaitingItems.map((item) => (
          <div key={item.id} className="border border-white/10 rounded p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 uppercase">
                {item.format}
              </span>
              <span className="text-xs text-white/40">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
            <p className="font-medium mb-1">{item.seo_title}</p>
            {item.selection_reason && (
              <p className="text-xs text-white/40 mb-2">💡 {item.selection_reason}</p>
            )}
            <p className="text-sm text-white/70 bg-white/5 rounded p-2 mb-3">{item.script}</p>

            {!clipsByItem[item.id] && (
              <button
                onClick={() => findStockVideo(item)}
                disabled={searchingId === item.id}
                className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10 disabled:opacity-50"
              >
                {searchingId === item.id ? 'Searching...' : 'Find stock video'}
              </button>
            )}

            {errorByItem[item.id] && (
              <p className="text-red-400 text-xs mt-2">{errorByItem[item.id]}</p>
            )}

            {clipsByItem[item.id] && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {clipsByItem[item.id].map((clip) => (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClip((prev) => ({ ...prev, [item.id]: clip }))}
                    className={`relative rounded overflow-hidden border-2 ${
                      selectedClip[item.id]?.id === clip.id
                        ? 'border-green-500'
                        : 'border-transparent'
                    }`}
                  >
                    <img src={clip.thumbnail} alt="" className="w-full h-20 object-cover" />
                    <span className="absolute bottom-0 right-0 bg-black/70 text-xs px-1">
                      {clip.duration}s
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedClip[item.id] && (
              <button
                onClick={() => publish(item)}
                disabled={publishingId === item.id || !selectedChannelId}
                className="mt-3 px-4 py-2 bg-green-500 text-black font-semibold rounded disabled:opacity-50"
              >
                {publishingId === item.id ? 'Publishing...' : 'Publish this video'}
              </button>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3">
        Published ({publishedItems.length})
      </h2>
      <div className="space-y-2">
        {publishedItems.map((item) => (
          <div key={item.id} className="border border-green-500/30 rounded p-3 text-sm">
            <p>{item.seo_title}</p>
            {item.published_url && (
              <a href={item.published_url} target="_blank" className="text-green-400 underline text-xs">
                {item.published_url}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
