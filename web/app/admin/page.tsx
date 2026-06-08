'use client';

import { useState, useEffect } from 'react';
import { usePoll, fmtUSD, fmtPct, API_BASE, postJSON } from '../../lib/api';
import type { Overview, Lesson, Signal, Weights } from '../../lib/api';

interface DecisionRow {
  id: number;
  summary: string;
  action: string;
  createdAt: string;
}

interface FeeStats {
  totalBuilderFees: number;
  totalReferralFees: number;
  tradesWithFees: number;
}

const CONFIG_FIELDS: { key: string; label: string; type: 'number' | 'boolean' | 'text'; min?: number; max?: number; step?: number; hint?: string }[] = [
  { key: 'startingCapital', label: 'Starting Capital', type: 'number', min: 1, hint: '$' },
  { key: 'confidenceThreshold', label: 'Confidence Threshold', type: 'number', min: 0, max: 100, hint: '% min to act' },
  { key: 'maxConcurrent', label: 'Max Concurrent', type: 'number', min: 1, max: 20, hint: 'positions' },
  { key: 'riskPerTradePct', label: 'Risk Per Trade', type: 'number', min: 0.1, max: 20, step: 0.1, hint: '% of equity' },
  { key: 'takeProfitPct', label: 'Take Profit', type: 'number', min: 0.1, max: 50, step: 0.1, hint: '%' },
  { key: 'stopLossPct', label: 'Stop Loss', type: 'number', min: 0.1, max: 50, step: 0.1, hint: '%' },
  { key: 'maxLeverage', label: 'Max Leverage', type: 'number', min: 1, max: 50, hint: 'x' },
  { key: 'minHoldBars', label: 'Min Hold Bars', type: 'number', min: 1, max: 100 },
  { key: 'maxDailyDrawdownPct', label: 'Max Daily Drawdown', type: 'number', min: 1, max: 50, step: 0.5, hint: '%' },
  { key: 'maxSwitchesPerDay', label: 'Max Switches/Day', type: 'number', min: 1, max: 50 },
  { key: 'cooldownBars', label: 'Cooldown Bars', type: 'number', min: 0, max: 50 },
  { key: 'switchEdgeMargin', label: 'Switch Edge Margin', type: 'number', min: 0, max: 50, hint: 'conf pts' },
  { key: 'minCycleSeconds', label: 'Min Cycle', type: 'number', min: 5, max: 600, hint: 'sec' },
  { key: 'maxCycleSeconds', label: 'Max Cycle', type: 'number', min: 10, max: 3600, hint: 'sec' },
  { key: 'builderFeePct', label: 'Builder Fee', type: 'number', min: 0, max: 5, step: 0.01, hint: '% of notional' },
  { key: 'referralSharePct', label: 'Referral Share', type: 'number', min: 0, max: 100, step: 1, hint: '% of fee to referrer' },
  { key: 'builderAddress', label: 'Builder Address', type: 'text', hint: '0x... for HL' },
  { key: 'allowLeverage', label: 'Allow Leverage', type: 'boolean' },
  { key: 'paused', label: 'Paused', type: 'boolean' },
];

