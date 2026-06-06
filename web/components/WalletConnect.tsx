'use client';
import { useState, useEffect } from 'react';
import {
  loginWithMetaMask, loadUser, clearSession,
  shortAddress, type AuthUser,
} from '../lib/auth';

export default function WalletConnect() {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => { setUser(loadUser()); }, []);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const u = await loginWithMetaMask();
      setUser(u);
      window.location.reload();
    } catch (e: any) {
      setError(e.message ?? 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  function disconnect() {
    clearSession();
    setUser(null);
    window.location.reload();
  }

  if (!user) {
    return (
      <div className="wallet-wrap-sb">
        <button className="btn wallet-btn-sb" onClick={connect} disabled={loading}>
          {loading ? 'Connecting…' : '🦊 Connect Wallet'}
        </button>
        {error && <div className="wallet-error" style={{ marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="wallet-wrap-sb">
      <div className="wallet-connected-sb">
        <span className="wallet-dot" />
        <span className="wallet-addr-sb">{shortAddress(user.address)}</span>
      </div>
      <button className="wallet-disconnect-sb" onClick={disconnect}>
        Disconnect
      </button>
    </div>
  );
}
