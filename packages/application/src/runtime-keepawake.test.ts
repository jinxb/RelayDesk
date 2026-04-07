import { describe, expect, it, vi } from "vitest";
import { engageRuntimeKeepAwake } from "./runtime-keepawake.js";

describe("engageRuntimeKeepAwake", () => {
  it("returns an inactive lease when keep-awake is disabled", () => {
    const lease = engageRuntimeKeepAwake({ enabled: false });

    expect(lease.active).toBe(false);
  });

  it("rejects unsupported platforms explicitly", () => {
    expect(() =>
      engageRuntimeKeepAwake({
        enabled: true,
        platform: "linux",
      }),
    ).toThrow("常驻模式目前仅支持 macOS");
  });

  it("spawns caffeinate tied to the worker pid on macOS", () => {
    const unref = vi.fn();
    const kill = vi.fn();
    const spawnProcess = vi.fn(() => ({
      pid: 7788,
      killed: false,
      exitCode: null,
      kill,
      unref,
    }));

    const lease = engageRuntimeKeepAwake({
      enabled: true,
      platform: "darwin",
      pid: 5566,
      assertExecutable: vi.fn(),
      spawnProcess: spawnProcess as never,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "/usr/bin/caffeinate",
      ["-i", "-w", "5566"],
      { stdio: "ignore" },
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(lease.active).toBe(true);

    lease.release();
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });
});
