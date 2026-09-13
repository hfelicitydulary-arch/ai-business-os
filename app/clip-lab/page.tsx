'use client';

import { useState } from 'react';
import Link from 'next/link';

type ShortScript = {
  rank: number;
  title: string;
  hook: string;
  script: string;
  captionLines?: string[];
};

type Plan = {
  sourceTitle?: string;
  summary?: string;
  longScript?: string;
  shortScripts?: ShortScript[];
  description?: string;
  tags?: string[];
  filmingTips?: string[];
};

export default function ClipLabPage() {
  const [url, setUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sourceTitle, setSourceTitle] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await fetch('/api/clip-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, transcript, notes, mode: 'script' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPlan(data.plan);
      setSourceTitle(data.source?.title || data.plan?.sourceTitle || '');
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Something went wrong';
      if (/load failed|failed to fetch|networkerror/i.test(msg)) {
        setError(
          'Load failed: could not reach API. Stay logged in, hard-refresh, try again.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-3xl font-bold">Clip Lab</h1>
            <p className="text-sm text-white/60 mt-1">
              Paste a link → get a full original script (same points) for YOUR video
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/queue"
              className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10"
            >
              Queue
            </Link>
            <Link
              href="/"
              className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 mb-6">
          <label className="block text-xs text-white/50">Video URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">
            Optional but recommended: paste captions / transcript (more accurate script)
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="Paste YouTube transcript so the script matches what the video actually says..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">Optional notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. make it for broke beginners, phone only"
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <button
            onClick={generate}
            disabled={loading || !url.trim()}
            className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium"
          >
            {loading ? 'Writing scripts...' : 'Generate full script'}
          </button>

          <p className="text-xs text-white/50">
            Output is an original script covering the same ideas — you film in your own style
            (screen record, voiceover, CapCut). Not a finished MP4 export.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg p-3">
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50 mb-1">Source</div>
              <div className="font-medium">{sourceTitle || plan.sourceTitle}</div>
              {plan.summary && (
                <p className="text-sm text-white/70 mt-2 whitespace-pre-wrap">{plan.summary}</p>
              )}
            </div>

            {plan.longScript && (
              <div className="rounded-xl border border-purple-400/30 bg-purple-600/10 p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-sm font-medium">Long video script</div>
                  <button
                    onClick={() => copyText(plan.longScript || '')}
                    className="text-xs px-3 py-1.5 rounded bg-purple-600"
                  >
                    Copy long script
                  </button>
                </div>
                <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                  {plan.longScript}
                </p>
              </div>
            )}

            {(plan.shortScripts || []).map((s) => (
              <div key={s.rank} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/50 mb-1">Short #{s.rank}</div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-purple-200 mb-2">Hook: {s.hook}</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">{s.script}</p>
                {s.captionLines && s.captionLines.length > 0 && (
                  <div className="text-xs bg-black/40 rounded p-2 mb-3 text-white/60 whitespace-pre-wrap">
                    {s.captionLines.join('\n')}
                  </div>
                )}
                <button
                  onClick={() =>
                    copyText(
                      `${s.title}\n\nHook: ${s.hook}\n\n${s.script}\n\n${(s.captionLines || []).join('\n')}`
                    )
                  }
                  className="text-xs px-3 py-1.5 rounded border border-white/20 hover:border-purple-400"
                >
                  Copy short pack
                </button>
              </div>
            ))}

            {plan.description && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Description</div>
                  <button
                    onClick={() => copyText(plan.description || '')}
                    className="text-xs px-3 py-1.5 rounded border border-white/20"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-white/70 whitespace-pre-wrap">{plan.description}</p>
              </div>
            )}

            {plan.tags && plan.tags.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Tags</div>
                  <button
                    onClick={() => copyText((plan.tags || []).join(', '))}
                    className="text-xs px-3 py-1.5 rounded border border-white/20"
                  >
                    Copy tags
                  </button>
                </div>
                <p className="text-xs text-white/60">{plan.tags.join(', ')}</p>
              </div>
            )}

            {plan.filmingTips && plan.filmingTips.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-medium text-amber-100 mb-2">Filming tips</div>
                <ol className="list-decimal ml-4 text-sm text-white/80 space-y-1">
                  {plan.filmingTips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
