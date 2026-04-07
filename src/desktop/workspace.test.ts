import { describe, expect, it } from "vitest";
import {
  editWorkspace,
  normalizeWorkspace,
  parseJsonRecord,
  parseWorkspaceSource,
  resolvePreferredWorkdir,
  setPreferredWorkdir,
} from "./workspace";

describe("workspace helpers", () => {
  it("normalizes an empty workspace into a fully editable shape", () => {
    const workspace = normalizeWorkspace(undefined);

    expect(workspace.aiCommand).toBe("claude");
    expect(workspace.runtime?.keepAwake).toBe(false);
    expect(workspace.tools?.codex?.cliPath).toBe("codex");
    expect(workspace.tools?.codex?.timeoutMs).toBe(1800000);
    expect(workspace.tools?.codex?.idleTimeoutMs).toBe(600000);
    expect(workspace.tools?.codebuddy?.idleTimeoutMs).toBe(600000);
    expect(workspace.platforms?.telegram?.enabled).toBe(false);
    expect(workspace.platforms?.wechat?.allowedUserIds).toEqual([]);
  });

  it("edits a cloned workspace without mutating the original", () => {
    const original = normalizeWorkspace(undefined);
    const updated = editWorkspace(original, (draft) => {
      if (draft.platforms?.telegram) {
        draft.platforms.telegram.enabled = true;
      }
    });

    expect(original.platforms?.telegram?.enabled).toBe(false);
    expect(updated.platforms?.telegram?.enabled).toBe(true);
  });

  it("parses raw workspace JSON and applies defaults", () => {
    const parsed = parseWorkspaceSource('{"platforms":{"telegram":{"enabled":true}}}');

    expect(parsed.platforms?.telegram?.enabled).toBe(true);
    expect(parsed.tools?.claude?.timeoutMs).toBe(600000);
    expect(parsed.tools?.codex?.timeoutMs).toBe(1800000);
  });

  it("rejects non-string values in env records", () => {
    expect(() => parseJsonRecord('{"TOKEN":123}', "Claude env")).toThrow(
      "Claude env values must be strings.",
    );
  });

  it("prefers the selected agent workdir when resolving the active workspace path", () => {
    const workspace = normalizeWorkspace({
      aiCommand: "codex",
      tools: {
        claude: { workDir: "/claude" },
        codex: { workDir: "/codex" },
      },
    });

    expect(resolvePreferredWorkdir(workspace)).toBe("/codex");
  });

  it("preserves runtime keep-awake when parsing raw workspace JSON", () => {
    const parsed = parseWorkspaceSource('{"runtime":{"keepAwake":true}}');

    expect(parsed.runtime?.keepAwake).toBe(true);
  });

  it("updates claude and codex workdirs together for the shared preferred workdir", () => {
    const workspace = normalizeWorkspace({
      tools: {
        claude: { workDir: "/old-claude" },
        codex: { workDir: "/old-codex" },
      },
    });

    setPreferredWorkdir(workspace, "/shared");

    expect(workspace.tools?.claude?.workDir).toBe("/shared");
    expect(workspace.tools?.codex?.workDir).toBe("/shared");
  });
});
