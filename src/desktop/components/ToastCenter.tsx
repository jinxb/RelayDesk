import { useEffect, useState } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { CheckCircle2, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import type { RelayDeskStudio, StudioStatus, StudioTone } from "../types";

interface ToastState extends StudioStatus {
  readonly loading: boolean;
}

function shouldSuppressToast(message: string | null) {
  return !message || message.includes("正在连接");
}

function buildBusyToast(studio: RelayDeskStudio): ToastState | null {
  const message = studio.snapshot.busyMessage ?? studio.snapshot.status.message;
  if (shouldSuppressToast(message)) {
    return null;
  }

  return {
    message,
    tone: "neutral",
    loading: true,
  };
}

function buildResultToast(studio: RelayDeskStudio): ToastState | null {
  const message = studio.snapshot.status.message;
  if (shouldSuppressToast(message)) {
    return null;
  }

  return {
    message,
    tone: studio.snapshot.status.tone,
    loading: false,
  };
}

function toastIcon(toast: ToastState) {
  if (toast.loading) {
    return <LoaderCircle size={16} className="relaydesk-spin" color="var(--info)" />;
  }
  if (toast.tone === "success") {
    return <CheckCircle2 size={16} color="var(--success)" />;
  }
  if (toast.tone === "warning") {
    return <TriangleAlert size={16} color="var(--warning)" />;
  }
  if (toast.tone === "danger") {
    return <TriangleAlert size={16} color="var(--danger)" />;
  }
  return <Info size={16} color="var(--info)" />;
}

function toastStyle(tone: StudioTone, loading: boolean) {
  if (loading) {
    return {
      background: "rgba(255, 255, 255, 0.96)",
      borderColor: "rgba(78, 141, 245, 0.2)",
    };
  }

  if (tone === "success") {
    return {
      background: "rgba(255, 255, 255, 0.98)",
      borderColor: "rgba(34, 176, 125, 0.24)",
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(255, 252, 245, 0.98)",
      borderColor: "rgba(228, 162, 74, 0.28)",
    };
  }

  if (tone === "danger") {
    return {
      background: "rgba(255, 248, 248, 0.98)",
      borderColor: "rgba(224, 102, 102, 0.24)",
    };
  }

  return {
    background: "rgba(255, 255, 255, 0.98)",
    borderColor: "var(--line-subtle)",
  };
}

export function ToastCenter({ studio }: { studio: RelayDeskStudio }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastReady, setToastReady] = useState(false);

  useEffect(() => {
    if (!toastReady) {
      if (!studio.snapshot.busy) {
        setToastReady(true);
      }
      return undefined;
    }

    const nextToast = studio.snapshot.busy
      ? buildBusyToast(studio)
      : buildResultToast(studio);

    if (!nextToast) {
      if (!studio.snapshot.busy) {
        setToast(null);
      }
      return undefined;
    }

    setToast(nextToast);
    if (nextToast.loading) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setToast((current) => (current?.loading ? current : null));
    }, 3000);
    return () => clearTimeout(timer);
  }, [studio.snapshot.busy, studio.snapshot.busyMessage, studio.snapshot.status, toastReady]);

  if (!toast) return null;
  const style = toastStyle(toast.tone, toast.loading);

  return (
    <Box style={{
      position: "fixed",
      bottom: "16px",
      right: "16px",
      background: style.background,
      border: `1px solid ${style.borderColor}`,
      borderRadius: "12px",
      padding: "12px 16px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      zIndex: 50,
      animation: "fade-in 0.2s ease-out"
    }}>
      <Flex align="center" gap="2">
        {toastIcon(toast)}
        <Text size="2">{toast.message}</Text>
      </Flex>
    </Box>
  );
}
