/**
 * Minimal console-based logger for the workflow examples.
 *
 * Console is intentional here: these are ad-hoc scripts run via `npx tsx`, so a
 * full logging package (pino/winston) would add weight without real benefit.
 * Levels are filtered via the LOG_LEVEL env var (default: "info").
 *
 * If a script ever needs structured logs, transports, or redaction, swap the
 * internals of this module without touching call sites.
 */

const LEVELS = ["debug", "info", "warning", "error"] as const;
type Level = (typeof LEVELS)[number];

const configuredLevel = (process.env.LOG_LEVEL as Level) ?? "info";
const threshold = LEVELS.indexOf(configuredLevel);

const timestamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function emit(level: Level, message: string) {
  if (LEVELS.indexOf(level) < threshold) return;
  console.log(`${timestamp()} - ${level.toUpperCase()} - ${message}`);
}

export const log = {
  debug: (message: string) => emit("debug", message),
  info: (message: string) => emit("info", message),
  warning: (message: string) => emit("warning", message),
  error: (message: string) => emit("error", message)
};
