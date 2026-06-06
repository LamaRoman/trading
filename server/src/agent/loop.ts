import { config } from '../config';
import { log } from '../logger';
import { runCycle } from './cycle';

let timer: NodeJS.Timeout | null = null;
let loopRunning = false;
let busy = false;
let lastCycleAt: Date | null = null;
let lastError: string | null = null;
let currentCycleSeconds: number = config.agentCycleSeconds;

async function tick() {
  if (busy) {
    // Still busy — reschedule without running
    if (loopRunning) scheduleNext(currentCycleSeconds);
    return;
  }
  busy = true;
  try {
    const result = await runCycle();
    lastCycleAt = new Date();
    lastError = null;
    // Use the agent's own recommended next cycle time
    if (result.nextCycleSeconds) {
      currentCycleSeconds = result.nextCycleSeconds;
    }
  } catch (e: any) {
    lastError = e?.message ?? String(e);
    log.error('cycle failed:', lastError);
  } finally {
    busy = false;
    if (loopRunning) scheduleNext(currentCycleSeconds);
  }
}

function scheduleNext(seconds: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, seconds * 1000);
}

export function startLoop() {
  if (loopRunning) return getLoopStatus();
  loopRunning = true;
  currentCycleSeconds = config.agentCycleSeconds;
  log.agent(`starting autonomous loop (dynamic ${config.agentCycleSeconds}s base)`);
  void tick(); // fire immediately
  return getLoopStatus();
}

export function stopLoop() {
  loopRunning = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  log.agent('loop stopped');
  return getLoopStatus();
}

export function getLoopStatus() {
  return {
    running: loopRunning,
    busy,
    cycleSeconds: currentCycleSeconds,
    lastCycleAt,
    lastError,
  };
}