export default function AdminPage() {
  const ov = usePoll<Overview>('/api/overview', 3000);
  const lessons = usePoll<Lesson[]>('/api/lessons', 10000);
  const signals = usePoll<Signal[]>('/api/signals', 10000);
  const weights = usePoll<Weights>('/api/weights', 10000);
  const decisions = usePoll<DecisionRow[]>('/api/decisions?limit=10', 5000);
  const feeStats = usePoll<FeeStats>('/api/auth/fees/stats', 10000);

  const [config, setConfig] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [resetCapital, setResetCapital] = useState('200');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [xStatus, setXStatus] = useState<string | null>(null);

  useEffect(() => {
    if (ov?.config && Object.keys(config).length === 0) {
      setConfig(ov.config as Record<string, any>);
    }
  }, [ov?.config]);

  function updateField(key: string, value: any) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty((d) => new Set(d).add(key));
    setSaveMsg(null);
  }

  async function saveConfig() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const patch: Record<string, any> = {};
      for (const k of dirty) patch[k] = config[k];
      await fetch(API_BASE + '/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setDirty(new Set());
      setSaveMsg('Saved');
    } catch {
      setSaveMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function resetAgent() {
    if (!confirm(`Reset all trades & snapshots? Starting capital will be $${resetCapital}.`)) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await postJSON('/api/agent/reset', { capital: Number(resetCapital) });
      setResetMsg(res.message ?? 'Reset complete');
    } catch {
      setResetMsg('Reset failed');
    } finally {
      setResetting(false);
    }
  }

  const loop = ov?.loop;
  const pf = ov?.portfolio;

  return (
    <>
      {/* System Status */}
      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Agent Loop</div>
          <div className="stat-card-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`dot ${loop?.running ? 'on' : 'off'}`} />
            {loop?.running ? 'Running' : 'Stopped'}
          </div>
          <div className="stat-card-sub muted">
            {loop?.running ? `${loop.cycleSeconds}s cycle` : ''}
            {loop?.busy ? ' (busy)' : ''}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Last Cycle</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>
            {loop?.lastCycleAt ? new Date(loop.lastCycleAt).toLocaleTimeString() : '—'}
          </div>
          <div className="stat-card-sub muted">{config.paused ? 'PAUSED' : 'active'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Open Positions</div>
          <div className="stat-card-value">{pf?.openCount ?? 0} / {config.maxConcurrent ?? '—'}</div>
          <div className="stat-card-sub muted">slots used</div>
        </div>
        <div className={`stat-card ${loop?.lastError ? 'accent-red' : ''}`}>
          <div className="stat-card-label">Last Error</div>
          <div className="stat-card-value" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {loop?.lastError ? loop.lastError.slice(0, 80) : 'None'}
          </div>
        </div>
      </div>

      {/* Agent Controls */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Agent Controls</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn go" onClick={() => postJSON('/api/agent/start')}>Start Loop</button>
          <button className="btn danger" onClick={() => postJSON('/api/agent/stop')}>Stop Loop</button>
          <button className="btn" onClick={() => postJSON('/api/agent/cycle')}>Force Cycle</button>
          <button className="btn" onClick={async () => { setTelegramStatus('Testing...'); try { const r = await fetch(API_BASE + '/api/telegram/test'); const d = await r.json(); setTelegramStatus(d.ok ? 'Connected' : d.error ?? 'Failed'); } catch { setTelegramStatus('Failed'); } }}>
            Test Telegram
          </button>
          <button className="btn" onClick={async () => { setXStatus('Testing...'); try { const r = await fetch(API_BASE + '/api/x/test'); const d = await r.json(); setXStatus(d.ok || d.username ? `Connected (@${d.username ?? '?'})` : d.error ?? 'Failed'); } catch { setXStatus('Failed'); } }}>
            Test X
          </button>
          {telegramStatus && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Telegram: {telegramStatus}</span>}
          {xStatus && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>X: {xStatus}</span>}
        </div>
      </div>

      <div className="admin-grid">
        {/* Config Editor */}
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Agent Configuration</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {saveMsg && <span className="muted" style={{ fontSize: 11 }}>{saveMsg}</span>}
              <button
                className="btn go"
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={saveConfig}
                disabled={saving || dirty.size === 0}
              >
                {saving ? 'Saving...' : `Save${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
              </button>
            </div>
          </div>
          <div className="config-grid">
            {CONFIG_FIELDS.map((f) => (
              <div key={f.key} className="config-field">
                <label className="config-label">
                  {f.label}
                  {f.hint && <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>{f.hint}</span>}
                </label>
                {f.type === 'boolean' ? (
                  <button
                    className={`lev-btn ${config[f.key] ? 'active' : ''}`}
                    style={{ width: '100%', fontSize: 12 }}
                    onClick={() => updateField(f.key, !config[f.key])}
                  >
                    {config[f.key] ? 'ON' : 'OFF'}
                  </button>
                ) : f.type === 'text' ? (
                  <input
                    type="text"
                    className="manual-input"
                    style={{
                      fontSize: 12, padding: '5px 8px',
                      borderColor: dirty.has(f.key) ? 'var(--blue)' : undefined,
                    }}
                    value={config[f.key] ?? ''}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.hint}
                  />
                ) : (
                  <input
                    type="number"
                    className="manual-input"
                    style={{
                      fontSize: 13, padding: '5px 8px',
                      borderColor: dirty.has(f.key) ? 'var(--blue)' : undefined,
                    }}
                    value={config[f.key] ?? ''}
                    onChange={(e) => updateField(f.key, Number(e.target.value))}
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Strategy Weights */}
          <div className="panel">
            <h2>Strategy Weights</h2>
            {weights?.current ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['technical', 'sentiment', 'whale', 'momentum'] as const).map((k) => {
                  const val = (weights.current as any)[k] as number;
                  const pct = val * 100;
                  const colors: Record<string, string> = { technical: '#3b9eff', sentiment: '#e5b567', whale: '#3ecf8e', momentum: '#5cc8ff' };
                  return (
                    <div key={k}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                        <span style={{ textTransform: 'capitalize' }}>{k}</span>
                        <span className="mono">{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: colors[k], borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty">No weight data</div>
            )}
          </div>

          {/* Fee Revenue */}
          <div className="panel">
            <h2>Fee Revenue</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Builder Fees Collected</span>
                <span className="mono fw-600">{fmtUSD(feeStats?.totalBuilderFees ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Referral Payouts</span>
                <span className="mono fw-600">{fmtUSD(feeStats?.totalReferralFees ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Net Revenue</span>
                <span className="mono fw-600 up">{fmtUSD((feeStats?.totalBuilderFees ?? 0) - (feeStats?.totalReferralFees ?? 0))}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Trades with fees</span>
                <span className="mono">{feeStats?.tradesWithFees ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Current fee rate</span>
                <span className="mono">{config.builderFeePct ?? 0}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Referral share</span>
                <span className="mono">{config.referralSharePct ?? 0}%</span>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="panel">
            <h2>Reset Agent</h2>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Wipes all trades, snapshots and decisions. Keeps watchlist, signals, and lessons.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                className="manual-input"
                style={{ width: 100, fontSize: 13, padding: '5px 8px' }}
                value={resetCapital}
                onChange={(e) => setResetCapital(e.target.value)}
                min={1}
                placeholder="Capital"
              />
              <button className="btn danger" onClick={resetAgent} disabled={resetting}>
                {resetting ? 'Resetting...' : 'Reset All'}
              </button>
            </div>
            {resetMsg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{resetMsg}</div>}
          </div>
        </div>
      </div>

      {/* Lessons & Signals */}
      <div className="admin-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Lessons Learned ({lessons?.length ?? 0})</h2>
          {lessons && lessons.length > 0 ? (
            <table>
              <thead>
                <tr><th>Pattern</th><th>Count</th><th>Damage</th><th>Severity</th><th>Active</th></tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.category}>
                    <td style={{ fontSize: 12 }}>
                      <div className="fw-600">{l.category.replace(/_/g, ' ')}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{l.description}</div>
                    </td>
                    <td>{l.occurrences}</td>
                    <td className="mono down">{fmtUSD(l.totalPnl)}</td>
                    <td className="mono">{l.severity.toFixed(1)}</td>
                    <td>{l.active ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No lessons recorded yet</div>
          )}
        </div>

        <div className="panel">
          <h2>Signal Reliability ({signals?.length ?? 0})</h2>
          {signals && signals.length > 0 ? (
            <table>
              <thead>
                <tr><th>Signal</th><th>Category</th><th>Reliability</th><th>W/L</th></tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontSize: 12 }}>{s.name.replace(/_/g, ' ')}</td>
                    <td className="muted">{s.category}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 4, background: 'var(--panel2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.reliability}%`, height: '100%', borderRadius: 2,
                            background: s.reliability >= 60 ? 'var(--green)' : s.reliability >= 45 ? 'var(--yellow)' : 'var(--red)',
                          }} />
                        </div>
                        <span className="mono" style={{ fontSize: 11 }}>{s.reliability.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{s.wins}/{s.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No signal data yet</div>
          )}
        </div>
      </div>

      {/* Recent Decisions */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Recent Agent Decisions</h2>
        {decisions && decisions.length > 0 ? (
          <table>
            <thead>
              <tr><th>Time</th><th>Action</th><th>Summary</th></tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td className="mono muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <span className="badge leverage" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {d.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{d.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No decisions yet</div>
        )}
      </div>
    </>
  );
}
