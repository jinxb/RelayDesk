import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readStoredChannelProbesMock,
  writeStoredChannelProbeMock,
} = vi.hoisted(() => ({
  readStoredChannelProbesMock: vi.fn(),
  writeStoredChannelProbeMock: vi.fn(),
}));

vi.mock("../../state/src/index.js", () => ({
  readStoredChannelProbes: readStoredChannelProbesMock,
  writeStoredChannelProbe: writeStoredChannelProbeMock,
}));

import {
  buildChannelProbeSnapshots,
  fingerprintChannelProbeConfig,
  recordChannelProbeResult,
} from "./channel-probe-results.js";

describe("channel probe results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records probe results with a deterministic config fingerprint", () => {
    const snapshot = recordChannelProbeResult(
      "telegram",
      { botToken: "token-a" },
      true,
      "Telegram handshake succeeded.",
    );

    expect(snapshot.success).toBe(true);
    expect(snapshot.stale).toBe(false);
    expect(writeStoredChannelProbeMock).toHaveBeenCalledWith(
      "telegram",
      expect.objectContaining({
        success: true,
        message: "Telegram handshake succeeded.",
        configFingerprint: fingerprintChannelProbeConfig("telegram", {
          botToken: "token-a",
        }),
      }),
    );
  });

  it("marks stored snapshots as stale when the saved config changed", () => {
    readStoredChannelProbesMock.mockReturnValue({
      telegram: {
        success: true,
        message: "Telegram handshake succeeded.",
        testedAt: "2026-03-27T12:00:00.000Z",
        configFingerprint: fingerprintChannelProbeConfig("telegram", {
          botToken: "token-a",
        }),
      },
    });

    const fresh = buildChannelProbeSnapshots({
      platforms: {
        telegram: {
          botToken: "token-a",
        },
      },
    });
    const stale = buildChannelProbeSnapshots({
      platforms: {
        telegram: {
          botToken: "token-b",
        },
      },
    });

    expect(fresh.telegram?.stale).toBe(false);
    expect(stale.telegram?.stale).toBe(true);
  });
});
