import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServiceStatusMock,
  startBackgroundServiceMock,
  stopBackgroundServiceMock,
} = vi.hoisted(() => ({
  getServiceStatusMock: vi.fn(),
  startBackgroundServiceMock: vi.fn(),
  stopBackgroundServiceMock: vi.fn(),
}));

vi.mock("../../state/src/index.js", () => ({
  getServiceStatus: getServiceStatusMock,
  startBackgroundService: startBackgroundServiceMock,
  stopBackgroundService: stopBackgroundServiceMock,
}));

import { haltRuntime, launchRuntime, readRuntimeStatus } from "./runtime-control.js";

describe("runtime-control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current background service status", () => {
    getServiceStatusMock.mockReturnValue({
      running: true,
      pid: 321,
      phase: "running",
      startupError: null,
    });

    expect(readRuntimeStatus()).toEqual({
      running: true,
      pid: 321,
      phase: "running",
      startupError: null,
    });
    expect(getServiceStatusMock).toHaveBeenCalledTimes(1);
  });

  it("returns the immediate runtime snapshot after launch is requested", async () => {
    startBackgroundServiceMock.mockReturnValue({ pid: 4321 });
    getServiceStatusMock.mockReturnValue({
      running: false,
      pid: 4321,
      phase: "starting",
      startupError: null,
    });

    await expect(launchRuntime("/tmp/relaydesk")).resolves.toEqual({
      running: false,
      pid: 4321,
      phase: "starting",
      startupError: null,
    });
    expect(startBackgroundServiceMock).toHaveBeenCalledWith("/tmp/relaydesk");
    expect(getServiceStatusMock).toHaveBeenCalledTimes(1);
  });

  it("preserves startup errors already surfaced by the runtime snapshot", async () => {
    startBackgroundServiceMock.mockReturnValue({ pid: 4321 });
    getServiceStatusMock.mockReturnValue({
      running: false,
      pid: null,
      phase: "stopped",
      startupError: "telegram: startup timeout",
    });

    await expect(launchRuntime("/tmp/relaydesk")).resolves.toEqual({
      running: false,
      pid: null,
      phase: "stopped",
      startupError: "telegram: startup timeout",
    });
  });

  it("delegates runtime stop to the background service control", async () => {
    stopBackgroundServiceMock.mockResolvedValue({ pid: 4321, stopped: true });

    await expect(haltRuntime()).resolves.toEqual({ pid: 4321, stopped: true });
    expect(stopBackgroundServiceMock).toHaveBeenCalledTimes(1);
  });
});
