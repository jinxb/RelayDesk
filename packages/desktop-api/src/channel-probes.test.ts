import { beforeEach, describe, expect, it, vi } from "vitest";
import { probeChannelConfig } from "./channel-probes.js";

describe("probeChannelConfig", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects immediately when required keys are missing", async () => {
    await expect(probeChannelConfig("telegram", {})).rejects.toThrow(
      "Telegram requires a bot token.",
    );

    await expect(
      probeChannelConfig("wework", { corpId: "ww-only" }),
    ).rejects.toThrow("WeCom requires both bot ID and secret.");
  });

  it("verifies a telegram token through the getMe handshake", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            result: { username: "relaydesk_bot" },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      probeChannelConfig("telegram", { botToken: "token" }),
    ).resolves.toContain("@relaydesk_bot");
  });

  it("surfaces remote API failures for QQ probes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "bad credentials" }), {
          status: 401,
        }),
      ),
    );

    await expect(
      probeChannelConfig("qq", { appId: "qq-app", secret: "qq-secret" }),
    ).rejects.toThrow("bad credentials");
  });

  it("verifies QQ credentials by checking both token exchange and gateway reachability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "qq-token" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "wss://qq-gateway.example.com" }), {
            status: 200,
          }),
        ),
    );

    await expect(
      probeChannelConfig("qq", { appId: "qq-app", secret: "qq-secret" }),
    ).resolves.toContain("gateway reachability succeeded");
  });

  it("rejects WeChat standard OAuth-only configuration with an explicit error", async () => {
    await expect(
      probeChannelConfig("wechat", { appId: "wx-app", appSecret: "wx-secret" }),
    ).rejects.toThrow("legacy AGP/OAuth fields");
  });

  it("probes WeChat through ilink/getupdates with token and baseUrl", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ret: 0, msgs: [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeChannelConfig("wechat", {
        token: "wx-token",
        baseUrl: "https://ilink.example.com",
      }),
    ).resolves.toContain("ilink/getupdates probe succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
