import { desktopBridge } from "./desktop";

export interface AppUpdateSnapshot {
  readonly version: string;
  readonly currentVersion: string;
  readonly publishedAt?: string;
  readonly notes?: string;
  readonly install: () => Promise<never>;
}

function describeUpdaterError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/endpoints/i.test(message) || /Updater does not have any endpoints set/i.test(message)) {
    return "自动更新尚未配置更新源。";
  }
  if (/pubkey/i.test(message)) {
    return "自动更新尚未配置签名公钥。";
  }
  return message;
}

export async function checkForAppUpdate(): Promise<AppUpdateSnapshot | null> {
  if (!desktopBridge.supported()) {
    throw new Error("自动更新仅在桌面应用中可用。");
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    return null;
  }

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    publishedAt: update.date,
    notes: update.body,
    install: async () => {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
      throw new Error("应用正在重启以完成更新。");
    },
  };
}

export { describeUpdaterError };
