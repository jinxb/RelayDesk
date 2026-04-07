import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMeMock, launchMock, stopMock, loggerErrorMock } = vi.hoisted(() => ({
  getMeMock: vi.fn(),
  launchMock: vi.fn(),
  stopMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("telegraf", () => ({
  Telegraf: vi.fn(function Telegraf() {
    return {
      telegram: {
        getMe: getMeMock,
      },
      launch: launchMock,
      stop: stopMock,
    };
  }),
}));

vi.mock("../../../state/src/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
  })),
}));

import { getBotUsername, initTelegram, stopTelegram } from "./client.js";

describe("telegram client startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMeMock.mockResolvedValue({ username: "relaydesk_bot" });
    vi.useRealTimers();
  });

  it("does not block startup indefinitely while polling enters long-running mode", async () => {
    vi.useFakeTimers();
    launchMock.mockReturnValue(
      new Promise<void>(() => {}),
    );

    let settled = false;
    const startup = initTelegram(
      { telegramBotToken: "token" } as never,
      vi.fn(),
    ).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);
    await startup;

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(getBotUsername()).toBe("relaydesk_bot");
  });

  it("surfaces polling launch failures instead of exiting the process", async () => {
    launchMock.mockRejectedValue(new Error("poll failed"));

    await expect(
      initTelegram({ telegramBotToken: "token" } as never, vi.fn()),
    ).rejects.toThrow("poll failed");

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Telegram polling startup failed:",
      expect.any(Error),
    );
  });

  it("fails fast when getMe hangs during startup", async () => {
    vi.useFakeTimers();
    getMeMock.mockReturnValue(new Promise(() => {}));
    launchMock.mockResolvedValue(undefined);

    const startup = expect(
      initTelegram({ telegramBotToken: "token" } as never, vi.fn()),
    ).rejects.toThrow("Telegram getMe timed out after 5000ms");
    await vi.advanceTimersByTimeAsync(5000);
    await startup;
  });

  it("stops the active bot instance", () => {
    launchMock.mockResolvedValue(undefined);

    return initTelegram({ telegramBotToken: "token" } as never, vi.fn()).then(() => {
      stopTelegram();
      expect(stopMock).toHaveBeenCalledWith("SIGTERM");
    });
  });
});
