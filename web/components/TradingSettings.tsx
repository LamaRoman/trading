'use client';

import { useState, useEffect } from 'react';
import {
  loadUser, updateTradingMode,
  type AuthUser, type TradingMode,
} from '../lib/auth';

const MODES: { value: TradingMode; label: string }[] = [
  { value: 'SPOT',          label: 'Spot' },
  { value: 'LEVERAGE_ONLY', label: 'Leverage' },
];

export default function TradingSettings() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(loadUser());
  }, []);

  async function changeMode(mode: TradingMode) {
    if (!user) return;
    try {
      const updated = await updateTradingMode(mode);
      setUser(updated);
      window.dispatchEvent(new CustomEvent('tradingModeChanged', { detail: updated }));
    } catch {}
  }

  if (!user) return null;

  return (
    <div className="tn-settings">
      <div className="tn-pill-group">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`tn-pill ${user.tradingMode === m.value ? 'active' : ''}`}
            onClick={() => changeMode(m.value)}
            title={m.value === 'SPOT' ? 'Buy & sell — no leverage' : 'Leverage — longs & shorts'}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
