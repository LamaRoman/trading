import './globals.css';
import type { ReactNode } from 'react';
import NavShell from '../components/NavShell';

export const metadata = {
  title: 'Autonomous Trading Agent',
  description: 'Self-learning trading agent dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
