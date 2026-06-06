'use client';

import { useState } from 'react';
import { usePoll } from '../../lib/api';
import type { Overview } from '../../lib/api';
import SentimentFeed from '../../components/SentimentFeed';
import WhaleAlerts from '../../components/WhaleAlerts';
import AgentBrain from '../../components/AgentBrain';

export default function IntelligencePage() {
  const ov = usePoll<Overview>('/api/overview', 5000);
  const symbols = ov?.leaderboard.map((r) => r.symbol) ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const selected = sel ?? symbols[0] ?? null;

  return (
    <>
      {/* Symbol selector */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Select Asset</h2>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {symbols.map((s) => (
            <button
              key={s}
              className={`lev-btn ${selected === s ? 'active' : ''}`}
              onClick={() => setSel(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="intel-grid">
        <SentimentFeed symbol={selected} />
        <WhaleAlerts symbol={selected} />
      </div>

      <div style={{ marginTop: 16 }}>
        <AgentBrain />
      </div>
    </>
  );
}
