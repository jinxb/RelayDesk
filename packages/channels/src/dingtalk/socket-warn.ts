const DINGTALK_STREAM_HOST = "wss-open-connection.dingtalk.com";

type NodeLikeError = Error & {
  code?: string;
  host?: string;
  port?: number;
};

let warnFilterInstalled = false;

export function shouldSuppressDingTalkSocketWarn(args: unknown[]) {
  if (args.length < 2 || args[0] !== "ERROR") return false;
  const err = args[1];
  if (!(err instanceof Error)) return false;

  const socketError = err as NodeLikeError;
  return (
    socketError.code === "ECONNRESET" &&
    socketError.host === DINGTALK_STREAM_HOST &&
    socketError.port === 443
  );
}

export function installDingTalkSocketWarnFilter(log: {
  warn: (message: string) => void;
}) {
  if (warnFilterInstalled) return;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (!shouldSuppressDingTalkSocketWarn(args)) {
      originalWarn(...args);
      return;
    }

    const err = args[1] as NodeLikeError;
    log.warn(
      `DingTalk stream socket reset before TLS handshake; waiting for SDK auto-reconnect (${err.code ?? "UNKNOWN"} ${err.host ?? "unknown-host"}:${err.port ?? 0})`,
    );
  };
  warnFilterInstalled = true;
}
