import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  execFileSyncMock,
  existsSyncMock,
  readFileSyncMock,
  unlinkSyncMock,
  writeFileSyncMock,
  spawnMock,
} = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  unlinkSync: unlinkSyncMock,
  writeFileSync: writeFileSyncMock,
}));

import { startBackgroundService } from "./service-control.js";

describe("startBackgroundService", () => {
  const originalEntry = process.env.RELAYDESK_SERVICE_ENTRY;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    execFileSyncMock.mockReturnValue(Buffer.from("node.exe 321 Console 1 10,000 K"));
    spawnMock.mockReturnValue({
      pid: 321,
      unref: vi.fn(),
    });
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) {
        return true;
      }
      throw new Error("process.kill mock: only sig=0 supported");
    });
  });

  afterEach(() => {
    killSpy.mockRestore();
    if (originalEntry === undefined) {
      delete process.env.RELAYDESK_SERVICE_ENTRY;
      return;
    }
    process.env.RELAYDESK_SERVICE_ENTRY = originalEntry;
  });

  it("honors a custom JavaScript service entry override", () => {
    process.env.RELAYDESK_SERVICE_ENTRY = "/tmp/relaydesk-worker.js";

    const result = startBackgroundService("/tmp/work-tree");

    expect(result.pid).toBe(321);
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ["/tmp/relaydesk-worker.js"],
      expect.objectContaining({
        cwd: "/tmp/work-tree",
        env: process.env,
      }),
    );
  });

  it("wraps a TypeScript service entry override with tsx", () => {
    process.env.RELAYDESK_SERVICE_ENTRY = "/tmp/relaydesk-worker.ts";

    startBackgroundService("/tmp/work-tree");

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        "--import",
        expect.stringMatching(/tsx[\\/]dist[\\/]loader\.mjs$/),
        "/tmp/relaydesk-worker.ts",
      ],
      expect.any(Object),
    );
  });

  it("does not spawn a second process while the worker is still starting", () => {
    existsSyncMock.mockImplementation((target: string) => target.includes("worker.pid"));
    readFileSyncMock.mockReturnValue("321");

    const result = startBackgroundService("/tmp/work-tree");

    expect(result).toEqual({ pid: 321 });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
