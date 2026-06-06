# Trading Agent — Project Blueprint

## Overview

An AI-powered **autonomous** paper trading agent that picks its own assets, learns from its mistakes, reads charts, analyzes sentiment, detects whale manipulation, and adapts its strategy over time. Built to eliminate emotional trading through systematic, data-driven decision making.

**Stack**: Next.js (frontend) + Express (API) + Prisma + PostgreSQL + Alpaca API

---

## Core Principle

> **The agent's job is to find the highest expected-value position at all times. Capital should always be in the best available opportunity — or in cash if nothing clears the confidence threshold.**

The human does NOT pick assets. The human does NOT approve trades. The agent scans, scores, ranks, decides, and executes autonomously. The human's role is to review reasoning, audit performance, and tune guardrails. Every decision is logged with full reasoning so it can be reviewed and learned from.

**Non-negotiable goal: build a profitable portfolio over time by never repeating the same mistake twice.** The learning loop is the heart of this system, not a feature bolted on top.

---

## Phase 1 — Build Status (current)

| Component | Status |
|---|---|
| Monorepo scaffold (npm workspaces) | ✅ done |
| Postgres (Docker, port 5433) + Prisma schema | ✅ done |
| Market data layer — mock provider (no keys) + Alpaca-ready | ✅ done |
| Technical indicators (RSI/EMA/MACD/Bollinger/ATR/VWAP/…) | ✅ done |
| Confidence scoring engine (ranked %, direction, reasons) | ✅ done |
| Paper trading engine + risk sizing + bracket TP/SL | ✅ done |
| Autonomous loop (scan→rank→decide→switch→execute→log) | ✅ done |
| Learning system (signal reliability, mistakes, lessons, weight adaptation, block-on-repeat) | ✅ done |
| REST API (Express) | ✅ done |
| Next.js dashboard (leaderboard, reasoning charts, P&L, brain) | 🚧 in progress |
| End-to-end run + README | 🚧 in progress |

**Verified:** a clean 250-cycle simulation on mock data produced 26 trades, 57.7% win
rate, profit factor 1.52, gently adapted weights, and recorded meaningful lessons —
confirming the full scan→rank→trade→learn→adapt→guard loop works end to end.

### How to run
```bash
docker compose up -d          # start Postgres (port 5433)
npm install -w server         # install backend deps
npm run db:push -w server     # create tables
npm run db:seed -w server     # seed watchlist + config
npm run dev -w server         # start API + autonomous agent (http://localhost:4000)
# dev tools:
npm run agent:cycle -w server                 # run one decision cycle
npx tsx server/src/agent/simulate.ts 250      # fast-forward 250 cycles + summary
```

---

## Phase 1 — MVP Scope

### 1. Market Data Ingestion

#### Raw Price Data (Alpaca + CoinMarketCap)
- OHLCV candles (1m, 5m, 15m, 1h, 4h, 1D)
- Real-time price streaming via WebSocket
- Order book depth (bid/ask spread, wall detection)
- Trade tape (individual trades, size, aggressor side)
- Volume profile (price levels where most trading occurred)
- Pre/post market activity (stocks)

#### Supported Markets
- **Crypto** — via Alpaca + CoinMarketCap for meme tokens (primary focus)
- **Stocks** — via Alpaca

---

### 2. Technical Analysis Engine

#### Trend Indicators
- Moving Averages: EMA 9, 21, 50, 200
- ADX (trend strength)
- Ichimoku Cloud

#### Momentum Indicators
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Stochastic Oscillator

#### Volatility Indicators
- Bollinger Bands
- ATR (Average True Range)

#### Volume Indicators
- OBV (On-Balance Volume)
- VWAP (Volume Weighted Average Price)
- Volume spike detection (current vs 20-period average)

#### Pattern Detection
- Support/resistance levels (auto-detected from price action)
- Chart patterns: double tops/bottoms, head & shoulders, triangles, breakouts
- Candlestick patterns: engulfing, doji, hammer, morning/evening star

