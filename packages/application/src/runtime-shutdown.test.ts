import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerErrorMock = vi.fn();
const closeLoggerMock = vi.fn();
const processExitMock = vi
  .spyOn(process, "exit")
  .mockImplementation(((code?: string | number | null) => {
    throw new Error(`process.exit:${code ?? ""}`);
  }) as never);

vi.mock("../../state/src/index.js", () => ({
  closeLogger: closeLoggerMock,
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
  })),
}));

describe("runtime shutdown failure handling", () => {
  beforeEach(() => {
    loggerErrorMock.mockReset();
    closeLoggerMock.mockReset();
    processExitMock.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("logs shutdown failure, closes the logger, and exits", async () => {
    const shutdown = await import("./runtime-shutdown.js");

    expect(() =>
      shutdown.handleRuntimeShutdownFailure("http", new Error("boom")),
    ).toThrow("process.exit:1");

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "RelayDesk runtime shutdown failed (http):",
      expect.any(Error),
    );
    expect(closeLoggerMock).toHaveBeenCalledTimes(1);
    expect(processExitMock).toHaveBeenCalledWith(1);
  });

  it("keeps the original source label for signal-triggered failures", async () => {
    const shutdown = await import("./runtime-shutdown.js");

    expect(() =>
      shutdown.handleRuntimeShutdownFailure("signal", "stop failed"),
    ).toThrow("process.exit:1");

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "RelayDesk runtime shutdown failed (signal):",
      "stop failed",
    );
  });
});
