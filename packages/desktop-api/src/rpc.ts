import { createInterface } from "node:readline";
import type { DesktopApiRequest } from "./commands.js";
import { executeDesktopApiRequest } from "./commands.js";

interface RpcResponse {
  readonly ok: boolean;
  readonly payload?: unknown;
  readonly error?: string;
}

const protocolWrite = process.stdout.write.bind(process.stdout);

process.stdout.write = ((chunk, encoding, callback) => {
  return process.stderr.write(chunk, encoding as never, callback);
}) as typeof process.stdout.write;

function writeProtocol(response: RpcResponse) {
  protocolWrite(`${JSON.stringify(response)}\n`);
}

function parseRequest(line: string): DesktopApiRequest {
  return JSON.parse(line) as DesktopApiRequest;
}

async function handleLine(line: string) {
  try {
    const request = parseRequest(line);
    const payload = await executeDesktopApiRequest(request);
    writeProtocol({ ok: true, payload });
  } catch (error) {
    writeProtocol({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const stdin = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of stdin) {
  if (!line.trim()) {
    continue;
  }
  await handleLine(line);
}