#### Extreme Detection (Rock Bottom / Peak)
- **Bounce candidate (rock bottom)**: oversold across multiple timeframes + capitulation volume + Fear & Greed at extreme fear + price at historical support → likely due for a bounce
- **Reversal candidate (peak)**: overbought across timeframes + euphoria sentiment + whale distribution + parabolic price extension → likely due for a drop
- Multi-timeframe confirmation required before flagging an extreme
- These feed directly into the confidence engine as high-weight signals

---

### 3. Sentiment & News Analysis

#### News
- Alpaca News API — real-time financial news per ticker
- Headline sentiment scoring (bullish/bearish/neutral)
- News velocity — how many articles in last hour vs baseline

#### Social Sentiment
- Reddit API (r/wallstreetbets, r/stocks, r/cryptocurrency)
- X/Twitter trending tickers and sentiment polarity
- Social mention velocity (mentions/hour trend)
- Bullish vs bearish ratio per ticker

#### Macro Mood
- Fear & Greed Index (Alternative.me API)
- Sector rotation signals
- Earnings calendar + historical surprise data

---

### 4. Whale & Manipulation Detection

#### Whale Activity
- Large transaction monitoring (trades > $100K / configurable threshold)
- Wallet tracking — flag wallets with consistent profit history (crypto)
- Accumulation vs distribution detection (are whales buying or dumping?)
- Sudden large order book changes (spoofing detection)

#### Pump & Dump Detection
- Sudden price spikes with no news catalyst = suspicious
- Volume surge + social mention surge + thin order book = pump signal
- Price spike followed by rapid decline pattern recognition
- Alert and auto-avoid tokens flagged as pump & dump

#### Meme Token Tracking
- New token listings / trending on CoinMarketCap
- Social hype velocity scoring
- Liquidity depth analysis (thin liquidity = high manipulation risk)
- Smart money wallet inflow to new tokens
- Rug pull risk scoring (liquidity locked? dev wallet %)

#### Market Manipulation Signals
- Liquidation cascade detection (crypto futures)
- Exchange inflow/outflow tracking (tokens moving to exchange = sell pressure)
- Wash trading detection (suspicious volume patterns)
- Stop-hunt detection (price wicks through obvious support/resistance then reversal)

---

### 5. Autonomous Operation (The Agent's Decision Loop)

This is what makes it an *agent* and not a dashboard. It runs continuously:

```
  ┌──────────────────────────────────────────────────┐
  │  1. SCAN    — score every asset on the watchlist  │
  │  2. RANK    — sort by confidence / expected value  │
  │  3. DECIDE  — compare to current holdings          │
  │  4. EXECUTE — enter / exit / switch / hold / size  │
  │  5. LOG     — record full reasoning + snapshot     │
  │  6. LEARN   — update signal weights from outcomes  │
  └──────────────────────────────────────────────────┘
                       ↺ repeat every cycle
```

#### Self-Selection
- The agent picks the asset — the user never does
- Continuously scores ALL watchlist assets in real-time, not just the one it holds
- Produces a live ranked leaderboard: `SOL 78% · BTC 61% · DOGE 44% ...`

#### Confidence Scoring
- Every potential trade gets a confidence % (probability-of-profit estimate)
- Only acts when confidence clears a configurable threshold (e.g. ≥ 65%)
- If nothing clears the threshold → sits in cash (cash is a valid position)

#### Auto-Execution
- Enters and exits entirely on its own — no human approval step
- Sets take-profit and stop-loss automatically (bracket orders)
- Auto-closes when the thesis is invalidated or target hit

#### Auto-Switching (Opportunity Cost Engine)
- If a better opportunity appears mid-trade, the agent evaluates a switch
- **Switch only if**: `new_opportunity_edge > current_position_edge + switching_cost`
  where switching_cost = est. slippage + spread + realized-loss-lock-in + churn penalty
