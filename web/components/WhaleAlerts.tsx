'use client';
import { usePoll } from '../lib/api';
import type { WhaleData } from '../lib/api';

const typeIcon: Record<string, string> = {
  accumulation: '🐋 BUY',
  distribution: '🐋 SELL',
  pump: '🚀 PUMP',
  dump: '💥 DUMP',
  stop_hunt: '🎯 HUNT',
  wash_suspect: '🔄 WASH',
};

const sevColor = (s: number) =>
  s >= 70 ? 'rgba(234,57,67,.25)' : s >= 40 ? 'rgba(240,185,11,.25)' : 'rgba(139,151,168,.2)';

export default function WhaleAlerts({ symbol }: { symbol: string | null }) {
  const data = usePoll<WhaleData>(
    symbol ? `/api/intel/whale/${encodeURIComponent(symbol)}` : null,
    10000,
  );

  return (
    <div className="panel">
      <h2>Whale &amp; Manipulation</h2>
      {data ? (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <div>
              <div className="muted" style={{ fontSize: 10 }}>WHALE PRESSURE</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: data.score > 55 ? '#16c784' : data.score < 45 ? '#ea3943' : '#8b97a8',
                }}
              >
                {data.score}
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                  {data.score > 55 ? 'buying' : data.score < 45 ? 'selling' : 'neutral'}
                </span>
              </div>
            </div>
          </div>
          {data.alerts.length > 0 ? (
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {data.alerts.map((a, i) => (
                <div key={i} className="lesson">
                  <div className="sev" style={{ background: sevColor(a.severity), fontSize: 9 }}>
                    {typeIcon[a.type] ?? a.type}
                  </div>
                  <div>
                    <div className="desc">{a.description}</div>
                    <div className="meta">severity {a.severity}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">no manipulation alerts</div>
          )}
          <ul className="reasons" style={{ marginTop: 6 }}>
            {data.reasons.map((r, i) => (
              <li key={i} className={r.startsWith('⚠') ? 'flag' : ''}>
                {r}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">analyzing whale activity…</div>
      )}
    </div>
  );
}
