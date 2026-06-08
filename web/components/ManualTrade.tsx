'use client';
import { useState } from 'react';
import { postJSON, API_BASE, fmtPrice, fmtUSD } from '../lib/api';

interface Props {
  assets: { symbol: string }[];
  onTraded?: () => void;
  builderFeePct?: number;
}

export default function ManualTrade({ assets, onTraded, builderFeePct = 0 }: Props) {
  const [open, setOpen]         = useState(true);
  const [symbol, setSymbol]     = useState('');
  const [direction, setDir]     = useState<'LONG' | 'SHORT'>('LONG');
  const [notional, setNotional] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  async function place() {
    if (!symbol || !notional) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(API_BASE + '/api/trades/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, direction, notional: Number(notional), leverage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to place trade');
      setSuccess(`${direction} ${symbol} @ ~${fmtPrice(data.entryPrice)} | ${leverage}x`);
      setNotional('');
      onTraded?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => { setOpen(p => !p); setError(null); setSuccess(null); }}
      >
        <h2 style={{ margin: 0 }}>Manual Trade</h2>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{open ? '▲ hide' : '▼ show'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Asset */}
          <div>
            <label className="manual-label">Asset</label>
            <select
              className="manual-input"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
            >
              <option value="">Select asset…</option>
              {assets.map(a => (
                <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className="manual-label">Direction</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['LONG', 'SHORT'] as const).map(d => (
                <button
                  key={d}
                  className={`manual-dir ${direction === d ? d.toLowerCase() : ''}`}
                  onClick={() => setDir(d)}
                >
                  {d === 'LONG' ? '▲ Long' : '▼ Short'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="manual-label">Margin ($)</label>
            <input
              className="manual-input"
              type="number"
              placeholder="e.g. 50"
              value={notional}
              onChange={e => setNotional(e.target.value)}
              min={1}
            />
          </div>

          {/* Leverage */}
          <div>
            <label className="manual-label">Leverage</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 5, 10].map(l => (
                <button
                  key={l}
                  className={`lev-btn ${leverage === l ? 'active' : ''}`}
                  onClick={() => setLeverage(l)}
                >
                  {l}x
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {notional && Number(notional) > 0 && (
            <div className="manual-summary">
              Notional: <strong>{fmtUSD(Number(notional) * leverage)}</strong>
              {' · '}Stop loss ~{(3).toFixed(1)}%
              {' · '}Take profit ~{(6).toFixed(1)}%
              {builderFeePct > 0 && (
                <span className="muted"> · Fee: {fmtUSD(Number(notional) * leverage * builderFeePct / 100)} ({builderFeePct}%)</span>
              )}
            </div>
          )}

          {error   && <div className="manual-error">{error}</div>}
          {success && <div className="manual-success">✓ {success}</div>}

          <button
            className="btn go"
            style={{ width: '100%' }}
            onClick={place}
            disabled={loading || !symbol || !notional}
          >
            {loading ? 'Placing…' : `Place ${direction} Trade`}
          </button>
        </div>
      )}
    </div>
  );
}
