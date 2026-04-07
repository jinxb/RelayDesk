import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { DesktopApiRequest } from "./commands.js";
import { executeDesktopApiRequest } from "./commands.js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.RELAYDESK_API_PORT ?? "44919", 10);

function json(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body));
}

function readBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function toDesktopApiRequest(request: IncomingMessage): Promise<DesktopApiRequest> {
  const target = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (request.method === "GET" || request.method === "OPTIONS") {
    return {
      method: request.method,
      path: target.pathname,
    };
  }

  return {
    method: request.method ?? "GET",
    path: target.pathname,
    body: await readBody<unknown>(request),
  };
}

async function route(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    json(response, 200, { ok: true });
    return;
  }

  try {
    const payload = await executeDesktopApiRequest(await toDesktopApiRequest(request));
    json(response, 200, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message === "Route not found." ? 404 : 400;
    json(response, statusCode, { error: message });
  }
}

createServer((request, response) => {
  route(request, response).catch((error) => {
    json(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}).listen(port, host, () => {
  process.stdout.write(
    `[relaydesk-sidecar] listening on http://${host}:${port}\n`,
  );
});
