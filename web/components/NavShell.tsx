'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import WalletConnect from './WalletConnect';
import TradingSettings from './TradingSettings';
import TickerStrip from './TickerStrip';
import Footer from './Footer';
import { loadUser } from '../lib/auth';
import type { AuthUser } from '../lib/auth';

const NAV = [
  { href: '/',              label: 'Dashboard' },
  { href: '/trade',         label: 'Trade' },
  { href: '/history',       label: 'History' },
  { href: '/intelligence',  label: 'Intelligence' },
  { href: '/wallet',        label: 'Wallet' },
  { href: '/leaderboard',   label: 'Leaderboard' },
];

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setAuthUser(loadUser());
  }, []);

  return (
    <div className="shell-v">
      <header className="topnav">
        <div className="topnav-left">
          <a href="/" className="topnav-brand">
            <span className="topnav-logo">⬡</span>
            <span className="topnav-title">TradeAgent</span>
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

        <div className="topnav-right">
          <TradingSettings />
          <WalletConnect />
          <a href="/admin" className="admin-gear" title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </a>
        </div>
      </header>

      <TickerStrip />
      <main className="main-v">
        {children}
      </main>
      <Footer />
    </div>
  );
}
