import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runWorkerRuntime } from "../../application/src/index.js";
import {
  APP_HOME,
  closeLogger,
  STARTUP_ERROR_FILE_NAME,
} from "../../state/src/index.js";

function writeStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const path = join(APP_HOME, STARTUP_ERROR_FILE_NAME);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, message, "utf-8");
}

await runWorkerRuntime().catch((error) => {
  // Keep the worker bootstrap thin and deterministic.
  writeStartupError(error);
  process.stderr.write(
    `[relaydesk-worker] fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  closeLogger();
  process.exit(1);
});
