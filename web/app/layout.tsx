import './globals.css';
import type { ReactNode } from 'react';
import NavShell from '../components/NavShell';

export const metadata = {
  title: 'TradeAgent — Perpetual Futures Trading',
  description: 'Trade perpetual futures on Hyperliquid with real-time charts, order books, and on-chain execution. Non-custodial, lightning fast.',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'TradeAgent — Trade Perpetuals on Hyperliquid',
    description: 'Professional-grade perpetual futures trading. Real-time order books, live charts, and on-chain execution.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;450;500;550;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
