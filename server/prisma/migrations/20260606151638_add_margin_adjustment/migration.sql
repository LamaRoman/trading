-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CRYPTO', 'STOCK');

-- CreateEnum
CREATE TYPE "UserTradingMode" AS ENUM ('SPOT', 'LEVERAGE_ONLY');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT', 'FLAT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL DEFAULT '',
    "tradingMode" "UserTradingMode" NOT NULL DEFAULT 'SPOT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL DEFAULT 'CRYPTO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT '1m',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetScore" (
    "id" SERIAL NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "direction" "Direction" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "technical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "momentum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "direction" "Direction" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "qty" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryConfidence" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "entryReasons" JSONB NOT NULL,
    "entrySignals" JSONB,
    "regime" TEXT,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "exchange" TEXT NOT NULL DEFAULT 'paper',
    "exchangeOrderId" TEXT,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "addedMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitPrice" DOUBLE PRECISION,
    "exitTime" TIMESTAMP(3),
    "exitReason" TEXT,
    "pnl" DOUBLE PRECISION,
    "pnlPct" DOUBLE PRECISION,
    "mistakeTags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cash" DOUBLE PRECISION NOT NULL,
    "openPositionsValue" DOUBLE PRECISION NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openTrades" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalOutcome" (
    "id" SERIAL NOT NULL,
    "signalId" INTEGER NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL,
    "pnlPct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyWeight" (
    "id" SERIAL NOT NULL,
    "technical" DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "whale" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "momentum" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "startingCapital" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 3,
    "riskPerTradePct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "maxDailyDrawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "maxSwitchesPerDay" INTEGER NOT NULL DEFAULT 6,
    "cooldownBars" INTEGER NOT NULL DEFAULT 5,
    "switchEdgeMargin" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "takeProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "stopLossPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "maxLeverage" INTEGER NOT NULL DEFAULT 5,
    "minHoldBars" INTEGER NOT NULL DEFAULT 6,
    "allowLeverage" BOOLEAN NOT NULL DEFAULT true,
    "minCycleSeconds" INTEGER NOT NULL DEFAULT 15,
    "maxCycleSeconds" INTEGER NOT NULL DEFAULT 120,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "Asset"("symbol");

-- CreateIndex
CREATE INDEX "Asset_active_idx" ON "Asset"("active");

-- CreateIndex
CREATE INDEX "Candle_assetId_timeframe_timestamp_idx" ON "Candle"("assetId", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_assetId_timeframe_timestamp_key" ON "Candle"("assetId", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "AgentDecision_createdAt_idx" ON "AgentDecision"("createdAt");

-- CreateIndex
CREATE INDEX "AssetScore_assetId_createdAt_idx" ON "AssetScore"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetScore_decisionId_idx" ON "AssetScore"("decisionId");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_assetId_status_idx" ON "Trade"("assetId", "status");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_createdAt_idx" ON "PortfolioSnapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_name_key" ON "Signal"("name");

-- CreateIndex
CREATE INDEX "SignalOutcome_signalId_idx" ON "SignalOutcome"("signalId");

-- CreateIndex
CREATE INDEX "SignalOutcome_tradeId_idx" ON "SignalOutcome"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_category_key" ON "Lesson"("category");

-- CreateIndex
CREATE INDEX "StrategyWeight_createdAt_idx" ON "StrategyWeight"("createdAt");

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScore" ADD CONSTRAINT "AssetScore_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AgentDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScore" ADD CONSTRAINT "AssetScore_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOutcome" ADD CONSTRAINT "SignalOutcome_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
