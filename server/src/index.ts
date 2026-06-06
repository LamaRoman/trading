import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { log } from './logger';
import { api } from './api/routes';
import { authRouter } from './api/auth';
import { startLoop } from './agent/loop';
import { prisma } from './db';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', api);
app.use('/api/auth', authRouter);

// error handler (Express 5: 4-arg signature)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  log.error('API error:', err?.message ?? err);
  res.status(500).json({ error: err?.message ?? 'internal error' });
});

const server = app.listen(config.port, () => {
  log.info(`API listening on http://localhost:${config.port}`);
  log.info(`Data provider: ${config.dataProvider} | cycle: ${config.agentCycleSeconds}s`);

  if (config.agentAutostart) startLoop();
  else log.info('Agent loop NOT auto-started (AGENT_AUTOSTART=false). POST /api/agent/start to begin.');
});

async function shutdown() {
  log.info('shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
