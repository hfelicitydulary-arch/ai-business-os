cd ai-bos

# Paste this big block to replace the page with the real dashboard
cat > app/page.tsx << 'EOF'
'use client';

import { useState } from 'react';
import { Users, BarChart3, Calendar, Bell, Play, CheckCircle } from 'lucide-react';

export default function AIBOSDashboard() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center">
            <Play className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">AI BOS</h1>
            <p className="text-emerald-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              All Agents Active
            </p>
          </div>
        </div>
        <Bell className="w-6 h-6" />
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-3">
          <div className="space-y-2">
            {['Overview', 'CRM', 'Content Calendar', 'Analytics', 'Agents', 'Approvals'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t.toLowerCase().replace(/\s+/g, '-'))}
                className={`w-full text-left px-6 py-4 rounded-3xl transition-all ${
                  tab === t.toLowerCase().replace(/\s+/g, '-') ? 'bg-white text-black font-medium' : 'hover:bg-zinc-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-9">
          {tab === 'overview' && (
            <div>
              <h2 className="text-3xl font-semibold mb-8">Business Command Center</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-zinc-900 p-8 rounded-3xl">
                  <p className="text-zinc-400">Revenue</p>
                  <p className="text-6xl font-bold mt-4">$24,891</p>
                  <p className="text-emerald-400 mt-2">↑ 24% this month</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-3xl">
                  <p className="text-zinc-400">Leads</p>
                  <p className="text-6xl font-bold mt-4">68</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-3xl">
                  <p className="text-zinc-400">Posts Published</p>
                  <p className="text-6xl font-bold mt-4">14</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'approvals' && (
            <div className="bg-zinc-900 p-8 rounded-3xl">
              <h3 className="text-2xl mb-6">Pending Approvals</h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center p-6 bg-zinc-950 rounded-2xl">
                  <div>
                    <p>Publish Instagram Reel</p>
                    <p className="text-sm text-zinc-400">Summer promotion video</p>
                  </div>
                  <button className="bg-green-600 px-8 py-3 rounded-2xl">Approve</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
EOF

# Push the new code
git add app/page.tsx
git commit -m "Add full AI BOS dashboard"
git push
Add AI BOS 