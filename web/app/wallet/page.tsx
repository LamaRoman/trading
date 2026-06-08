'use client';

import { useState } from 'react';
import { usePoll, fmtUSD, fmtPct, API_BASE } from '../../lib/api';

interface WalletTransaction {
  id: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'ADJUSTMENT';
  amount: number;
  balance: number;
  note: string | null;
  tradeId: number | null;
  createdAt: string;
}

interface WalletData {
  startingCapital: number;
  cash: number;
  equity: number;
  reservedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalReturnPct: number;
  openPositions: number;
  totalFeesDeducted: number;
  transactionCount: number;
  recentTransactions: WalletTransaction[];
}

export default function WalletPage() {
  const wallet = usePoll<WalletData>('/api/wallet', 4000);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API_BASE + `/api/wallet/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg({ text: `${mode === 'deposit' ? 'Deposited' : 'Withdrew'} ${fmtUSD(val)}`, ok: true });
      setAmount('');
      setNote('');
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const cashPct = wallet && wallet.equity > 0 ? (wallet.cash / wallet.equity) * 100 : 0;
  const marginPct = wallet && wallet.equity > 0 ? (wallet.reservedMargin / wallet.equity) * 100 : 0;

  return (
    <>
      {/* Hero balance */}
      <div className="wallet-hero">
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Available balance</div>
          <div className="wallet-balance">{wallet ? fmtUSD(wallet.cash) : '—'}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Equity <span style={{ color: 'var(--text-bright)', fontWeight: 550 }}>{wallet ? fmtUSD(wallet.equity) : '—'}</span>
            </span>
            <span className={wallet && wallet.totalReturnPct >= 0 ? 'up' : 'down'} style={{ fontSize: 13 }}>
              {wallet ? fmtPct(wallet.totalReturnPct) : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Allocation bar — no box, just floating */}
      {wallet && wallet.equity > 0 && (
        <div style={{ margin: '0 0 20px' }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, background: 'var(--border)' }}>
            <div style={{ width: `${cashPct}%`, background: 'var(--accent)', borderRadius: 3, minWidth: 3 }} />
            {marginPct > 0 && <div style={{ width: `${marginPct}%`, background: 'var(--muted)', borderRadius: 3, opacity: .5, minWidth: 3 }} />}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12 }}>
            <span className="muted">Cash {cashPct.toFixed(0)}%</span>
            {marginPct > 0 && <span className="muted">Margin {marginPct.toFixed(0)}%</span>}
            {wallet.openPositions > 0 && <span className="muted">{wallet.openPositions} open</span>}
          </div>
        </div>
      )}

      <div className="wallet-grid">
        {/* Left: breakdown + transactions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Breakdown — no panel wrapper, just rows */}
          <div className="panel">
            <h2>Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {wallet && [
                { label: 'Starting capital', val: wallet.startingCapital },
                { label: 'Realized P&L', val: wallet.realizedPnl, cls: wallet.realizedPnl >= 0 ? 'up' : 'down' },
                { label: 'Unrealized P&L', val: wallet.unrealizedPnl, cls: wallet.unrealizedPnl >= 0 ? 'up' : 'down' },
                { label: 'Fees paid', val: -wallet.totalFeesDeducted, cls: 'down' },
                { label: 'In positions', val: -wallet.reservedMargin, cls: 'muted' },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span className="muted">{r.label}</span>
                  <span className={r.cls || ''}>{r.val >= 0 ? '+' : ''}{fmtUSD(r.val)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ fontWeight: 550, color: 'var(--text-bright)' }}>Available</span>
                <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{wallet ? fmtUSD(wallet.cash) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="panel">
            <h2>Transactions</h2>
            {wallet && wallet.recentTransactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {wallet.recentTransactions.map((tx) => (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 600, flexShrink: 0,
                      background: tx.amount >= 0 ? 'rgba(62,207,142,.1)' : 'rgba(229,83,75,.1)',
                      color: tx.amount >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {tx.amount >= 0 ? '+' : '-'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-bright)' }}>
                        {tx.type.charAt(0) + tx.type.slice(1).toLowerCase()}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {tx.note ?? '—'}{tx.tradeId ? ` · trade #${tx.tradeId}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={`mono ${tx.amount >= 0 ? 'up' : 'down'}`} style={{ fontSize: 13, fontWeight: 550 }}>
                        {tx.amount >= 0 ? '+' : ''}{fmtUSD(tx.amount)}
                      </div>
                      <div className="mono muted" style={{ fontSize: 11 }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No transactions yet</div>
            )}
          </div>
        </div>

        {/* Right: deposit/withdraw */}
        <div className="panel" style={{ alignSelf: 'start', position: 'sticky', top: 60 }}>
          <h2>Transfer</h2>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--panel2)', borderRadius: 8, padding: 3 }}>
            {(['deposit', 'withdraw'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setMsg(null); }}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 6,
                  fontSize: 13, fontWeight: 550, cursor: 'pointer',
                  background: mode === m ? 'var(--panel)' : 'transparent',
                  color: mode === m ? 'var(--text-bright)' : 'var(--muted)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {m === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="manual-label">Amount</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 14, fontWeight: 500 }}>$</span>
                <input
                  type="number"
                  className="manual-input"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={0.01}
                  step="any"
                  style={{ paddingLeft: 24, fontSize: 16, fontWeight: 500, padding: '10px 12px 10px 24px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {[25, 50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  style={{
                    flex: 1, padding: '6px 0', border: '1px solid var(--border)',
                    borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: amount === String(v) ? 'var(--accent)' : 'transparent',
                    color: amount === String(v) ? '#fff' : 'var(--muted)',
                    borderColor: amount === String(v) ? 'var(--accent)' : 'var(--border)',
                    transition: 'all .12s',
                  }}
                >
                  ${v}
                </button>
              ))}
            </div>

            <div>
              <label className="manual-label">Note</label>
              <input
                type="text"
                className="manual-input"
                placeholder="Optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {mode === 'withdraw' && wallet && (
              <div className="muted" style={{ fontSize: 12 }}>
                Available: {fmtUSD(wallet.cash)}
              </div>
            )}

            {msg && (
              <div style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6, background: msg.ok ? 'rgba(62,207,142,.1)' : 'rgba(229,83,75,.1)', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>
                {msg.text}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy || !amount || parseFloat(amount) <= 0}
              style={{
                width: '100%', padding: '10px 0', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 550, cursor: 'pointer',
                background: mode === 'deposit' ? 'var(--accent)' : 'var(--red)',
                color: '#fff',
                opacity: busy || !amount || parseFloat(amount) <= 0 ? .5 : 1,
                transition: 'opacity .15s',
              }}
            >
              {busy ? 'Processing...' : mode === 'deposit' ? 'Deposit' : 'Withdraw'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
