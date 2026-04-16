import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

import {
  buildCodexArgs,
  buildCodexLaunchSpec,
  extractGeneratedFilePaths,
  extractGeneratedImagePaths,
  extractPromptImagePaths,
  resetCodexCliCachesForTests,
  resolveCodexIdleTimeoutMs,
} from "./cli-runner.js";

const tempDirs: string[] = [];
const GLOBAL_HELP = [
  "--cd",
  "--full-auto",
  "--dangerously-bypass-approvals-and-sandbox",
  "--sandbox",
  "--model",
  "--image",
].join("\n");
const EXEC_HELP_WITH_STDIN = [
  "--json",
  "--skip-git-repo-check",
  "If `-` is used, read from stdin.",
].join("\n");

function mockCodexCli(options?: {
  readonly stdinDash?: boolean;
  readonly skipGitRepoCheck?: boolean;
  readonly fullAuto?: boolean;
  readonly dangerousBypass?: boolean;
  readonly sandbox?: boolean;
}) {
  const globalHelp = [
    "--cd",
    options?.fullAuto === false ? null : "--full-auto",
    options?.dangerousBypass === false ? null : "--dangerously-bypass-approvals-and-sandbox",
    options?.sandbox === false ? null : "--sandbox",
    "--model",
    "--image",
  ].filter(Boolean).join("\n");
  const execHelp = [
    "--json",
    options?.skipGitRepoCheck === false ? null : "--skip-git-repo-check",
    options?.stdinDash === false ? null : "If `-` is used, read from stdin.",
  ].filter(Boolean).join("\n");

  execFileSyncMock.mockImplementation((command: string, args: string[]) => {
    if (command === "which" || command === "where") {
      return Buffer.from("/usr/bin/codex");
    }
    if (args[0] === "--help") {
      return Buffer.from(globalHelp);
    }
    if (args[0] === "exec" && args[1] === "--help") {
      return Buffer.from(execHelp);
    }
    return Buffer.from("");
  });
}

function createTempImage(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "relaydesk-codex-test-"));
  tempDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return path;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.CODEX_IDLE_TIMEOUT_MS;
  execFileSyncMock.mockReset();
  resetCodexCliCachesForTests();
});

describe("extractPromptImagePaths", () => {
  it("extracts a single saved image path from a media prompt", () => {
    const imagePath = createTempImage("single.png");
    const prompt = [
      "The user sent a DingTalk image message.",
      `Saved local file path: ${imagePath}`,
      "Use the Read tool to inspect the saved file and describe the relevant visual contents before answering.",
    ].join("\n\n");

    expect(extractPromptImagePaths(prompt)).toEqual([imagePath]);
  });

  it("extracts image items from batch media prompts and ignores non-images", () => {
    const imagePath = createTempImage("batch.png");
    const prompt = [
      "Saved local file paths:",
      `1. photo: ${imagePath} (image)`,
      "2. notes.txt (file)",
    ].join("\n");

    expect(extractPromptImagePaths(prompt)).toEqual([imagePath]);
  });
});

describe("extractGeneratedImagePaths", () => {
  it("resolves relative image paths against the working directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-codex-output-"));
    tempDirs.push(dir);
    const imagePath = join(dir, "generated.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(
      extractGeneratedImagePaths([{ path: "generated.png", kind: "created" }], dir),
    ).toEqual([imagePath]);
  });

  it("filters out non-image file changes and missing paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-codex-output-"));
    tempDirs.push(dir);
    const textPath = join(dir, "note.txt");
    writeFileSync(textPath, "hello");

    expect(
      extractGeneratedImagePaths(
        [
          { path: "note.txt", kind: "created" },
          { path: "missing.png", kind: "created" },
        ],
        dir,
      ),
    ).toEqual([]);
  });
});

describe("extractGeneratedFilePaths", () => {
  it("resolves relative non-image file paths against the working directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-codex-output-"));
    tempDirs.push(dir);
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello");

    expect(
      extractGeneratedFilePaths([{ path: "report.txt", kind: "created" }], dir),
    ).toEqual([filePath]);
  });

  it("filters out image file changes from generated file routing", () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-codex-output-"));
    tempDirs.push(dir);
    const imagePath = join(dir, "report.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(
      extractGeneratedFilePaths([{ path: "report.png", kind: "created" }], dir),
    ).toEqual([]);
  });
});

