import { prisma } from '../src/db';

/** Initial crypto watchlist the agent will scan and pick from. */
const WATCHLIST = [
  { symbol: 'BTC/USD', name: 'Bitcoin' },
  { symbol: 'ETH/USD', name: 'Ethereum' },
  { symbol: 'SOL/USD', name: 'Solana' },
  { symbol: 'AVAX/USD', name: 'Avalanche' },
  { symbol: 'LINK/USD', name: 'Chainlink' },
  { symbol: 'XRP/USD', name: 'XRP' },
  { symbol: 'ADA/USD', name: 'Cardano' },
  { symbol: 'DOGE/USD', name: 'Dogecoin' },
];

/** Named signals the learning system tracks reliability for. */
const SIGNALS: Array<[string, string]> = [
  ['rsi_oversold', 'technical'],
  ['rsi_overbought', 'technical'],
  ['ema_stack_bull', 'technical'],
  ['ema_stack_bear', 'technical'],
  ['macd_bull', 'technical'],
  ['macd_bear', 'technical'],
  ['bollinger_lower', 'technical'],
  ['bollinger_upper', 'technical'],
  ['rock_bottom', 'technical'],
  ['peak', 'technical'],
  ['momentum_up', 'momentum'],
  ['momentum_down', 'momentum'],
  ['volume_breakout', 'momentum'],
  ['whale_accumulation', 'whale'],
  ['whale_distribution', 'whale'],
  ['pump_dump', 'whale'],
  ['stop_hunt_low', 'whale'],
  ['stop_hunt_high', 'whale'],
  ['sentiment_bull', 'sentiment'],
  ['sentiment_bear', 'sentiment'],
];

async function main() {
  for (const a of WATCHLIST) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, active: true },
      create: { symbol: a.symbol, name: a.name, type: 'CRYPTO', active: true },
    });
  }

  await prisma.agentConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // initial strategy weights (only if none exist)
  const w = await prisma.strategyWeight.count();
  if (w === 0) {
    await prisma.strategyWeight.create({
      data: { reason: 'initial defaults' },
    });
  }

  for (const [name, category] of SIGNALS) {
    await prisma.signal.upsert({
      where: { name },
      update: { category },
      create: { name, category },
    });
  }

  const assets = await prisma.asset.count();
  const signals = await prisma.signal.count();
  console.log(`Seed complete: ${assets} assets, ${signals} signals, config + weights ready.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
