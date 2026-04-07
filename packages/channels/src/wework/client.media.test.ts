import { beforeEach, describe, expect, it } from "vitest";

let resolvePendingResponse:
  | ((reqId: string, response: { errcode: number; errmsg: string; headers: { req_id: string }; body?: unknown }) => void)
  | null = null;

class MockSocket {
  readyState = 1;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  sentFrames: Array<Record<string, unknown>> = [];

  on(event: string, listener: (...args: unknown[]) => void) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  send(payload: string) {
    const frame = JSON.parse(payload) as Record<string, unknown>;
    this.sentFrames.push(frame);
    const headers = (frame.headers ?? {}) as { req_id?: string };
    const reqId = String(headers.req_id ?? "");
    const cmd = String(frame.cmd ?? "");

    if (cmd === "aibot_upload_media_init") {
      resolvePendingResponse?.(reqId, {
        headers: { req_id: reqId },
        errcode: 0,
        errmsg: "ok",
        body: { upload_id: "upload-1" },
      });
      return;
    }

    if (cmd === "aibot_upload_media_finish") {
      resolvePendingResponse?.(reqId, {
        headers: { req_id: reqId },
        errcode: 0,
        errmsg: "ok",
        body: { media_id: "media-file-1", created_at: 123 },
      });
      return;
    }

    resolvePendingResponse?.(reqId, {
      headers: { req_id: reqId },
      errcode: 0,
      errmsg: "ok",
    });
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

describe("WeWork media upload", () => {
  beforeEach(async () => {
    const runtime = await import("./runtime.js");
    const socket = new MockSocket();
    runtime.weWorkRuntime.ws = socket as never;
    runtime.weWorkRuntime.connectionState = "connected";
    runtime.weWorkRuntime.pendingResponses.clear();
    resolvePendingResponse = (reqId, response) => {
      const pending = runtime.consumePendingResponse(reqId);
      pending?.resolve(response as never);
    };
  });

  it("uploads a local file and resolves media_id from ws responses", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-upload-"));
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello file");

    try {
      const { uploadWeWorkMedia } = await import("./client.js");
      const result = await uploadWeWorkMedia(filePath, "file", "report.txt");

      expect(result).toEqual({
        mediaId: "media-file-1",
        createdAt: 123,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleans up pending responses when ws.send throws synchronously", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const runtime = await import("./runtime.js");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-upload-fail-"));
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello file");
    runtime.weWorkRuntime.ws = {
      send() {
        throw new Error("send failed");
      },
    } as never;

    try {
      const { uploadWeWorkMedia } = await import("./client.js");
      await expect(uploadWeWorkMedia(filePath, "file", "report.txt")).rejects.toThrow("send failed");
      expect(runtime.weWorkRuntime.pendingResponses.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
