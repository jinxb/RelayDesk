import { describe, expect, it } from "vitest";
import {
  buildChannelState,
  buildProbeSummary,
} from "./channel-probe-state";

describe("channel probe state", () => {
  it("shows verified when a fresh probe succeeded", () => {
    expect(
      buildChannelState({
        enabled: true,
        configured: true,
        healthMessage: undefined,
        probe: {
          success: true,
          message: "Telegram handshake succeeded.",
          testedAt: "2026-03-27T12:00:00.000Z",
          stale: false,
        },
      }),
    ).toMatchObject({
      label: "已验证",
      tone: "green",
    });
  });

  it("asks for recheck when the saved config changed after the last probe", () => {
    expect(
      buildChannelState({
        enabled: true,
        configured: true,
        healthMessage: undefined,
        probe: {
          success: true,
          message: "Telegram handshake succeeded.",
          testedAt: "2026-03-27T12:00:00.000Z",
          stale: true,
        },
      }),
    ).toMatchObject({
      label: "需复核",
      tone: "amber",
    });
  });

  it("treats successful WeChat probes as verified once the runtime is runnable", () => {
    expect(
      buildChannelState({
        enabled: true,
        configured: true,
        healthMessage: undefined,
        probe: {
          success: true,
          message: "WeChat ilink/getupdates probe succeeded.",
          testedAt: "2026-03-28T12:00:00.000Z",
          stale: false,
        },
      }),
    ).toMatchObject({
      label: "已验证",
      tone: "green",
    });
  });

  it("still surfaces failed WeChat probes as repair-needed", () => {
    expect(
      buildChannelState({
        enabled: true,
        configured: true,
        healthMessage: undefined,
        probe: {
          success: false,
          message: "401 unauthorized",
          testedAt: "2026-03-28T12:00:00.000Z",
          stale: false,
        },
      }),
    ).toMatchObject({
      label: "需修复",
      tone: "red",
    });
  });

  it("keeps failed probe snapshots visible after reload", () => {
    expect(
      buildProbeSummary({
        success: false,
        message: "bad credentials",
        testedAt: "2026-03-27T12:00:00.000Z",
        stale: false,
      }),
    ).toBe("bad credentials");
  });
});
