import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.RELAYDESK_HOME ??= join(homedir(), ".relaydesk");
process.env.RELAYDESK_STATE_PREFIX ??= "relaydesk";
process.env.RELAYDESK_SHUTDOWN_PORT ??= "44981";
process.env.RELAYDESK_WEB_PORT ??= "44982";
process.env.RELAYDESK_API_PORT ??= "44919";
process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS ??= "1";
if (!process.env.RELAYDESK_SERVICE_ENTRY) {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  process.env.RELAYDESK_SERVICE_ENTRY =
    extname(currentFile) === ".ts"
      ? resolve(currentDir, "../../runtime/src/bootstrap.ts")
      : basename(currentFile) === "desktop-api.mjs"
        ? resolve(
            currentDir,
            basename(currentDir) === "dist"
              ? "../../runtime/dist/runtime.mjs"
              : "../runtime/runtime.mjs",
          )
        : resolve(
            currentDir,
            "../../runtime/dist/runtime.mjs",
          );
}

if (process.env.RELAYDESK_DESKTOP_API_TRANSPORT === "stdio") {
  await import("./rpc.js");
} else {
  await import("./server.js");
}
