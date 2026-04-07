import type { RuntimeSnapshot } from "../lib/models";
import type { StudioSnapshot } from "./types";

const STOPPED_RUNTIME: RuntimeSnapshot = {
  running: false,
  pid: null,
  phase: "stopped",
  startupError: null,
};

export function readRuntimeSnapshot(snapshot: Pick<StudioSnapshot, "bootstrap">): RuntimeSnapshot {
  return snapshot.bootstrap?.runtime ?? STOPPED_RUNTIME;
}

export function isRuntimeRunning(snapshot: Pick<StudioSnapshot, "bootstrap">) {
  return readRuntimeSnapshot(snapshot).phase === "running";
}

export function isRuntimeStarting(snapshot: Pick<StudioSnapshot, "bootstrap">) {
  return readRuntimeSnapshot(snapshot).phase === "starting";
}
