import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";

const CAFFEINATE_PATH = "/usr/bin/caffeinate";

interface RuntimeLogger {
  info(message: string): void;
}

export interface KeepAwakeLease {
  readonly active: boolean;
  release(): void;
}

interface RuntimeKeepAwakeOptions {
  readonly enabled: boolean;
  readonly logger?: RuntimeLogger;
  readonly pid?: number;
  readonly platform?: NodeJS.Platform;
  readonly caffeinatePath?: string;
  readonly assertExecutable?: (path: string) => void;
  readonly spawnProcess?: typeof spawn;
}

const INACTIVE_KEEP_AWAKE: KeepAwakeLease = {
  active: false,
  release() {},
};

function assertExecutable(path: string) {
  accessSync(path, constants.X_OK);
}

function createLease(child: ChildProcess): KeepAwakeLease {
  return {
    active: true,
    release() {
      if (child.killed || child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
    },
  };
}

export function engageRuntimeKeepAwake(
  options: RuntimeKeepAwakeOptions,
): KeepAwakeLease {
  if (!options.enabled) {
    return INACTIVE_KEEP_AWAKE;
  }

  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") {
    throw new Error("常驻模式目前仅支持 macOS，且只能阻止空闲睡眠，不能阻止合盖睡眠。");
  }

  const caffeinatePath = options.caffeinatePath ?? CAFFEINATE_PATH;
  const pid = options.pid ?? process.pid;
  (options.assertExecutable ?? assertExecutable)(caffeinatePath);

  const child = (options.spawnProcess ?? spawn)(
    caffeinatePath,
    ["-i", "-w", String(pid)],
    { stdio: "ignore" },
  );
  if (!child.pid) {
    throw new Error("无法启动 macOS caffeinate 常驻助手。");
  }

  child.unref();
  options.logger?.info(`runtime keep-awake enabled via caffeinate (pid=${child.pid})`);
  return createLease(child);
}
