'use client';
import { usePoll } from '../lib/api';
import type { SentimentData } from '../lib/api';

const scoreColor = (s: number) => (s > 0.05 ? '#16c784' : s < -0.05 ? '#ea3943' : '#8b97a8');
const fgLabel = (v: number) =>
  v <= 25 ? 'Extreme Fear' : v <= 40 ? 'Fear' : v <= 60 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed';
const fgColor = (v: number) =>
  v <= 25 ? '#ea3943' : v <= 40 ? '#f0b90b' : v <= 60 ? '#8b97a8' : v <= 75 ? '#16c784' : '#16c784';

export default function SentimentFeed({ symbol }: { symbol: string | null }) {
  const data = usePoll<SentimentData>(
    symbol ? `/api/intel/sentiment/${encodeURIComponent(symbol)}` : null,
    15000,
  );

  return (
    <div className="panel">
      <h2>Sentiment Feed</h2>
      {data ? (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 10 }}>NEWS SCORE</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: data.score > 55 ? '#16c784' : data.score < 45 ? '#ea3943' : '#f0b90b',
                }}
              >
                {data.score}
              </div>
            </div>
            {data.fearGreed != null && (
              <div>
                <div className="muted" style={{ fontSize: 10 }}>FEAR &amp; GREED</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: fgColor(data.fearGreed) }}>
                  {data.fearGreed}{' '}
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{fgLabel(data.fearGreed)}</span>
                </div>
              </div>
            )}
          </div>
          {data.headlines.length > 0 ? (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {data.headlines.slice(0, 12).map((h, i) => (
                <div
                  key={i}
                  style={{
                    padding: '5px 0',
                    borderBottom: '1px solid #161d2b',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: scoreColor(h.score),
                      flexShrink: 0,
                      width: 32,
                      textAlign: 'center',
                    }}
                  >
                    {h.score > 0.05 ? '▲' : h.score < -0.05 ? '▼' : '—'}
                  </span>
                  <span style={{ fontSize: 11, color: '#cbd5e1' }}>{h.title}</span>
                  <span className="muted" style={{ fontSize: 10, flexShrink: 0 }}>
                    {h.source}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">no headlines found</div>
          )}
        </>
      ) : (
        <div className="empty">loading sentiment…</div>
      )}
    </div>
  );
}
