'use client';

import { useEffect, useRef, useState } from 'react';
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
  contentBreakdown?: string;
  summary?: string;
  longScript?: string;
  shortScripts?: ShortScript[];
  description?: string;
  tags?: string[];
  filmingTips?: string[];
};

const STORAGE_KEY = 'clip_lab_last_result_v1';
const NICHE_KEY = 'clip_lab_niche_v1';

export default function ClipLabPage() {
  const [url, setUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [niche, setNiche] = useState('Making money with AI for beginners');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sourceTitle, setSourceTitle] = useState('');
  const [captionSource, setCaptionSource] = useState('');
  const [keepOpenWarn, setKeepOpenWarn] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [queueMsg, setQueueMsg] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const loadingRef = useRef(false);

  async function loadJobs() {
    try {
      const res = await fetch('/api/clip-lab/jobs');
      const data = await res.json();
      if (data.jobs) setJobs(data.jobs);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    try {
      const n = localStorage.getItem(NICHE_KEY);
      if (n) setNiche(n);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.plan) {
          setPlan(saved.plan);
          setSourceTitle(saved.sourceTitle || '');
          setUrl(saved.url || '');
        }
      }
    } catch {
      /* ignore */
    }
    loadJobs();
  }, []);

  async function queueForLater() {
    setQueueMsg('');
    setError('');
    try {
      const res = await fetch('/api/clip-lab/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, transcript, notes, niche }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Queue failed');
      setQueueMsg(data.message || 'Queued. You can leave the app.');
      // kick process (best-effort; cron will also run)
      fetch('/api/clip-lab/process-mine', { method: 'POST' }).catch(() => {});
      loadJobs();
    } catch (e: any) {
      setError(e.message || 'Queue failed');
    }
  }

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && loadingRef.current) {
        setKeepOpenWarn(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  async function generate() {
    setLoading(true);
    setError('');
    setKeepOpenWarn(false);
    setPlan(null);
    try {
      const res = await fetch('/api/clip-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, transcript, notes, niche, mode: 'script' }),
        // help some browsers keep the request alive longer
        keepalive: true,
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 504 || res.status === 408
            ? 'Server timed out. Keep this screen open and try again.'
            : 'Bad response from server (' + res.status + '). Try again.'
        );
      }

      if (!res.ok) throw new Error(data.error || 'Failed (' + res.status + ')');

      setPlan(data.plan);
      const st = data.source?.title || data.plan?.sourceTitle || '';
      setSourceTitle(st);
      setCaptionSource(data.captionSource || '');
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ plan: data.plan, sourceTitle: st, url, savedAt: Date.now() })
        );
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Something went wrong';
      if (/load failed|failed to fetch|networkerror|aborted/i.test(msg)) {
        setError(
          'Request interrupted. On iPhone, staying in this screen until it finishes works best. If you switched apps, tap Generate again — keep Clip Lab open.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, label = 'Copied') {
    if (!text) {
      setCopyStatus('Nothing to copy');
      setTimeout(() => setCopyStatus(''), 2000);
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyStatus(label + ' ✓');
      setTimeout(() => setCopyStatus(''), 2500);
    } catch {
      setCopyStatus('Copy failed — long-press and copy manually');
      setTimeout(() => setCopyStatus(''), 3000);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-3xl font-bold">Clip Lab</h1>
            <p className="text-sm text-white/60 mt-1">
              Paste a link → full original script for YOUR video
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/queue" className="text-sm px-3 py-1.5 border border-white/30 rounded">
              Queue
            </Link>
            <Link href="/" className="text-sm px-3 py-1.5 border border-white/30 rounded">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 mb-6">
          <label className="block text-xs text-white/50">Your channel niche (each user sets their own)</label>
          <input
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value);
              try { localStorage.setItem(NICHE_KEY, e.target.value); } catch {}
            }}
            placeholder="e.g. fitness for beginners, cooking, AI money, tech reviews..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">Video URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">
            Optional: paste transcript (better meaning accuracy)
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            placeholder="Paste YouTube transcript..."
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <label className="block text-xs text-white/50">Optional notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. broke beginners, phone only"
            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <button
            onClick={generate}
            disabled={loading || !url.trim()}
            className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium"
          >
            {loading ? 'Writing scripts... keep this screen open' : 'Generate full script (now)'}
          </button>

          <button
            onClick={queueForLater}
            disabled={!url.trim() || loading}
            className="w-full md:w-auto px-5 py-2.5 rounded-lg border border-purple-400/50 text-sm font-medium hover:bg-purple-600/20 disabled:opacity-40 ml-0 md:ml-2"
          >
            Queue link & leave (generates offline)
          </button>

          {queueMsg && (
            <p className="text-xs text-green-300 bg-green-500/10 border border-green-500/30 rounded p-2">
              {queueMsg}
            </p>
          )}

          {loading && (
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded p-2">
              Keep Clip Lab open until it finishes. Switching apps on iPhone can cancel the
              request — that causes &quot;Load failed&quot;.
            </p>
          )}

          {keepOpenWarn && loading && (
            <p className="text-xs text-red-200">
              You left the app while generating. Come back and wait, or tap Generate again.
            </p>
          )}

          <p className="text-xs text-white/50">
            Last result is saved on this phone so you can leave after it completes.
          </p>
        </div>

        {copyStatus && (
          <div className="mb-4 text-sm text-green-200 border border-green-500/40 bg-green-500/15 rounded-lg p-3 sticky top-2 z-20">
            {copyStatus}
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg p-3">
            {error}
          </div>
        )}

        {jobs.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Your jobs (works while offline)</div>
              <button onClick={loadJobs} className="text-xs px-2 py-1 border border-white/20 rounded">
                Refresh
              </button>
            </div>
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="text-xs border border-white/10 rounded p-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-white/80 truncate">{j.source_title || j.url}</span>
                    <span className="shrink-0 text-white/50">{j.status}</span>
                  </div>
                  {j.status === 'done' && j.result && (
                    <button
                      className="mt-1 text-purple-300 underline"
                      onClick={() => {
                        setPlan(j.result);
                        setSourceTitle(j.source_title || '');
                      }}
                    >
                      Open script
                    </button>
                  )}
                  {j.status === 'failed' && (
                    <p className="text-red-300 mt-1">{j.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {plan && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50 mb-1">Source</div>
              <div className="font-medium">{sourceTitle || plan.sourceTitle}</div>
              {captionSource && captionSource !== 'none' && (
                <p className="text-xs text-green-300/90 mt-1">
                  Captions: {captionSource === 'auto' ? 'auto-fetched from YouTube' : 'from your paste'}
                </p>
              )}
              {captionSource === 'none' && (
                <p className="text-xs text-amber-200/90 mt-1">
                  No captions found — paste transcript for stronger capture
                </p>
              )}
              {plan.contentBreakdown && (
                <p className="text-sm text-white/80 mt-2 whitespace-pre-wrap">
                  <span className="text-white/50 text-xs block mb-1">What this video is about</span>
                  {plan.contentBreakdown}
                </p>
              )}
              {plan.summary && (
                <p className="text-sm text-white/70 mt-2 whitespace-pre-wrap">{plan.summary}</p>
              )}
            </div>

            {plan.longScript && (
              <div className="rounded-xl border border-purple-400/30 bg-purple-600/10 p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-sm font-medium">Long video script</div>
                  <button
                    onClick={() => copyText(plan.longScript || '', 'Long script copied')}
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
                <button
                  onClick={() =>
                    copyText(
                      `${s.title}\n\nHook: ${s.hook}\n\n${s.script}\n\n${(s.captionLines || []).join('\n')}`,
                      'Short pack copied'
                    )
                  }
                  className="text-xs px-3 py-1.5 rounded border border-white/20"
                >
                  Copy short pack
                </button>
              </div>
            ))}

            {plan.description && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between mb-2">
                  <div className="text-sm font-medium">Description</div>
                  <button
                    onClick={() => copyText(plan.description || '', 'Description copied')}
                    className="text-xs px-3 py-1.5 rounded border border-white/20"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-white/70 whitespace-pre-wrap">{plan.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
