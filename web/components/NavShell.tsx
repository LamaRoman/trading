'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePoll, postJSON } from '../lib/api';
import type { Overview } from '../lib/api';
import WalletConnect from './WalletConnect';
import TradingSettings from './TradingSettings';
import { loadUser, isLiveMode } from '../lib/auth';
import type { AuthUser } from '../lib/auth';

const NAV = [
  { href: '/',              label: 'Dashboard' },
  { href: '/trade',         label: 'Trade' },
  { href: '/history',       label: 'History' },
  { href: '/intelligence',  label: 'Intelligence' },
  { href: '/leaderboard',   label: 'Leaderboard' },
];

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ov = usePoll<Overview>('/api/overview', 3000);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [liveMode, setLiveModeState] = useState(false);

  useEffect(() => {
    setAuthUser(loadUser());
    setLiveModeState(isLiveMode());
  }, []);

  const badge = !authUser ? 'DEMO' : liveMode ? 'LIVE' : 'PAPER';
  const pf = ov?.portfolio;

  return (
    <div className="shell-v">
      {/* Top navigation bar */}
      <header className="topnav">
        {/* Left: brand + nav links */}
        <div className="topnav-left">
          <a href="/" className="topnav-brand">
            <span className="topnav-logo">⬡</span>
            <span className="topnav-title">TradeAgent</span>
            <span className={`tag ${badge.toLowerCase()}`}>{badge}</span>
          </a>

          <nav className="topnav-links">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={`topnav-link ${pathname === n.href ? 'active' : ''}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Center: portfolio stats */}
        <div className="topnav-stats">
          <div className="topnav-stat">
            <span className="topnav-stat-label">Equity</span>
            <span className="topnav-stat-value">{pf ? `$${pf.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
          </div>
          <div className="topnav-stat">
            <span className="topnav-stat-label">Return</span>
            <span className={`topnav-stat-value ${pf && pf.totalReturnPct >= 0 ? 'up' : 'down'}`}>
              {pf ? `${pf.totalReturnPct >= 0 ? '+' : ''}${pf.totalReturnPct.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="topnav-stat">
            <span className="topnav-stat-label">P&L</span>
            <span className={`topnav-stat-value ${pf && pf.realizedPnl >= 0 ? 'up' : 'down'}`}>
              {pf ? `$${pf.realizedPnl.toFixed(2)}` : '—'}
            </span>
          </div>
        </div>

        {/* Right: settings + agent + wallet */}
        <div className="topnav-right">
          <TradingSettings onLiveModeChange={(live) => setLiveModeState(live)} />

          <div className="topnav-agent">
            <span className={`dot ${ov?.loop.running ? 'on' : 'off'}`} />
            <span style={{ fontSize: 11 }}>{ov?.loop.running ? `${ov.loop.cycleSeconds}s` : 'Off'}</span>
            <button className="btn-sm go" onClick={() => postJSON('/api/agent/start')}>Start</button>
            <button className="btn-sm danger" onClick={() => postJSON('/api/agent/stop')}>Stop</button>
          </div>

          <WalletConnect />
        </div>
      </header>

      {/* Page content — full width */}
      <main className="main-v">
        {children}
      </main>
    </div>
  );
}
