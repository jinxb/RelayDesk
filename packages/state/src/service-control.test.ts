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

import { getServiceStatus, waitForBackgroundServiceReady } from "./service-control.js";

describe("getServiceStatus", () => {
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    execFileSyncMock.mockReturnValue(Buffer.from("node.exe 123 Console 1 10,000 K"));
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) {
        return true;
      }
      throw new Error("process.kill mock: only sig=0 supported");
    });
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it("reports a live worker without a port file as starting", () => {
    existsSyncMock.mockImplementation((target: string) => target.includes("worker.pid"));
    readFileSyncMock.mockReturnValue("123");

    expect(getServiceStatus()).toEqual({
      running: false,
      pid: 123,
      phase: "starting",
      startupError: null,
    });
  });
});

describe("waitForBackgroundServiceReady", () => {
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    execFileSyncMock.mockReturnValue(Buffer.from("node.exe 123 Console 1 10,000 K"));
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) {
        return true;
      }
      throw new Error("process.kill mock: only sig=0 supported");
    });
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it("returns once the worker pid is running and the port file appears", async () => {
    existsSyncMock.mockImplementation(
      (target: string) => target.includes("worker.pid") || target.includes("relaydesk.port"),
    );
    readFileSyncMock.mockImplementation((target: string) => {
      return target.includes("worker.pid") ? "123" : "39281";
    });

    await expect(waitForBackgroundServiceReady(20, 0)).resolves.toBeUndefined();
  });

  it("fails if the worker never becomes ready", async () => {
    existsSyncMock.mockImplementation((target: string) => target.includes("worker.pid"));
    readFileSyncMock.mockReturnValue("123");

    await expect(waitForBackgroundServiceReady(10, 0)).rejects.toThrow(
      "Background service did not become ready in time.",
    );
  });

  it("surfaces startup error files before the ready port appears", async () => {
    existsSyncMock.mockImplementation(
      (target: string) =>
        target.includes("worker.pid") || target.includes("relaydesk.startup-error"),
    );
    readFileSyncMock.mockImplementation((target: string) => {
      if (target.includes("worker.pid")) return "123";
      return "telegram: startup timeout";
    });

    await expect(waitForBackgroundServiceReady(20, 0)).rejects.toThrow(
      "telegram: startup timeout",
    );
  });

  it("fails if the worker exits before creating the ready port file", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(waitForBackgroundServiceReady(20, 0)).rejects.toThrow(
      "Background service exited before becoming ready.",
    );
  });
});
