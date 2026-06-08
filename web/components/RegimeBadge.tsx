'use client';
import { usePoll } from '../lib/api';

interface RegimeData {
  regime: string;
  adx: number;
  atrPct: number;
  bbWidth: number;
  confidence: number;
  description: string;
  stance: string;
}

const COLORS: Record<string, string> = {
  'strong-trend-up': '#16c784',
  'trend-up': '#16c784',
  'strong-trend-down': '#ea3943',
  'trend-down': '#ea3943',
  ranging: '#f0b90b',
  'volatile-chop': '#ea3943',
  squeeze: '#3b9eff',
  unknown: '#8b97a8',
};

const STANCE_LABEL: Record<string, string> = {
  aggressive: '🟢 aggressive',
  normal: '🔵 normal',
  cautious: '🟡 cautious',
  'sit-out': '🔴 sit out',
};

export default function RegimeBadge({ symbol }: { symbol: string | null }) {
  const data = usePoll<RegimeData>(
    symbol ? `/api/intel/regime/${encodeURIComponent(symbol)}` : null,
    10000,
  );
  if (!data) return null;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px',
      background: 'var(--panel2)', borderRadius: 8, border: `1px solid ${COLORS[data.regime] ?? '#333'}`,
      fontSize: 11,
    }}>
      <span style={{ fontWeight: 800, color: COLORS[data.regime], textTransform: 'uppercase' }}>
        {data.regime.replace(/-/g, ' ')}
      </span>
      <span className="muted">ADX {data.adx.toFixed(0)}</span>
      <span className="muted">|</span>
      <span>{STANCE_LABEL[data.stance] ?? data.stance}</span>
    </div>
  );
}
