'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMeta, getSpotMeta, getAccountState, getOpenOrders, getAllMids,
  getSpotBalances, getSpotSzDecimals,
  placeOrder, cancelOrder, closePosition,
  assetIndex, formatSize, formatPrice,
  type HlMeta, type HlSpotMeta, type HlAccountState, type HlOpenOrder, type OrderParams,
} from '../lib/hyperliquid';

interface Props {
  assets: { symbol: string }[];
  walletAddress: string;
  spotMode?: boolean;
  selectedCoin?: string;
}

export default function HyperliquidPanel({ assets, walletAddress, spotMode = false, selectedCoin = '' }: Props) {
  const [meta, setMeta] = useState<HlMeta | null>(null);
  const [spotMeta, setSpotMeta] = useState<HlSpotMeta | null>(null);
  const [account, setAccount] = useState<HlAccountState | null>(null);
  const [orders, setOrders] = useState<HlOpenOrder[]>([]);
  const [mids, setMids] = useState<Record<string, string>>({});
  const [spotBalances, setSpotBalances] = useState<Record<string, string>>({});

  const coin = selectedCoin || 'BTC';
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [sizeUsd, setSizeUsd] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [showTpSl, setShowTpSl] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedMeta = meta?.universe.find((u) => u.name === coin);
  const maxLev = spotMode ? 1 : (selectedMeta?.maxLeverage ?? 1);
  const midPrice = coin ? parseFloat(mids[coin] ?? '0') : 0;

  // Generate leverage options based on the asset's max leverage
  const levOptions = spotMode ? [1] : [1, 2, 3, 5, 10, 20, 25, 40, 50].filter((l) => l <= maxLev);

  // Fetch meta once
  useEffect(() => {
    getMeta().then(setMeta).catch(() => {});
    getSpotMeta().then(setSpotMeta).catch(() => {});
  }, []);

  // Poll account state, orders, mids
  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const [acc, ords, ms, sb] = await Promise.all([
        getAccountState(walletAddress),
        getOpenOrders(walletAddress),
        getAllMids(),
        getSpotBalances(walletAddress).catch(() => ({})),
      ]);
      setAccount(acc);
      setOrders(ords);
      setMids(ms);
      setSpotBalances(sb);
    } catch {}
  }, [walletAddress]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Clamp leverage when switching coins
  useEffect(() => {
    if (maxLev > 0 && leverage > maxLev) setLeverage(maxLev);
  }, [coin, maxLev]);

  async function handlePlace() {
    if (!meta || !coin || !sizeUsd) return;
    if (spotMode && !spotMeta) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const dir = spotMode ? 'LONG' : direction;
      const lev = spotMode ? 1 : leverage;
      const price =
        orderType === 'limit' ? limitPrice : dir === 'LONG' ? '999999' : '0.01';
      const sz = parseFloat(sizeUsd) / midPrice;
      const szDec = spotMode
        ? getSpotSzDecimals(spotMeta!, coin)
        : (selectedMeta?.szDecimals ?? 4);

      const params: OrderParams = {
        coin,
        isBuy: dir === 'LONG',
        price: formatPrice(parseFloat(price)),
        size: formatSize(sz * lev, szDec),
        reduceOnly: spotMode ? false : reduceOnly,
        orderType,
        isSpot: spotMode,
        tpPrice: tpPrice ? formatPrice(parseFloat(tpPrice)) : undefined,
        slPrice: slPrice ? formatPrice(parseFloat(slPrice)) : undefined,
      };

      await placeOrder(meta, params, spotMode ? spotMeta! : undefined);
      setSuccess(spotMode ? `Bought ${coin} — sent to Hyperliquid` : `${dir} ${coin} — ${lev}x — sent to Hyperliquid`);
      setSizeUsd('');
      setLimitPrice('');
      setTpPrice('');
      setSlPrice('');
      setTimeout(refresh, 1000);
    } catch (e: any) {
      setError(e.message ?? 'Order failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleClose(pos: HlAccountState['assetPositions'][0]['position']) {
    if (!meta) return;
    try {
      const size = pos.szi.replace('-', '');
      const isBuy = parseFloat(pos.szi) < 0;
      await closePosition(meta, pos.coin, size, isBuy);
      setTimeout(refresh, 1000);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleCancel(o: HlOpenOrder) {
    if (!meta) return;
    try {
      await cancelOrder(o.coin, o.oid, meta);
      setTimeout(refresh, 1000);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const margin = account?.crossMarginSummary ?? account?.marginSummary;
  const positions = account?.assetPositions?.filter(
    (p) => parseFloat(p.position.szi) !== 0,
  ) ?? [];

  return (
    <div className="panel hl-panel" style={{ marginTop: 0 }}>
      <h2>{spotMode ? 'Spot' : 'Perp'} Trading <span className="hl-testnet-badge">TESTNET</span></h2>

      {/* Account overview */}
      {spotMode ? (
        <div className="hl-account">
          <div className="hl-stat">
            <span className="hl-stat-label">USDC</span>
            <span className="hl-stat-value">${parseFloat(spotBalances['USDC'] ?? '0').toFixed(2)}</span>
          </div>
          {coin && spotBalances[coin] && parseFloat(spotBalances[coin]) > 0 && (
            <div className="hl-stat">
              <span className="hl-stat-label">{coin}</span>
              <span className="hl-stat-value">{parseFloat(spotBalances[coin]).toFixed(4)}</span>
            </div>
          )}
        </div>
      ) : margin ? (
        <div className="hl-account">
          <div className="hl-stat">
            <span className="hl-stat-label">Balance</span>
            <span className="hl-stat-value">${parseFloat(margin.accountValue).toFixed(2)}</span>
          </div>
          <div className="hl-stat">
            <span className="hl-stat-label">Margin Used</span>
            <span className="hl-stat-value">${parseFloat(margin.totalMarginUsed).toFixed(2)}</span>
          </div>
          <div className="hl-stat">
            <span className="hl-stat-label">Notional</span>
            <span className="hl-stat-value">${parseFloat(margin.totalNtlPos).toFixed(2)}</span>
          </div>
        </div>
      ) : null}

      {/* Order form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <div className="hl-selected-coin">
          <span className="hl-coin-name">{coin}</span>
          {midPrice > 0 && <span className="hl-coin-price mono">${midPrice < 1 ? midPrice.toPrecision(4) : midPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
          {!spotMode && selectedMeta && <span className="lev-badge">{maxLev}x max</span>}
          <span className="hl-coin-mode">{spotMode ? 'SPOT' : 'PERP'}</span>
        </div>

        {!spotMode ? (
          <div>
            <label className="manual-label">Direction</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['LONG', 'SHORT'] as const).map((d) => (
                <button
                  key={d}
                  className={`manual-dir ${direction === d ? d.toLowerCase() : ''}`}
                  onClick={() => setDirection(d)}
                >
                  {d === 'LONG' ? '▲ Long' : '▼ Short'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className="manual-label">Order Type</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['market', 'limit'] as const).map((t) => (
              <button
                key={t}
                className={`lev-btn ${orderType === t ? 'active' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setOrderType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="manual-label">Size (USD)</label>
          <input
            className="manual-input"
            type="number"
            placeholder="e.g. 50"
            value={sizeUsd}
            onChange={(e) => setSizeUsd(e.target.value)}
            min={1}
          />
        </div>

        {orderType === 'limit' && (
          <div>
            <label className="manual-label">Limit Price</label>
            <input
              className="manual-input"
              type="number"
              placeholder={midPrice ? midPrice.toFixed(2) : '—'}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              step="any"
            />
          </div>
        )}

        {!spotMode ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="manual-label" style={{ margin: 0 }}>Leverage</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  min={1}
                  max={maxLev}
                  value={leverage}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(maxLev, parseInt(e.target.value) || 1));
                    setLeverage(v);
                  }}
                  style={{
                    width: 52, textAlign: 'center', padding: '3px 4px',
                    background: 'var(--panel2)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text)', fontSize: 13, fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>/ {maxLev}x</span>
              </div>
            </div>
            {/* Slider */}
            <input
              type="range"
              min={1}
              max={maxLev}
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="lev-slider"
              style={{ '--pct': ((leverage - 1) / (maxLev - 1)) * 100 } as React.CSSProperties}
            />
            {/* Quick picks — deduplicated */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {[...new Set([1, Math.round(maxLev * 0.25), Math.round(maxLev * 0.5), Math.round(maxLev * 0.75), maxLev])].map((v) => (
                <button
                  key={v}
                  className={`lev-quick ${leverage === v ? 'active' : ''}`}
                  onClick={() => setLeverage(v)}
                >
                  {v}x
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!spotMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
              Reduce only
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showTpSl} onChange={(e) => setShowTpSl(e.target.checked)} />
              Take Profit / Stop Loss
            </label>
            {showTpSl && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
                <div>
                  <label className="manual-label" style={{ color: 'var(--green)' }}>TP Price</label>
                  <input
                    className="manual-input"
                    type="number"
                    placeholder={midPrice ? (direction === 'LONG' ? (midPrice * 1.05).toFixed(0) : (midPrice * 0.95).toFixed(0)) : '—'}
                    value={tpPrice}
                    onChange={(e) => setTpPrice(e.target.value)}
                    step="any"
                    style={{ borderColor: tpPrice ? 'var(--green)' : undefined }}
                  />
                </div>
                <div>
                  <label className="manual-label" style={{ color: 'var(--red)' }}>SL Price</label>
                  <input
                    className="manual-input"
                    type="number"
                    placeholder={midPrice ? (direction === 'LONG' ? (midPrice * 0.97).toFixed(0) : (midPrice * 1.03).toFixed(0)) : '—'}
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    step="any"
                    style={{ borderColor: slPrice ? 'var(--red)' : undefined }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Summary + Liquidation price */}
        {sizeUsd && Number(sizeUsd) > 0 && midPrice > 0 && (
          <div className="hl-order-summary">
            {spotMode ? (
              <div className="hl-summary-row">
                <span>Size</span>
                <span>{formatSize(Number(sizeUsd) / midPrice, selectedMeta?.szDecimals ?? 4)} {coin}</span>
              </div>
            ) : (() => {
              const MMR = 0.005; // 0.5% maintenance margin rate
              const entryPrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : midPrice;
              const liqPrice = direction === 'LONG'
                ? entryPrice * (1 - 1 / leverage + MMR)
                : entryPrice * (1 + 1 / leverage - MMR);
              const notional = Number(sizeUsd) * leverage;
              return (
                <>
                  <div className="hl-summary-row">
                    <span>Notional</span>
                    <span className="mono">${notional.toFixed(2)}</span>
                  </div>
                  <div className="hl-summary-row">
                    <span>Size</span>
                    <span className="mono">{formatSize(notional / midPrice, selectedMeta?.szDecimals ?? 4)} {coin}</span>
                  </div>
                  <div className="hl-summary-row">
                    <span>Mark Price</span>
                    <span className="mono">${midPrice.toFixed(2)}</span>
                  </div>
                  <div className="hl-summary-row">
                    <span>Est. Liq. Price</span>
                    <span className="mono" style={{ color: 'var(--red)', fontWeight: 700 }}>
                      ${liqPrice.toFixed(2)}
                    </span>
                  </div>
                  {tpPrice && (
                    <div className="hl-summary-row">
                      <span>Take Profit</span>
                      <span className="mono up">${parseFloat(tpPrice).toFixed(2)}</span>
                    </div>
                  )}
                  {slPrice && (
                    <div className="hl-summary-row">
                      <span>Stop Loss</span>
                      <span className="mono down">${parseFloat(slPrice).toFixed(2)}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {error && <div className="manual-error">{error}</div>}
        {success && <div className="manual-success">{success}</div>}

        <button
          className="btn go"
          style={{ width: '100%' }}
          onClick={handlePlace}
          disabled={loading || !coin || !sizeUsd || (orderType === 'limit' && !limitPrice)}
        >
          {loading ? 'Signing…' : spotMode ? `Buy ${coin} — ${orderType}` : `Place ${direction} — ${orderType}`}
        </button>
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2>Positions</h2>
          <table>
            <thead>
              <tr>
                <th>Coin</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Liq. Price</th>
                <th>uPnL</th>
                <th>Lev</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pos = p.position;
                const szi = parseFloat(pos.szi);
                const isLong = szi > 0;
                const upnl = parseFloat(pos.unrealizedPnl);
                const entryPx = parseFloat(pos.entryPx);
                const lev = pos.leverage?.value ?? 1;
                const MMR = 0.005;
                const liqPx = isLong
                  ? entryPx * (1 - 1 / lev + MMR)
                  : entryPx * (1 + 1 / lev - MMR);
                return (
                  <tr key={pos.coin}>
                    <td>{pos.coin}</td>
                    <td>
                      <span className={`badge ${isLong ? 'LONG' : 'SHORT'}`}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="mono">{Math.abs(szi).toFixed(4)}</td>
                    <td className="mono">${entryPx.toFixed(2)}</td>
                    <td className="mono down" style={{ fontWeight: 600 }}>${liqPx.toFixed(2)}</td>
                    <td className={`mono ${upnl >= 0 ? 'up' : 'down'}`}>
                      ${upnl.toFixed(2)}
                    </td>
                    <td>
                      <span className="lev-badge">{lev}x</span>
                    </td>
                    <td>
                      <button
                        className="btn danger"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => handleClose(pos)}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Open Orders */}
      {orders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2>Open Orders</h2>
          <table>
            <thead>
              <tr>
                <th>Coin</th>
                <th>Side</th>
                <th>Price</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.oid}>
                  <td>{o.coin}</td>
                  <td>
                    <span className={`badge ${o.side === 'B' ? 'LONG' : 'SHORT'}`}>
                      {o.side === 'B' ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  <td className="mono">${parseFloat(o.limitPx).toFixed(2)}</td>
                  <td className="mono">{parseFloat(o.sz).toFixed(4)}</td>
                  <td>
                    <button
                      className="btn danger"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => handleCancel(o)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
