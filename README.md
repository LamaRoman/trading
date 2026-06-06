# 🤖 Autonomous Trading Agent (Paper)

A self-learning **paper-trading** agent that picks its own crypto, scores every
opportunity with an explainable confidence %, trades autonomously, and **learns
from its mistakes** so it stops repeating them. Built to remove emotion from
trading by replacing gut decisions with a logged, data-driven loop.

> ⚠️ **Not financial advice.** This is educational software. It trades on
> *simulated* paper money by default. Past (or simulated) performance does not
> predict future results. Do not risk money you can't afford to lose.

---

## What it does

- **Picks its own assets** — you don't choose; the agent scans the whole
  watchlist every cycle and ranks it by confidence (`SOL 62% · AVAX 58% · …`).
- **Explains itself** — every score breaks down into Technical / Sentiment /
  Whale / Momentum sub-scores with plain-English reasons.
- **Trades autonomously** — enters, sizes (risk-based), brackets (TP/SL), exits,
  and **switches** to better opportunities via an opportunity-cost check.
- **Learns** — tracks each signal's win/loss reliability, tags real mistakes,
  accumulates **Lessons**, gently adapts its strategy weights, and **blocks
  itself from repeating** known losing patterns.
- **Shows you everything** — a live dashboard with the leaderboard, a reasoning
  chart (candles + EMAs + trade markers + a confidence timeline), open
  positions, equity curve, and the agent's "brain".

See [`TRADING_AGENT.md`](./TRADING_AGENT.md) for the full blueprint and roadmap.

---

## Stack

- **Backend** — Node + Express 5 + TypeScript, Prisma + PostgreSQL
- **Frontend** — Next.js + React + lightweight-charts (TradingView)
- **Market data** — pluggable: `mock` (synthetic, no keys) or `alpaca` (real)

```
Next.js dashboard ──REST──> Express API ──> Agent loop (scan→rank→decide→execute→learn)
                                              └─> Prisma ──> PostgreSQL
```

---

## Prerequisites

- Node 20+ (tested on 25)
- Docker (for the local Postgres) — or your own Postgres
- macOS/Linux

---

## Quick start

```bash
# 1) start Postgres (Docker, port 5433 — won't clash with a local 5432)
docker compose up -d

# 2) install dependencies
npm install -w server
npm install --prefix web next react react-dom lightweight-charts
npm install --prefix web -D typescript @types/react @types/react-dom @types/node

# 3) create tables + seed the watchlist/config
npm run db:push -w server
npm run db:seed -w server

# 4) run the backend (API + autonomous agent) — http://localhost:4000
npm run dev -w server

# 5) in a second terminal, run the dashboard — http://localhost:3000
npm run dev -w web
```

Open **http://localhost:3000**. The agent starts trading on mock data
immediately. Use **Start / Stop / Step** in the header to control the loop.

---

## How the agent decides (every cycle)

1. **Scan** — pull recent candles for each watchlist asset, compute indicators.
2. **Score** — combine Technical + Whale + Momentum (Sentiment is a Phase-2 stub)
   into a 0–100 confidence and a direction, with reasons.
3. **Rank** — sort the whole watchlist into a leaderboard.
4. **Exit** — close any open trade that hit its bracket, flipped thesis, or whose
   confidence faded.
5. **Enter / Switch** — open the top candidate(s) above the confidence threshold;
   if at capacity, only switch when a new edge beats the weakest holding by a
   margin (opportunity-cost engine). Guardrails: max concurrent, daily-drawdown
   halt, post-loss cooldown, max switches/day, and **lesson-based blocks**.
6. **Learn** — on each close, update signal reliability, tag mistakes, update
   Lessons, and adapt weights.

Every cycle is persisted (`AgentDecision` + `AssetScore`) so the whole history is
auditable and powers the confidence timeline.

---

## Dev tools

```bash
# fast-forward N cycles and print a performance summary (win rate, PF, lessons…)
npx tsx server/src/agent/simulate.ts 250

# run a single decision cycle and print the result
npm run agent:cycle -w server

# browse the database
npm run db:studio -w server
```

---

## Switching to real market data (Alpaca)

1. Create a free account at https://alpaca.markets and generate **paper** keys.
2. In `server/.env`:
   ```
   DATA_PROVIDER=alpaca
   ALPACA_KEY_ID=your_key
   ALPACA_SECRET_KEY=your_secret
   ```
3. Restart the server. (Order routing through Alpaca's paper API and the
   sentiment/whale/news feeds land in Phase 2 — see the blueprint.)

---

## Tuning the agent

Guardrails live in the `AgentConfig` row and can be changed live via
`PUT /api/config` (or edit and re-seed). Key knobs:

| Field | Default | Meaning |
|---|---|---|
| `confidenceThreshold` | 65 | min confidence to take a trade |
| `maxConcurrent` | 3 | max simultaneous positions |
| `riskPerTradePct` | 2 | % of equity risked per trade |
| `stopLossPct` / `takeProfitPct` | 3 / 6 | bracket distances |
| `maxDailyDrawdownPct` | 6 | halt trading for the day if breached |
| `cooldownBars` | 5 | wait after a loss before re-entering an asset |
| `switchEdgeMargin` | 8 | confidence edge required to switch positions |

---

## A note on expectations

On the default **mock** data (a random walk) there is no real edge to find, so
results scatter around break-even from run to run — that's honest and expected.
The value being demonstrated is the **machinery**: disciplined, logged,
emotion-free decisions plus a learning loop that quantifies and stops repeated
mistakes. Real edge requires real data and real signals (Phase 2+).

---

## Project structure

```
trading/
├─ docker-compose.yml      # local Postgres (port 5433)
├─ TRADING_AGENT.md        # full blueprint + roadmap
├─ server/                 # Express API + agent
│  ├─ prisma/schema.prisma
│  └─ src/
│     ├─ market/           # mock + alpaca providers
│     ├─ analysis/         # indicators + confidence engine
│     ├─ trading/          # portfolio, risk, executor
│     ├─ agent/            # cycle, loop, simulate
│     ├─ learning.ts       # reliability, mistakes, lessons, weights
│     └─ api/routes.ts
└─ web/                    # Next.js dashboard
   ├─ app/                 # layout, page, styles
   ├─ components/          # leaderboard, chart, brain, equity curve
   └─ lib/api.ts           # API client + polling hook
```
# Trading Agent
