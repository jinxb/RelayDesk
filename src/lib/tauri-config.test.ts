import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface TauriConfigShape {
  readonly plugins?: {
    readonly updater?: {
      readonly pubkey?: unknown;
      readonly endpoints?: unknown;
    };
  };
}

function readTauriConfig(): TauriConfigShape {
  const configPath = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../src-tauri/tauri.conf.json",
  );
  return JSON.parse(readFileSync(configPath, "utf-8")) as TauriConfigShape;
}

describe("tauri.conf updater plugin config", () => {
  it("keeps updater config non-null so the desktop shell can boot", () => {
    expect(readTauriConfig()).toEqual(
      expect.objectContaining({
        plugins: expect.objectContaining({
          updater: expect.objectContaining({
            pubkey: expect.any(String),
            endpoints: expect.any(Array),
          }),
        }),
      }),
    );
  });
});
