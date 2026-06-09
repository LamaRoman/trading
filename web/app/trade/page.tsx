'use client';

import { useState, useEffect, useRef } from 'react';
import { usePoll, postJSON, delJSON, fmtPrice, confColor } from '../../lib/api';
import type { Overview, ScoreRow } from '../../lib/api';
import TVChart from '../../components/TVChart';
import RegimeBadge from '../../components/RegimeBadge';
import ManualTrade from '../../components/ManualTrade';
import HyperliquidPanel from '../../components/HyperliquidPanel';
import { loadUser, isLiveMode } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import { getMeta, getSpotMeta, getAllMids, type HlMeta, type HlSpotMeta } from '../../lib/hyperliquid';
import OrderBook from '../../components/OrderBook';
import { SUPPORTED_COINS } from '../../lib/coins';
import MarketInfoBar from '../../components/MarketInfoBar';


export default function TradePage() {
  const ov = usePoll<Overview>('/api/overview', 3000);
  const [sel, setSel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [liveMode, setLiveMode] = useState(false);

  // Market selector state
  const [dropOpen, setDropOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);

  // Hyperliquid available markets
  const [hlMeta, setHlMeta] = useState<HlMeta | null>(null);
  const [hlSpotMeta, setHlSpotMeta] = useState<HlSpotMeta | null>(null);
  const [hlMids, setHlMids] = useState<Record<string, string>>({});

  const isSpotMode = authUser?.tradingMode === 'SPOT';

  useEffect(() => {
    setAuthUser(loadUser());
    setLiveMode(isLiveMode());
    getMeta().then(setHlMeta).catch(() => {});
    getSpotMeta().then(setHlSpotMeta).catch(() => {});
    getAllMids().then(setHlMids).catch(() => {});

    // Listen for live mode and trading mode changes from sidebar
    const onModeChange = (e: Event) => {
      const user = (e as CustomEvent).detail;
      setAuthUser(user);
    };
    const onLiveChange = () => setLiveMode(isLiveMode());
    window.addEventListener('tradingModeChanged', onModeChange);
    window.addEventListener('liveModeChanged', onLiveChange);
    return () => {
      window.removeEventListener('tradingModeChanged', onModeChange);
      window.removeEventListener('liveModeChanged', onLiveChange);
    };
  }, []);

  // No outside-click handler needed — we use an overlay instead

  const lb = (ov?.leaderboard ?? []).filter((r) => !hidden.has(r.symbol));
  const selected = sel ?? lb[0]?.symbol ?? 'BTC/USD';
  const selRow = lb.find((r) => r.symbol === selected) ?? lb[0] ?? null;

  function selectCoin(symbol: string) {
    setSel(symbol);
    setDropOpen(false);
    setSearchQ('');
  }

  async function removePick(symbol: string, e: React.MouseEvent) {
    e.stopPropagation();
    setHidden((prev) => new Set(prev).add(symbol));
    if (sel === symbol) setSel(null);
    await delJSON('/api/assets', { symbol });
  }

  // Refresh HL mids when dropdown opens
  useEffect(() => {
    if (dropOpen) getAllMids().then(setHlMids).catch(() => {});
  }, [dropOpen]);

  // Items shown in the dropdown
  const q = searchQ.trim().toLowerCase();
  const watchlistFiltered = q
    ? lb.filter((r) => r.symbol.toLowerCase().includes(q))
    : lb;

  // Hyperliquid markets filtered by search, excluding ones already in watchlist or just added
  const watchlistCoins = new Set(lb.map((r) => r.symbol.replace('/USD', '')));

  // Perp markets — only show coins that exist on both HL and Binance/TradingView
  const hlPerpsFiltered = isSpotMode ? [] : (hlMeta?.universe ?? [])
    .filter((a) => SUPPORTED_COINS.has(a.name))
    .filter((a) => !watchlistCoins.has(a.name) && !added.has(a.name))
    .filter((a) => !q || a.name.toLowerCase().includes(q));

  // Spot markets — only shown in spot mode, only supported coins
  const hlSpotsFiltered = !isSpotMode ? [] : (() => {
    const seen = new Set<string>();
    return (hlSpotMeta?.universe ?? [])
      .filter((s) => {
        const baseToken = hlSpotMeta?.tokens.find((t) => t.index === s.tokens[0]);
        const name = baseToken?.name ?? '';
        if (!name || !SUPPORTED_COINS.has(name)) return false;
        if (seen.has(name) || watchlistCoins.has(name) || added.has(name)) return false;
        if (q && !name.toLowerCase().includes(q)) return false;
        seen.add(name);
        return true;
      })
      .slice(0, q ? 100 : 50);
  })();

  const hlFiltered = hlPerpsFiltered;

  // Coins that were just added (optimistic) but not yet in server leaderboard
  const pendingAdded = [...added].filter((c) => !watchlistCoins.has(c));

  return (
    <div className="trade-page">
      {/* ── Watchlist ticker strip ── */}
      {(lb.length > 0 || pendingAdded.length > 0) && (
        <div className="ticker-strip">
          {lb.map((r) => (
            <button
              key={r.symbol}
              className={`ticker-item ${r.symbol === selected ? 'active' : ''}`}
              onClick={() => selectCoin(r.symbol)}
            >
              <span className="ticker-sym">{r.symbol.replace('/USD', '')}</span>
              <span className="ticker-price mono">{fmtPrice(r.price)}</span>
              <span className="ticker-conf" style={{ color: confColor(r.confidence) }}>
                {r.confidence}%
              </span>
              <span
                className="ticker-rm"
                onClick={(e) => removePick(r.symbol, e)}
                title="Remove from watchlist"
              >
                ×
              </span>
            </button>
          ))}
          {pendingAdded.map((c) => (
            <button
              key={c}
              className={`ticker-item ${`${c}/USD` === selected ? 'active' : ''}`}
              onClick={() => selectCoin(`${c}/USD`)}
            >
              <span className="ticker-sym">{c}</span>
              <span className="ticker-price mono muted">
                {hlMids[c] ? `$${parseFloat(hlMids[c]).toFixed(2)}` : '…'}
              </span>
              <span
                className="ticker-rm"
                onClick={(e) => {
                  e.stopPropagation();
                  setAdded((prev) => { const n = new Set(prev); n.delete(c); return n; });
                  delJSON('/api/assets', { symbol: `${c}/USD` });
                }}
                title="Remove from watchlist"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Market info + Long/Short bar (with built-in dropdown trigger) ── */}
      <div ref={dropRef} style={{ position: 'relative' }}>
        {selected ? (
          <MarketInfoBar coin={selected} onChangeCoin={() => setDropOpen((p) => !p)} />
        ) : (
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => setDropOpen((p) => !p)}>
            Select market ▾
          </button>
        )}

        {/* Dropdown panel */}
        <div className="market-selector">

          {dropOpen && (<>
            <div className="market-overlay" onClick={() => setDropOpen(false)} />
            <div className="market-drop">
              <input
                className="market-search"
                placeholder="Search markets…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                autoFocus
              />

              {/* Watchlist section */}
              {watchlistFiltered.length > 0 && (
                <>
                  <div className="market-drop-section">Watchlist</div>
                  {watchlistFiltered.map((r) => (
                    <button
                      key={r.symbol}
                      className={`market-drop-item ${r.symbol === selected ? 'active' : ''}`}
                      onClick={() => selectCoin(r.symbol)}
                    >
                      <span className="market-drop-sym">{r.symbol}</span>
                      <span className={`badge ${r.direction}`} style={{ fontSize: 9 }}>{r.direction}</span>
                      <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmtPrice(r.price)}</span>
                      <span style={{ color: confColor(r.confidence), fontWeight: 700, fontSize: 12, minWidth: 36, textAlign: 'right' }}>
                        {r.confidence}%
                      </span>
                    </button>
                  ))}
                </>
              )}

              {/* Hyperliquid markets */}
              {hlFiltered.length > 0 && (
                <>
                  <div className="market-drop-section">Hyperliquid Perps</div>
                  {hlFiltered.map((a) => {
                    const mid = hlMids[a.name] ? parseFloat(hlMids[a.name]) : null;
                    return (
                      <div
                        key={a.name}
                        className="market-drop-item"
                        onClick={() => selectCoin(`${a.name}/USD`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="market-drop-sym">{a.name}</span>
                        <span className="muted" style={{ fontSize: 10 }}>{a.maxLeverage}x max</span>
                        <span style={{ flex: 1 }} />
                        {mid && (
                          <span className="mono muted" style={{ fontSize: 11, marginRight: 8 }}>
                            ${mid < 1 ? mid.toPrecision(4) : mid.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                        )}
                        {added.has(a.name) ? (
                          <span className="muted" style={{ fontSize: 10 }}>watching</span>
                        ) : (
                          <button
                            className="market-add-tag-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdded((prev) => new Set(prev).add(a.name));
                              postJSON('/api/assets', { symbol: a.name, name: a.name });
                            }}
                          >
                            + watch
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Hyperliquid spot markets */}
              {hlSpotsFiltered.length > 0 && (
                <>
                  <div className="market-drop-section">Hyperliquid Spot</div>
                  {hlSpotsFiltered.map((s) => {
                    const baseToken = hlSpotMeta?.tokens.find((t) => t.index === s.tokens[0]);
                    const name = baseToken?.name ?? s.name;
                    const mid = hlMids[name] ? parseFloat(hlMids[name]) : null;
                    return (
                      <div
                        key={`spot-${s.index}-${s.name}`}
                        className="market-drop-item"
                        onClick={() => selectCoin(`${name}/USD`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="market-drop-sym">{name}</span>
                        <span className="muted" style={{ fontSize: 10 }}>spot</span>
                        <span style={{ flex: 1 }} />
                        {mid && (
                          <span className="mono muted" style={{ fontSize: 11, marginRight: 8 }}>
                            ${mid < 1 ? mid.toPrecision(4) : mid.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                        )}
                        {added.has(name) ? (
                          <span className="muted" style={{ fontSize: 10 }}>watching</span>
                        ) : (
                          <button
                            className="market-add-tag-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdded((prev) => new Set(prev).add(name));
                              postJSON('/api/assets', { symbol: name, name });
                            }}
                          >
                            + watch
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {q && watchlistFiltered.length === 0 && hlFiltered.length === 0 && hlSpotsFiltered.length === 0 && (
                <div className="empty" style={{ padding: '8px 0' }}>No markets found</div>
              )}
            </div>
          </>)}
        </div>

      </div>

      {/* ── Chart + Order Book + Order panel ── */}
      <div className="trade-main">
        <div className="trade-chart">
          {selected ? (
            <TVChart symbol={selected} height={660} />
          ) : (
            <div className="panel" style={{ height: 660, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="empty">Select a market to view chart</div>
            </div>
          )}
        </div>

        <OrderBook coin={selected ?? 'BTC/USD'} />

        <div className="trade-order">
          {authUser && liveMode ? (
            <HyperliquidPanel
              assets={lb.map((r) => ({ symbol: r.symbol }))}
              walletAddress={authUser.address}
              spotMode={isSpotMode}
              selectedCoin={selected?.replace('/USD', '') ?? ''}
              builderFeePct={ov?.config.builderFeePct ?? 0}
            />
          ) : (
            <ManualTrade
              assets={lb.map((r) => ({ symbol: r.symbol }))}
              onTraded={() => {}}
              builderFeePct={ov?.config.builderFeePct ?? 0}
              selectedCoin={selected ?? ''}
            />
          )}
        </div>
      </div>
    </div>
  );
}
