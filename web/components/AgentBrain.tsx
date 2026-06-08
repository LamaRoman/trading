'use client';
import { usePoll } from '../lib/api';
import type { Lesson, Signal, Weights } from '../lib/api';

function WBar({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="sigbar">
      <span className="name">{label}</span>
      <div className="sigtrack">
        <div className="sigfill" style={{ width: `${Math.round(v * 100)}%`, background: c }} />
      </div>
      <span className="num">{Math.round(v * 100)}%</span>
    </div>
  );
}

const sevColor = (s: number) =>
  s >= 60 ? 'rgba(234,57,67,.25)' : s >= 30 ? 'rgba(240,185,11,.25)' : 'rgba(139,151,168,.2)';

export default function AgentBrain() {
  const weights = usePoll<Weights>('/api/weights', 8000);
  const signals = usePoll<Signal[]>('/api/signals', 8000);
  const lessons = usePoll<Lesson[]>('/api/lessons', 8000);
  const w = weights?.current;

  return (
    <>
      <div className="panel">
        <h2>Strategy Weights (self-adapted)</h2>
        {w ? (
          <>
            <WBar label="Technical" v={w.technical} c="#3b9eff" />
            <WBar label="Sentiment" v={w.sentiment} c="#8b97a8" />
            <WBar label="Whale" v={w.whale} c="#3ecf8e" />
            <WBar label="Momentum" v={w.momentum} c="#5cc8ff" />
          </>
        ) : (
          <div className="empty">no data yet</div>
        )}
      </div>

      <div className="panel">
        <h2>Signal Reliability (learned)</h2>
        {signals && signals.length ? (
          signals.slice(0, 10).map((s) => (
            <div key={s.name} className="sigbar">
              <span className="name" title={s.name}>
                {s.name.replace(/_/g, ' ')}
              </span>
              <div className="sigtrack">
                <div
                  className="sigfill"
                  style={{
                    width: `${s.reliability}%`,
                    background:
                      s.reliability >= 55 ? '#16c784' : s.reliability <= 45 ? '#ea3943' : '#f0b90b',
                  }}
                />
              </div>
              <span className="num">{s.reliability.toFixed(0)}%</span>
            </div>
          ))
        ) : (
          <div className="empty">learning…</div>
        )}
      </div>

      <div className="panel">
        <h2>Lessons Learned 🧠</h2>
        {lessons && lessons.length ? (
          lessons.map((l) => (
            <div key={l.category} className="lesson">
              <div className="sev" style={{ background: sevColor(l.severity) }}>
                {l.severity.toFixed(0)}
              </div>
              <div>
                <div className="desc">{l.description}</div>
                <div className="meta">
                  {l.category.replace(/_/g, ' ')} · seen {l.occurrences}× · ${l.totalPnl.toFixed(0)}{' '}
                  {l.active && <span className="shield">🛡️ guarding</span>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">no mistakes recorded yet — clean record</div>
        )}
      </div>
    </>
  );
}
