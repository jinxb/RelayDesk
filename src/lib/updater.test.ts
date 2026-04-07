import { describe, expect, it } from "vitest";
import { describeUpdaterError } from "./updater";

describe("describeUpdaterError", () => {
  it("maps missing endpoints to a friendly updater message", () => {
    expect(
      describeUpdaterError(new Error("Updater does not have any endpoints set.")),
    ).toBe("自动更新尚未配置更新源。");
  });

  it("maps missing pubkey to a friendly updater message", () => {
    expect(
      describeUpdaterError(new Error("The updater pubkey configuration is required.")),
    ).toBe("自动更新尚未配置签名公钥。");
  });
});
