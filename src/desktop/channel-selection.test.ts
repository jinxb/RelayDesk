import { describe, expect, it } from "vitest";
import { resolveSelectedChannel } from "./channel-selection";

describe("resolveSelectedChannel", () => {
  it("keeps the active channel while a config dialog is open", () => {
    expect(
      resolveSelectedChannel({
        current: "qq",
        dialogOpen: true,
        enabledByChannel: {
          telegram: true,
        },
        configuredByChannel: {
          telegram: true,
        },
      }),
    ).toBe("qq");
  });

  it("falls back to the first enabled or configured channel when no dialog is open", () => {
    expect(
      resolveSelectedChannel({
        current: "qq",
        dialogOpen: false,
        enabledByChannel: {
          telegram: true,
        },
        configuredByChannel: {
          telegram: true,
        },
      }),
    ).toBe("telegram");
  });

  it("keeps the current channel when it is already enabled", () => {
    expect(
      resolveSelectedChannel({
        current: "qq",
        dialogOpen: false,
        enabledByChannel: {
          qq: true,
          telegram: true,
        },
        configuredByChannel: {
          telegram: true,
        },
      }),
    ).toBe("qq");
  });
});
