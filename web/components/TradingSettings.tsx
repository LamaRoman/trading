'use client';

import { useState, useEffect } from 'react';
import {
  loadUser, updateTradingMode, isLiveMode, setLiveMode,
  type AuthUser, type TradingMode,
} from '../lib/auth';

const MODES: { value: TradingMode; label: string; icon: string }[] = [
  { value: 'SPOT',          label: 'Spot',     icon: '🔒' },
  { value: 'LEVERAGE_ONLY', label: 'Leverage', icon: '🔥' },
];

interface Props {
  onLiveModeChange?: (live: boolean) => void;
}

export default function TradingSettings({ onLiveModeChange }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setUser(loadUser());
    setLive(isLiveMode());
  }, []);

  async function changeMode(mode: TradingMode) {
    if (!user) return;
    try {
      const updated = await updateTradingMode(mode);
      setUser(updated);
      window.dispatchEvent(new CustomEvent('tradingModeChanged', { detail: updated }));
    } catch {}
  }

  function toggleLive(on: boolean) {
    if (on && !confirm('Switch to LIVE? You will trade real funds on Hyperliquid testnet.')) return;
    setLive(on);
    setLiveMode(on);
    onLiveModeChange?.(on);
    window.dispatchEvent(new Event('liveModeChanged'));
  }

  if (!user) return null;

  return (
    <div className="tn-settings">
      {/* Mode pills */}
      <div className="tn-pill-group">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`tn-pill ${user.tradingMode === m.value ? 'active' : ''}`}
            onClick={() => changeMode(m.value)}
            title={m.value === 'SPOT' ? 'Buy & sell · no leverage' : 'Leverage · longs & shorts'}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Exchange toggle */}
      <div className="tn-pill-group">
        <button
          className={`tn-pill ${!live ? 'active' : ''}`}
          onClick={() => toggleLive(false)}
        >
          Paper
        </button>
        <button
          className={`tn-pill ${live ? 'active live' : ''}`}
          onClick={() => toggleLive(true)}
        >
          Live
        </button>
      </div>
    </div>
  );
}
