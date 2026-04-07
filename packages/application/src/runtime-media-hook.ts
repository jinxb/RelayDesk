import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type {
  CurrentTaskMediaHook,
  CurrentTaskMediaTarget,
} from "../../interaction/src/index.js";
import {
  deliverMediaToCurrentTaskTarget,
  type CurrentTaskMediaRequest,
} from "./runtime-media-delivery.js";

export interface RuntimeMediaHookServer extends CurrentTaskMediaHook {
  readonly port: number;
  close(): Promise<void>;
}

function bearerToken(request: IncomingMessage) {
  const value = request.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : "";
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function requestPayload(body: Record<string, unknown>): CurrentTaskMediaRequest {
  if (body.kind !== "image" && body.kind !== "file") {
    throw new Error("kind 仅支持 image 或 file。");
  }
  return {
    kind: body.kind,
    filePath: String(body.filePath ?? "").trim(),
  };
}

export async function startRuntimeMediaHookServer(): Promise<RuntimeMediaHookServer> {
  const tokens = new Map<string, CurrentTaskMediaTarget>();
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/media/send-current") {
      writeJson(response, 404, { error: "Route not found." });
      return;
    }
    const target = tokens.get(bearerToken(request));
    if (!target) {
      writeJson(response, 401, { error: "Unauthorized media hook token." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const result = await deliverMediaToCurrentTaskTarget(target, requestPayload(body));
      writeJson(response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 400, { error: message });
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Runtime media hook failed to bind a local port."));
        return;
      }
      resolve(address.port);
    });
    server.on("error", reject);
  });

  return {
    port,
    registerCurrentTaskMediaTarget(target) {
      const token = randomBytes(18).toString("hex");
      tokens.set(token, target);
      return {
        endpoint: `http://127.0.0.1:${port}/v1/media/send-current`,
        token,
        port,
        revoke() {
          tokens.delete(token);
        },
      };
    },
    close() {
      tokens.clear();
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
