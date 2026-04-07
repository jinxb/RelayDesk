import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildBootstrapPayloadMock,
  buildDiagnosticsMock,
  haltRuntimeMock,
  launchRuntimeMock,
  loadConfigMock,
  loadFileConfigMock,
  normalizeWorkspaceConfigMock,
  probeChannelConfigMock,
  recordChannelProbeResultMock,
  readJournalExcerptMock,
  readRuntimeStatusMock,
  readSessionsSnapshotMock,
  resolveRuntimeWorkTreeMock,
  sanitizeClaudeEnvMock,
  saveFileConfigMock,
  validateWorkspaceMock,
} = vi.hoisted(() => ({
  buildBootstrapPayloadMock: vi.fn(),
  buildDiagnosticsMock: vi.fn(),
  haltRuntimeMock: vi.fn(),
  launchRuntimeMock: vi.fn(),
  loadConfigMock: vi.fn(),
  loadFileConfigMock: vi.fn(),
  normalizeWorkspaceConfigMock: vi.fn(),
  probeChannelConfigMock: vi.fn(),
  recordChannelProbeResultMock: vi.fn(),
  readJournalExcerptMock: vi.fn(),
  readRuntimeStatusMock: vi.fn(),
  readSessionsSnapshotMock: vi.fn(),
  resolveRuntimeWorkTreeMock: vi.fn(),
  sanitizeClaudeEnvMock: vi.fn(),
  saveFileConfigMock: vi.fn(),
  validateWorkspaceMock: vi.fn(),
}));

vi.mock("../../state/src/index.js", () => ({
  loadConfig: loadConfigMock,
  loadFileConfig: loadFileConfigMock,
  saveFileConfig: saveFileConfigMock,
}));

vi.mock("../../application/src/workspace.js", () => ({
  knownChannels: ["telegram", "feishu", "qq", "wechat", "wework", "dingtalk"],
  normalizeWorkspaceConfig: normalizeWorkspaceConfigMock,
  resolveRuntimeWorkTree: resolveRuntimeWorkTreeMock,
  sanitizeClaudeEnv: sanitizeClaudeEnvMock,
  validateWorkspace: validateWorkspaceMock,
}));

vi.mock("../../application/src/telemetry.js", () => ({
  buildBootstrapPayload: buildBootstrapPayloadMock,
  buildDiagnostics: buildDiagnosticsMock,
  readJournalExcerpt: readJournalExcerptMock,
  readSessionsSnapshot: readSessionsSnapshotMock,
}));

vi.mock("../../application/src/channel-probe-results.js", () => ({
  recordChannelProbeResult: recordChannelProbeResultMock,
}));

vi.mock("../../application/src/runtime-control.js", () => ({
  haltRuntime: haltRuntimeMock,
  launchRuntime: launchRuntimeMock,
  readRuntimeStatus: readRuntimeStatusMock,
}));

vi.mock("./channel-probes.js", () => ({
  probeChannelConfig: probeChannelConfigMock,
}));

import { executeDesktopApiRequest } from "./commands.js";

