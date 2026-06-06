'use client';

/** The "why" breakdown — bullishness per signal component (0..100, 50 neutral). */
export default function SignalBars({
  technical,
  sentiment,
  whale,
  momentum,
}: {
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
}) {
  const rows: Array<[string, number]> = [
    ['Technical', technical],
    ['Sentiment', sentiment],
    ['Whale', whale],
    ['Momentum', momentum],
  ];
  return (
    <div>
      {rows.map(([name, v]) => (
        <div className="sigbar" key={name}>
          <span className="name">{name}</span>
          <div className="sigtrack">
            <div
              className="sigfill"
              style={{
                width: `${v}%`,
                background: v >= 55 ? '#16c784' : v <= 45 ? '#ea3943' : '#8b97a8',
              }}
            />
          </div>
          <span className="num">{Math.round(v)}</span>
        </div>
      ))}
    </div>
  );
}