- Does NOT chase every shiny thing — the edge must meaningfully exceed the cost
- **Max switches per day** capped to avoid churning fees and signal noise

#### Position Graduation (scaling in/out)
- Confidence rising on a held asset → add to the position
- Confidence falling → trim before fully exiting
- Not just binary in/out — position size tracks conviction

#### Portfolio Allocation
- Can run 2–3 concurrent positions when multiple high-confidence setups exist
- Correlation check — avoids stacking correlated assets (e.g. not all L1s at once)
- Allocates more capital to higher-confidence positions

#### Behavioral Guardrails (anti-emotion, applied to the agent itself)
- **Cooling-off period** — after a loss on an asset, wait N bars before re-entering it (prevents the agent from revenge-trading)
- **Max daily drawdown** — if hit, the agent stops trading for the day
- **Max concurrent positions** — hard cap
- **No-trade windows** — skip low-liquidity hours

---

### 6. Paper Trading Engine

#### Trade Execution (via Alpaca Paper Trading API)
- Market, limit, stop, and stop-limit orders
- Bracket orders (entry + take profit + stop loss)
- Position sizing based on account % risk per trade

#### Risk Management
- Max risk per trade: configurable (default 1–2% of capital)
- Max concurrent positions: configurable
- Max daily drawdown limit — stop trading for the day if hit
- Correlation check — avoid overexposure to correlated assets
- No trading during low-liquidity hours (configurable)

#### Trade Logging (every trade records)
- Entry/exit price and time
- Signals that triggered the trade (which indicators, what sentiment score)
- Market regime at time of trade (trending/ranging/choppy)
- Confidence score at entry (and how it evolved)
- P&L result
- Snapshot of chart + signal state at entry and exit
- What went right / what went wrong (auto-analyzed)

---

### 7. Learning System

#### Signal Reliability Tracking
- Each signal gets a reliability score (starts at 50%, adjusts with outcomes)
- Track win rate per signal and per signal combination
- Track signal performance by market regime
- Signals that consistently lose get downweighted automatically

#### Mistake Pattern Recognition
- Categorize losses: "bought into resistance", "ignored divergence", "caught in pump & dump", "wrong market regime", "switched too early", "held too long"
- Track frequency of each mistake type
- Generate "lessons learned" after every N trades
- **Alert and block when about to repeat a known mistake pattern** — this is the core promise: never repeat the same mistake twice

#### Strategy Adaptation
- Decision weight adjustment based on realized signal performance:
  - Technical signals: starts at 40%
  - Sentiment score: starts at 25%
  - Order flow / whale activity: starts at 20%
  - Hype / momentum: starts at 15%
- Weights shift as the agent learns what actually predicts profits
- Market regime detection — different weights for trending vs ranging vs choppy

#### Performance Analytics
- Win rate, average win/loss, profit factor
- Sharpe ratio, max drawdown, recovery time
- Best/worst performing setups
- Time-of-day performance analysis
- Equity curve tracking

---

### 8. Dashboard (Next.js Frontend)

#### Main Views
- **Live Dashboard** — current positions, P&L, the live ranked leaderboard, agent confidence, cash %
- **Charts (the reasoning board)** — see below
- **Trade History** — full log with filters, sortable by outcome
- **Agent Brain** — current signal weights, reliability scores, known mistake patterns
- **Whale Tracker** — large transactions, wallet activity, manipulation alerts
- **Sentiment Feed** — news, social buzz, fear & greed gauge
- **Performance** — equity curve, win rate trends, drawdown chart
- **Lessons** — what the agent has learned, ranked by impact

#### Charts as the Agent's Reasoning Board
The chart is both a report card and a live explanation of *why* the agent is doing what it's doing:

- **Reasoning annotations on the chart** — not just a number, the actual why:
  - "RSI oversold + VWAP reclaim + whale accumulation → 74% confidence LONG"
  - "Resistance rejection + bearish sentiment + exchange inflow → 68% confidence SHORT"
