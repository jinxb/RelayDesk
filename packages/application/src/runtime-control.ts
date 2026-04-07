import {
  getServiceStatus,
  startBackgroundService,
  stopBackgroundService,
} from "../../state/src/index.js";

export function readRuntimeStatus() {
  return getServiceStatus();
}

export async function launchRuntime(workTree: string) {
  startBackgroundService(workTree);
  return getServiceStatus();
}

export async function haltRuntime() {
  return stopBackgroundService();
}