describe("buildCodexArgs", () => {
  it("adds image attachments for new sessions", () => {
    const prompt = "Saved local file path: ";
    const imagePath = createTempImage("new-session.png");
    const args = buildCodexArgs(
      `${prompt}${imagePath}`,
      undefined,
      "D:\\coding\\relaydesk",
      {},
    );

    expect(args.slice(0, 3)).toEqual(["--cd", "D:\\coding\\relaydesk", "--full-auto"]);
    expect(args).toContain("--image");
    expect(args.indexOf("--image")).toBeLessThan(args.indexOf("exec"));
    expect(args).toContain("--image");
    expect(args).toContain(imagePath);
    expect(args.at(-1)).toBe(`${prompt}${imagePath}`);
  });

  it("adds image attachments for resumed sessions", () => {
    const prompt = "Saved local file path: ";
    const imagePath = createTempImage("resume-session.png");
    const args = buildCodexArgs(
      `${prompt}${imagePath}`,
      "session-123",
      "D:\\coding\\relaydesk",
      {},
    );

    expect(args.slice(0, 3)).toEqual(["--cd", "D:\\coding\\relaydesk", "--full-auto"]);
    expect(args.indexOf("--image")).toBeLessThan(args.indexOf("exec"));
    expect(args.slice(args.indexOf("exec"), args.indexOf("exec") + 2)).toEqual(["exec", "resume"]);
    expect(args).toContain("--image");
    expect(args).toContain(imagePath);
    expect(args.at(-1)).toBe(`${prompt}${imagePath}`);
  });
});

describe("buildCodexLaunchSpec", () => {
  it("uses argv transport for short prompts with compatible CLI capabilities", () => {
    mockCodexCli();
    const prompt = "fix the build";
    const spec = buildCodexLaunchSpec(
      "codex-short",
      prompt,
      undefined,
      "/tmp/relaydesk",
      {},
    );

    expect(spec.promptTransport).toBe("argv");
    expect(spec.args.at(-1)).toBe(prompt);
    expect(spec.stdinPayload).toBeUndefined();
    expect(execFileSyncMock).toHaveBeenCalled();
  });

  it("uses stdin transport for long prompts when CLI help declares dash support", () => {
    mockCodexCli();
    const prompt = "x".repeat(25_001);
    const spec = buildCodexLaunchSpec(
      "codex-stdin",
      prompt,
      undefined,
      "/tmp/relaydesk",
      {},
    );

    expect(spec.promptTransport).toBe("stdin-dash");
    expect(spec.args.at(-1)).toBe("-");
    expect(spec.stdinPayload).toBe(prompt);
  });

  it("fails explicitly when a long prompt exceeds argv limits and the CLI lacks stdin support", () => {
    mockCodexCli({ stdinDash: false });
    const prompt = "x".repeat(25_001);

    expect(() =>
      buildCodexLaunchSpec(
        "codex-no-stdin",
        prompt,
        undefined,
        "/tmp/relaydesk",
        {},
      ),
    ).toThrow(/当前 Codex CLI 不支持使用 `-` 从 stdin 读取 prompt/);
  });

  it("fails explicitly when the CLI misses required RelayDesk flags", () => {
    mockCodexCli({ fullAuto: false });

    expect(() =>
      buildCodexLaunchSpec(
        "codex-missing-flags",
        "fix the build",
        undefined,
        "/tmp/relaydesk",
        {},
      ),
    ).toThrow(/缺少：--full-auto/);
  });

  it("reports CLI inspection failure explicitly when long prompts require capability probing", () => {
    execFileSyncMock.mockImplementation((command: string) => {
      if (command === "which" || command === "where") {
        const error = new Error("spawn ENOENT") as Error & { code?: string };
        error.code = "ENOENT";
        throw error;
      }
      const error = new Error("spawn ENOENT") as Error & { code?: string };
      error.code = "ENOENT";
      throw error;
    });
    const prompt = "x".repeat(25_001);

    expect(() =>
      buildCodexLaunchSpec(
        "missing-codex",
        prompt,
        undefined,
        "/tmp/relaydesk",
        {},
      ),
    ).toThrow(/Codex CLI 不可执行/);
  });
});

describe("resolveCodexIdleTimeoutMs", () => {
  it("prefers explicit idle timeout settings and clamps them to total timeout", () => {
    process.env.CODEX_IDLE_TIMEOUT_MS = "900000";

    expect(resolveCodexIdleTimeoutMs(300000, 120000)).toBe(120000);
  });

  it("falls back to the environment variable when no explicit idle timeout is provided", () => {
    process.env.CODEX_IDLE_TIMEOUT_MS = "240000";

    expect(resolveCodexIdleTimeoutMs(undefined, 0)).toBe(240000);
  });
});
