'use client';
import { useState, useRef, useEffect } from 'react';
import { postJSON, API_BASE } from '../lib/api';

interface CoinResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  market_cap_rank: number | null;
}

export default function CoinSearch({ onAdded }: { onAdded?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoinResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    setMsg(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(() => search(val.trim()), 300);
  }

  async function search(q: string) {
    setLoading(true);
    try {
      // Search through our API server (proxies to CoinGecko, falls back to known list)
      const r = await fetch(`${API_BASE}/api/coins/search?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('search failed');
      const coins: CoinResult[] = await r.json();
      setResults(coins);
      setOpen(coins.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function addCoin(coin: CoinResult) {
    setAdding(coin.symbol);
    setMsg(null);
    try {
      const res = await postJSON('/api/assets', { symbol: coin.symbol, name: coin.name });
      if (res?.error) {
        setMsg({ type: 'err', text: res.error });
      } else {
        setMsg({ type: 'ok', text: `✓ ${coin.name} (${coin.symbol}) added` });
        setQuery('');
        setResults([]);
        setOpen(false);
        onAdded?.();
        setTimeout(() => setMsg(null), 4000);
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message ?? 'failed' });
    } finally {
      setAdding(null);
    }
  }

  return (
    <div ref={wrapRef} className="coin-search">
      <div className="addrow">
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search coin (e.g. shiba, solana, bnb)"
          spellCheck={false}
        />
        {loading && <span className="search-spin">⏳</span>}
      </div>

      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((c) => (
            <div
              key={c.id}
              className="search-row"
              onClick={() => addCoin(c)}
            >
              {c.thumb ? (
                <img src={c.thumb} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
              ) : (
                <div style={{ width: 20, height: 20, borderRadius: 4, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#8b97a8' }}>
                  {c.symbol.slice(0, 2)}
                </div>
              )}
              <div className="search-info">
                <span className="search-name">{c.name}</span>
                <span className="search-sym">{c.symbol}</span>
              </div>
              {c.market_cap_rank && (
                <span className="search-rank">#{c.market_cap_rank}</span>
              )}
              {adding === c.symbol ? (
                <span className="search-adding">adding…</span>
              ) : (
                <span className="search-add">+ Add</span>
              )}
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className={msg.type === 'ok' ? 'search-msg ok' : 'search-msg err'}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
