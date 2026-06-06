const ts = () => new Date().toISOString().slice(11, 19);

/** Tiny colorized logger. */
export const log = {
  info: (...a: unknown[]) => console.log(`\x1b[36m[${ts()}]\x1b[0m`, ...a),
  warn: (...a: unknown[]) => console.warn(`\x1b[33m[${ts()}] WARN\x1b[0m`, ...a),
  error: (...a: unknown[]) => console.error(`\x1b[31m[${ts()}] ERR\x1b[0m`, ...a),
  agent: (...a: unknown[]) => console.log(`\x1b[35m[${ts()}] 🤖\x1b[0m`, ...a),
  trade: (...a: unknown[]) => console.log(`\x1b[32m[${ts()}] 💰\x1b[0m`, ...a),
};
