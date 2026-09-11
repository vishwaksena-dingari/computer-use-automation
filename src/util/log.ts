/**
 * @file Dev/debug logger — stderr only so CLI JSON stdout stays parseable.
 *
 * Levels: error < warn < info < debug. Configure via `CUA_LOG` or `configureLog({ verbose: true })`.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

let current: LogLevel = parseLevel(process.env.CUA_LOG) ?? 'info';

function parseLevel(raw: string | undefined): LogLevel | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  if (v === 'verbose' || v === 'true' || v === '1') return 'debug';
  return undefined;
}

/**
 * Set log level from CLI (`--verbose`) and/or env (`CUA_LOG`). Verbose wins to debug.
 */
export function configureLog(opts: { verbose?: boolean; level?: string } = {}): void {
  if (opts.verbose) {
    current = 'debug';
    return;
  }
  current = parseLevel(opts.level) ?? parseLevel(process.env.CUA_LOG) ?? 'info';
}

export function getLogLevel(): LogLevel {
  return current;
}

/**
 * Emit a log line to stderr when level is enabled. Never print secrets.
 */
export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (ORDER[level] > ORDER[current]) return;
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  const line = `[cua:${level}] ${message}${suffix}`;
  if (level === 'error') console.error(line);
  else console.error(line);
}
