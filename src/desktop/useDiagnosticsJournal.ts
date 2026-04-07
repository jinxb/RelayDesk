import { useEffect, useRef, useState } from "react";
import { relaydeskApi } from "../lib/client";
import type { BootstrapPayload } from "../lib/models";
import { toErrorMessage } from "./studio-support";
import type { StudioViewKey } from "./types";

const JOURNAL_POLL_INTERVAL_MS = 5000;

interface DiagnosticsJournalState {
  readonly journal: BootstrapPayload["journal"] | null;
  readonly journalBusy: boolean;
  readonly journalError: string | null;
  hydrateJournal(journal: BootstrapPayload["journal"]): void;
  refreshJournal(): Promise<void>;
}

function useJournalRequestId() {
  return useRef(0);
}

export function useDiagnosticsJournal(currentView: StudioViewKey): DiagnosticsJournalState {
  const [journal, setJournal] = useState<BootstrapPayload["journal"] | null>(null);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const requestIdRef = useJournalRequestId();

  function hydrateJournal(nextJournal: BootstrapPayload["journal"]) {
    setJournal(nextJournal);
    setJournalError(null);
  }

  async function loadJournal(background: boolean) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!background) setJournalBusy(true);
    try {
      const nextJournal = await relaydeskApi.journal();
      if (requestIdRef.current !== requestId) return;
      setJournal(nextJournal);
      setJournalError(null);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setJournalError(toErrorMessage(error));
    } finally {
      if (!background && requestIdRef.current === requestId) {
        setJournalBusy(false);
      }
    }
  }

  async function refreshJournal() {
    await loadJournal(false);
  }

  useEffect(() => {
    if (currentView !== "diagnosis") return undefined;
    void loadJournal(true);
    const timer = window.setInterval(() => {
      void loadJournal(true);
    }, JOURNAL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [currentView]);

  return {
    journal,
    journalBusy,
    journalError,
    hydrateJournal,
    refreshJournal,
  };
}
