'use client';

import { useState } from 'react';
import Link from 'next/link';

type Clip = {
  rank: number;
  start: string;
  end: string;
  durationSec?: number;
  hook: string;
  title: string;
  captionLines?: string[];
  whyItWorks?: string;
  estimated?: boolean;
};

type Plan = {
  sourceTitle?: string;
  angle?: string;
  clips?: Clip[];
  descriptionTemplate?: string;
  tags?: string[];
  capcutSteps?: string[];
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
        body: JSON.stringify({ url, transcript, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPlan(data.plan);
      setSourceTitle(data.source?.title || data.plan?.sourceTitle || '');
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Clip Lab</h1>
            <p className="text-sm text-white/60 mt-1">
              Free Viblo-style workflow: paste a link → get clip plan (no $25/mo)
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/queue" className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10">
              Queue
            </Link>
            <Link href="/" className="text-sm px-3 py-1.5 border border-white/30 rounded hover:bg-white/10">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 mb-6">
          <label className="block text-xs text-white/50">Video URL (YouTube works best)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">Optional: paste captions / transcript (better timestamps)</label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="Paste YouTube captions or any transcript text..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">Optional notes (angle you want)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. focus on free AI tools for broke beginners"
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <button
            onClick={generate}
            disabled={loading || !url.trim()}
            className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium"
          >
            {loading ? 'Building clip plan...' : 'Generate clip plan'}
          </button>

          <p className="text-xs text-amber-200/80">
            Only reuse content you have rights to use (your videos, licensed, or careful commentary).
            This tool plans clips — you still cut in CapCut (free).
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
              {plan.angle && <p className="text-sm text-white/70 mt-2">{plan.angle}</p>}
            </div>

            {(plan.clips || []).map((clip) => (
              <div key={clip.rank} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-600/40 border border-purple-400/30">
                    Clip #{clip.rank}
                  </span>
                  <span className="text-xs text-white/60">
                    {clip.start} → {clip.end}
                    {clip.durationSec ? ` · ~${clip.durationSec}s` : ''}
                    {clip.estimated ? ' · estimated' : ''}
                  </span>
                </div>
                <h3 className="font-semibold mb-1">{clip.title}</h3>
                <p className="text-sm text-purple-200 mb-2">Hook: {clip.hook}</p>
                {clip.whyItWorks && (
                  <p className="text-xs text-white/50 mb-2">{clip.whyItWorks}</p>
                )}
                {clip.captionLines && clip.captionLines.length > 0 && (
                  <div className="text-xs bg-black/40 rounded p-2 mb-3 text-white/70 whitespace-pre-wrap">
                    {clip.captionLines.join('\n')}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copyText(clip.title)}
                    className="text-xs px-3 py-1.5 rounded border border-white/20 hover:border-purple-400"
                  >
                    Copy title
                  </button>
                  <button
                    onClick={() =>
                      copyText(
                        [clip.hook, ...(clip.captionLines || [])].filter(Boolean).join('\n')
                      )
                    }
                    className="text-xs px-3 py-1.5 rounded border border-white/20 hover:border-purple-400"
                  >
                    Copy captions
                  </button>
                  <button
                    onClick={() =>
                      copyText(
                        `${clip.title}\n${clip.start} - ${clip.end}\nHook: ${clip.hook}\n\n${(clip.captionLines || []).join('\n')}`
                      )
                    }
                    className="text-xs px-3 py-1.5 rounded bg-purple-600"
                  >
                    Copy full clip pack
                  </button>
                </div>
              </div>
            ))}

            {plan.descriptionTemplate && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Description template</div>
                  <button
                    onClick={() => copyText(plan.descriptionTemplate || '')}
                    className="text-xs px-3 py-1.5 rounded border border-white/20"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-white/70 whitespace-pre-wrap">{plan.descriptionTemplate}</p>
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

            {plan.capcutSteps && plan.capcutSteps.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-medium text-amber-100 mb-2">CapCut steps (free)</div>
                <ol className="list-decimal ml-4 text-sm text-white/80 space-y-1">
                  {plan.capcutSteps.map((step, i) => (
                    <li key={i}>{step}</li>
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
