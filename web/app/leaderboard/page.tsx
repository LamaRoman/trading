'use client';

import NotableTraders from '../../components/NotableTraders';
import TopTraders from '../../components/TopTraders';

export default function LeaderboardPage() {
  return (
    <>
      <NotableTraders />
      <div style={{ marginTop: 16 }}>
        <TopTraders />
      </div>
    </>
  );
}
