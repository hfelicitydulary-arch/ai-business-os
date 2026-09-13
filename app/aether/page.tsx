'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AetherPage() {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  async function ask(message?: string) {
    const q = (message ?? text).trim();
    if (!q) return;
    setLoading(true);
    setReply('');
    try {
      const res = await fetch('/api/aether/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      });
      const data = await res.json();
      const answer = data.reply || data.error || 'No reply';
      setReply(answer);
      // Speak reply if supported
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(answer);
        u.rate = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {
      setReply('Network error. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function startVoice() {
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      setReply('Voice input not supported in this browser. Type instead, or use Siri Shortcut.');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const said = e.results[0][0].transcript;
      setText(said);
      setListening(false);
      ask(said);
    };
    rec.onerror = () => {
      setListening(false);
      setReply('Could not hear you. Try again or type.');
    };
    rec.onend = () => setListening(false);
    rec.start();
  }

  useEffect(() => {
    // stop speech when leaving
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Aether</h1>
            <p className="text-sm text-white/60">Voice assistant · also works with Siri Shortcuts</p>
          </div>
          <Link href="/" className="text-sm px-3 py-1.5 border border-white/30 rounded">
            Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Ask Aether anything practical..."
            className="w-full bg-black border border-white/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-500"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => ask()}
              disabled={loading || !text.trim()}
              className="px-4 py-2.5 rounded-xl bg-purple-600 text-sm font-medium disabled:opacity-40"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
            <button
              onClick={startVoice}
              disabled={loading || listening}
              className="px-4 py-2.5 rounded-xl border border-purple-400/50 text-sm"
            >
              {listening ? 'Listening...' : '🎤 Speak'}
            </button>
          </div>

          {reply && (
            <div className="mt-2 p-3 rounded-xl bg-black/50 border border-white/10 text-sm whitespace-pre-wrap">
              {reply}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-white/50 space-y-2 leading-relaxed">
          <p className="text-white/80 font-medium">Siri Shortcut (iPhone)</p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Open the Shortcuts app</li>
            <li>New Shortcut → Add Action</li>
            <li>Add &quot;Dictate Text&quot; (or &quot;Ask for Input&quot;)</li>
            <li>Add &quot;Get Contents of URL&quot;</li>
            <li>URL: your site + <code className="text-purple-300">/api/aether/ask</code></li>
            <li>Method: POST · Request Body: JSON · text → Dictated Text</li>
            <li>Add &quot;Get Dictionary Value&quot; key: <code className="text-purple-300">reply</code></li>
            <li>Add &quot;Speak Text&quot;</li>
            <li>Name it <strong>Aether</strong> → Add to Siri → phrase: &quot;Aether&quot;</li>
          </ol>
          <p className="pt-2">
            Say <strong>&quot;Hey Siri, Aether&quot;</strong> then speak your request.
          </p>
        </div>
      </div>
    </div>
  );
}