- **Rock-bottom / peak markers** — visually flag bounce and reversal candidates on the chart
- **Confluence zones** — highlight where multiple signals agree (historical support + RSI oversold + VWAP) differently from single-signal zones
- **Confidence timeline** — a sub-panel showing how confidence evolved over time, so you watch the agent "build conviction"
- **Signal breakdown panel** (beside the chart):
  ```
  Technical    ████████░░  78%
  Sentiment    █████░░░░░  52%
  Whale        ███████░░░  71%
  Momentum     ████████░░  80%
  ─────────────────────────────
  Overall         73% LONG
  ```
- **Annotated trade history on chart** — every past entry/exit marked with its outcome, so wins and losses are visible in context
- **Multi-timeframe agreement** — "1h bullish · 4h bullish · 1D neutral" as colored dots showing alignment across timeframes

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│  Dashboard · Charts · Trade History · Agent Brain    │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────┐
│                   Express API Server                 │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│ Market   │ Analysis │ Agent    │ Trading  │ Learning│
│ Data     │ Engine   │ Decision │ Engine   │ System  │
│ Service  │          │ Loop     │          │         │
├──────────┼──────────┼──────────┼──────────┼─────────┤
│ Alpaca   │ TA       │ Scan     │ Alpaca   │ Signal  │
│ CMC      │ Sentiment│ Rank     │ Paper    │ Tracker │
│ Reddit   │ Whale    │ Decide   │ Trading  │ Mistake │
│ News     │ Detector │ Switch   │ API      │ Analyzer│
└──────────┴──────────┴────┬─────┴──────────┴─────────┘
                          │
               ┌──────────▼──────────┐
               │  PostgreSQL+Prisma  │
               └─────────────────────┘
```

---

## Database Schema (Key Tables)

- **trades** — every paper trade with full context
- **signals** — recorded signals with reliability scores
- **signal_outcomes** — links signals to trade results for learning
- **market_snapshots** — chart + signal state at time of decisions
- **confidence_history** — confidence score over time per asset
- **lessons** — auto-generated mistake patterns and learnings
- **whale_alerts** — large transactions and manipulation flags
- **sentiment_snapshots** — periodic sentiment readings per ticker
- **watchlist** — tickers the agent is actively monitoring
- **strategy_weights** — current and historical signal weights
- **market_regimes** — detected regime changes with timestamps
- **agent_decisions** — every scan/rank/decide cycle, for full auditability

---

## API Keys Required (user provides)

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Alpaca | Market data + paper trading | Yes |
| CoinMarketCap | Crypto / meme token data | Yes (limited) |
| Reddit | Social sentiment | Yes (with app registration) |
| Alternative.me | Fear & Greed Index | Yes, no key needed |

---

## Development Phases

### Phase 1 — MVP (current)
- Project scaffolding (Next.js + Express + Prisma)
- Alpaca integration (market data + paper trading)
- Core technical analysis (key indicators)
- Confidence scoring engine (the ranking brain)
- Autonomous decision loop (scan → rank → decide → execute)
- Basic trade execution with risk management
- Trade logging and a dashboard showing the leaderboard + reasoning
- Basic learning loop (signal tracking)

### Phase 2 — Intelligence
- Sentiment analysis (news + Reddit)
- Whale activity detection
- Meme token tracking
- Pump & dump detection
- Advanced chart pattern recognition
- Rock-bottom / peak extreme detection

### Phase 3 — Adaptation
- Full learning system with weight adjustment
- Market regime detection
- Mistake pattern recognition and avoidance (block-on-repeat)
- Auto-switching opportunity cost engine (full version)
- Strategy backtesting engine
- Performance analytics dashboard
- Chart reasoning board (annotations, confluence, confidence timeline)

### Phase 4 — Production
- Real money trading (with safety limits)
- Multi-timeframe analysis
- Portfolio-level risk management
- Alert system (SMS/email/push)
- Mobile-friendly dashboard
