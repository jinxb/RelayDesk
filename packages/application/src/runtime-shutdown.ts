import { closeLogger, createLogger } from "../../state/src/index.js";

const log = createLogger("RelayWorker");

export function handleRuntimeShutdownFailure(
  source: "http" | "signal",
  error: unknown,
): never {
  log.error(`RelayDesk runtime shutdown failed (${source}):`, error);
  closeLogger();
  process.exit(1);
}
