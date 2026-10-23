/**
 * Privacy-preserving logger.
 *
 * Invoices, OCR text, prompts and raw model responses must never reach logs.
 * Call sites log *events* (counts, ids, durations, error codes) — never payloads.
 * This wrapper additionally redacts obvious secrets and truncates strings, so a
 * careless `log.debug({ text })` degrades to a short prefix instead of a leak.
 */
type Level = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = /pass(word)?|token|secret|key|authorization|cookie|invoice|ocr|raw|content|prompt/i;
const MAX_STRING = 120;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[depth]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, 24)}…[${value.length} chars redacted]` : value;
  }
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, event: string, meta?: Record<string, unknown>) {
  const line = { level, event, ...(meta ? { meta: redact(meta) } : {}) };
  // eslint-disable-next-line no-console -- the logger is the one sanctioned console sink
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const log = {
  debug: (event: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") emit("debug", event, meta);
  },
  info: (event: string, meta?: Record<string, unknown>) => emit("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit("error", event, meta),
};
