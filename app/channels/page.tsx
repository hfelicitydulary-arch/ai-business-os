'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Channel {
  id: string;
  channel_name: string;
  created_at: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChannels();
  }, []);

  async function fetchChannels() {
    setLoading(true);
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      setChannels(data.channels || []);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this channel? You can reconnect it later.')) return;
    await fetch(`/api/channels?id=${id}`, { method: 'DELETE' });
    fetchChannels();
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Channels</h1>
        <Link href="/" className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10">
          Back to dashboard
        </Link>
      </div>

      <a
        href="/api/auth/youtube/authorize"
        className="inline-block px-4 py-2 bg-green-500 text-black font-semibold rounded mb-8"
      >
        + Connect a new channel
      </a>

      {loading && <p className="text-white/50">Loading...</p>}

      {!loading && channels.length === 0 && (
        <p className="text-white/50">
          No channels connected yet. Click "Connect a new channel" and sign in with the
          Google account that owns the YouTube channel you want to add.
        </p>
      )}

      <div className="space-y-2">
        {channels.map((c) => (
          <div
            key={c.id}
            className="border border-white/10 rounded p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">{c.channel_name}</p>
              <p className="text-xs text-white/40">
                Connected {new Date(c.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => disconnect(c.id)}
              className="text-sm text-red-400 border border-red-500/30 rounded px-3 py-1.5 hover:bg-red-500/10"
            >
              Disconnect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
