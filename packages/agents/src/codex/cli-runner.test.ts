import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCodexArgs,
  extractGeneratedFilePaths,
  extractGeneratedImagePaths,
  extractPromptImagePaths,
  resolveCodexIdleTimeoutMs,
} from "./cli-runner.js";

const tempDirs: string[] = [];

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
    const imagePath = createTempImage("new-session.png");
    const args = buildCodexArgs(
      `Saved local file path: ${imagePath}`,
      undefined,
      "D:\\coding\\relaydesk",
      {},
    );

    expect(args).toContain("--image");
    expect(args).toContain(imagePath);
  });

  it("adds image attachments for resumed sessions", () => {
    const imagePath = createTempImage("resume-session.png");
    const args = buildCodexArgs(
      `Saved local file path: ${imagePath}`,
      "session-123",
      "D:\\coding\\relaydesk",
      {},
    );

    expect(args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(args).toContain("--image");
    expect(args).toContain(imagePath);
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
