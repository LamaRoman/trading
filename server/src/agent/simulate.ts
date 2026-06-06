import { runCycle } from './cycle';
import { prisma } from '../db';

/** Dev tool: run N decision cycles, then print a performance summary. */
async function main() {
  const n = Number(process.argv[2] ?? 100);
  for (let i = 0; i < n; i++) await runCycle();

  const trades = await prisma.trade.findMany({ include: { asset: true }, orderBy: { id: 'asc' } });
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const open = trades.filter((t) => t.status === 'OPEN');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const realized = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + (t.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + (t.pnl ?? 0), 0) / losses.length : 0;

  const snap = await prisma.portfolioSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  const lessons = await prisma.lesson.findMany({ orderBy: { severity: 'desc' } });
  const weights = await prisma.strategyWeight.findFirst({ orderBy: { createdAt: 'desc' } });
  const signals = await prisma.signal.findMany({
    where: { OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }] },
    orderBy: { reliability: 'desc' },
  });

  console.log('\n================ SIMULATION SUMMARY ================');
  console.log(`cycles run        : ${n}`);
  console.log(`trades            : ${trades.length}  (closed ${closed.length}, open ${open.length})`);
  console.log(
    `win rate          : ${closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : '-'}%  (${wins.length}W / ${losses.length}L)`,
  );
  console.log(`realized P&L      : $${realized.toFixed(2)}`);
  console.log(`avg win / loss    : $${avgWin.toFixed(2)} / $${avgLoss.toFixed(2)}`);
  console.log(`profit factor     : ${avgLoss !== 0 && losses.length ? ((avgWin * wins.length) / Math.abs(avgLoss * losses.length)).toFixed(2) : '-'}`);
  console.log(`final equity      : $${snap?.equity.toFixed(2) ?? '?'}  (start $${(await prisma.agentConfig.findUnique({ where: { id: 1 } }))?.startingCapital})`);

  if (weights) {
    console.log(
      `\nweights (adapted) : tech ${(weights.technical * 100).toFixed(0)} / sent ${(weights.sentiment * 100).toFixed(0)} / whale ${(weights.whale * 100).toFixed(0)} / mom ${(weights.momentum * 100).toFixed(0)}`,
    );
  }

  console.log('\nsignal reliability:');
  for (const s of signals.slice(0, 12)) {
    console.log(`  ${s.name.padEnd(20)} ${s.reliability.toFixed(0).padStart(3)}%  (${s.wins}W/${s.losses}L)`);
  }

  console.log('\nlessons learned:');
  if (!lessons.length) console.log('  (none yet)');
  for (const l of lessons) {
    console.log(
      `  [${l.severity.toFixed(0).padStart(3)}] ${l.category.padEnd(22)} x${l.occurrences}  $${l.totalPnl.toFixed(0)}  ${l.active ? '🛡️ guarding' : ''}`,
    );
  }
  console.log('====================================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