describe("executeDesktopApiRequest runtime start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFileConfigMock.mockReturnValue({ platforms: { telegram: { enabled: true } } });
    normalizeWorkspaceConfigMock.mockImplementation((input: unknown) => input);
    sanitizeClaudeEnvMock.mockReturnValue({});
    buildDiagnosticsMock.mockReturnValue({ logDir: "/tmp/relaydesk-logs" });
    validateWorkspaceMock.mockReturnValue({
      ok: true,
      issues: [],
      requiredChannels: ["telegram"],
      requiredAgents: ["codex"],
    });
    recordChannelProbeResultMock.mockImplementation(
      (_channel: string, _config: Record<string, unknown>, success: boolean, message: string) => ({
        success,
        message,
        testedAt: "2026-03-27T12:00:00.000Z",
        stale: false,
      }),
    );
    resolveRuntimeWorkTreeMock.mockReturnValue("/tmp/work-tree");
    loadConfigMock.mockReturnValue({});
  });

  it("returns the current runtime snapshot immediately after launch is requested", async () => {
    launchRuntimeMock.mockResolvedValue({
      running: false,
      pid: 4321,
      phase: "starting",
      startupError: null,
    });

    await expect(
      executeDesktopApiRequest({
        method: "POST",
        path: "/v1/runtime/start",
      }),
    ).resolves.toEqual({
      started: true,
      pid: 4321,
      phase: "starting",
      running: false,
      startupError: null,
      logDir: "/tmp/relaydesk-logs",
    });

    expect(launchRuntimeMock).toHaveBeenCalledWith("/tmp/work-tree");
  });

  it("returns startup failure snapshots without blocking the request", async () => {
    launchRuntimeMock.mockResolvedValue({
      running: false,
      pid: null,
      phase: "stopped",
      startupError: "Background service exited before becoming ready.",
    });

    await expect(
      executeDesktopApiRequest({
        method: "POST",
        path: "/v1/runtime/start",
      }),
    ).resolves.toEqual({
      started: true,
      pid: null,
      phase: "stopped",
      running: false,
      startupError: "Background service exited before becoming ready.",
      logDir: "/tmp/relaydesk-logs",
    });
  });

  it("persists successful channel probe snapshots", async () => {
    probeChannelConfigMock.mockResolvedValue("Telegram handshake succeeded.");

    await expect(
      executeDesktopApiRequest({
        method: "POST",
        path: "/v1/channels/check",
        body: {
          channel: "telegram",
          config: { botToken: "token-a" },
        },
      }),
    ).resolves.toEqual({
      success: true,
      message: "Telegram handshake succeeded.",
      probe: {
        success: true,
        message: "Telegram handshake succeeded.",
        testedAt: "2026-03-27T12:00:00.000Z",
        stale: false,
      },
    });

    expect(recordChannelProbeResultMock).toHaveBeenCalledWith(
      "telegram",
      { botToken: "token-a" },
      true,
      "Telegram handshake succeeded.",
    );
  });

  it("persists failed channel probe snapshots before surfacing the error", async () => {
    probeChannelConfigMock.mockRejectedValue(new Error("bad credentials"));

    await expect(
      executeDesktopApiRequest({
        method: "POST",
        path: "/v1/channels/check",
        body: {
          channel: "telegram",
          config: { botToken: "token-a" },
        },
      }),
    ).rejects.toThrow("bad credentials");

    expect(recordChannelProbeResultMock).toHaveBeenCalledWith(
      "telegram",
      { botToken: "token-a" },
      false,
      "bad credentials",
    );
  });

  it("returns the latest structured journal snapshot for diagnostics refresh", async () => {
    readJournalExcerptMock.mockReturnValue({
      latestFile: "2026-03-31.log",
      excerpt: ["2026-03-31 20:06:17 [INFO] [RelayWorker] worker online: qq"],
      entries: [
        {
          raw: "2026-03-31 20:06:17 [INFO] [RelayWorker] worker online: qq",
          occurredAt: "2026-03-31 20:06:17",
          timeLabel: "20:06:17",
          level: "INFO",
          tag: "RelayWorker",
          title: "后台服务已就绪",
          detail: "worker online: qq",
          tone: "success",
        },
      ],
      updatedAt: "2026-03-31T12:06:17.000Z",
      totalLines: 1,
      truncated: false,
      notice: null,
    });

    await expect(
      executeDesktopApiRequest({
        method: "GET",
        path: "/v1/journal",
      }),
    ).resolves.toMatchObject({
      latestFile: "2026-03-31.log",
      totalLines: 1,
      truncated: false,
    });

    expect(readJournalExcerptMock).toHaveBeenCalledWith("/tmp/relaydesk-logs");
  });
});
