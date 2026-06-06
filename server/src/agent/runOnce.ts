import { runCycle } from './cycle';
import { prisma } from '../db';

/** Run a single decision cycle from the CLI (npm run agent:cycle). */
runCycle()
  .then((r) => {
    console.log('\n' + JSON.stringify(r, null, 2));
    return prisma.$disconnect();
  })
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
