import { Box } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import type { RelayDeskStudio } from "../types";
import { ChannelControlView } from "./ChannelControlView";
import { DesktopStartupView } from "./DesktopStartupView";
import { DiagnosticsView } from "./DiagnosticsView";
import { NavPanel } from "./NavPanel";
import { OverviewView } from "./OverviewView";
import { DirtyActionBar } from "./DirtyActionBar";
import { SessionManagementView } from "./SessionManagementView";
import { PreviewModeNotice } from "./PreviewModeNotice";
import { SettingsView } from "./SettingsView";
import { ToastCenter } from "./ToastCenter";
import { PreferencesModal, type AdvancedTab } from "./PreferencesModal";
import { SetupWizardView } from "./wizard/SetupWizardView";

interface DesktopWorkbenchProps {
  readonly studio: RelayDeskStudio;
}

function renderCurrentView(studio: RelayDeskStudio) {
  switch (studio.currentView) {
    case "console":
      return <OverviewView studio={studio} />;
    case "connection":
      return <ChannelControlView studio={studio} />;
    case "ai":
      return <SettingsView studio={studio} />;
    case "sessions":
      return <SessionManagementView studio={studio} />;
    case "diagnosis":
      return <DiagnosticsView studio={studio} />;
  }
}

function contentViewClass(currentView: RelayDeskStudio["currentView"]) {
  return currentView === "console"
    ? "relaydesk-contentView relaydesk-contentView--fixed relaydesk-contentView--overview"
    : "relaydesk-contentView relaydesk-contentView--scroll";
}

export function DesktopWorkbench({ studio }: DesktopWorkbenchProps) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesTab, setPreferencesTab] = useState<AdvancedTab>("runtime");

  useEffect(() => {
    function openAdvancedAbout() {
      setPreferencesTab("about");
      setPreferencesOpen(true);
    }

    window.addEventListener("relaydesk:open-advanced-about", openAdvancedAbout);
    return () => window.removeEventListener("relaydesk:open-advanced-about", openAdvancedAbout);
  }, []);

  if (studio.snapshot.isFirstTime) {
    return (
      <Box className="relaydesk-shell">
        <div className="relaydesk-appFrame" style={{ filter: "blur(8px)", pointerEvents: "none", opacity: 0.6 }}>
          <NavPanel studio={studio} onOpenPreferences={() => {}} />
          <main className="relaydesk-main">
            <div className="relaydesk-mainDeck" />
          </main>
        </div>
        <div className="relaydesk-wizardOverlay">
          <SetupWizardView studio={studio} />
        </div>
        <ToastCenter studio={studio} />
      </Box>
    );
  }

  return (
    <Box className="relaydesk-shell">
      {studio.snapshot.loading && <DesktopStartupView studio={studio} />}
      <div className="relaydesk-appFrame">
          <NavPanel studio={studio} onOpenPreferences={() => {
          setPreferencesTab("runtime");
          setPreferencesOpen(true);
        }} />
        <main className="relaydesk-main">
          <div className="relaydesk-mainDeck">
            {studio.currentView === "diagnosis" ? null : <PreviewModeNotice studio={studio} />}
            <section className={contentViewClass(studio.currentView)}>{renderCurrentView(studio)}</section>
            <DirtyActionBar studio={studio} />
            <ToastCenter studio={studio} />
            <PreferencesModal
              studio={studio}
              open={preferencesOpen}
              onOpenChange={setPreferencesOpen}
              tab={preferencesTab}
              onTabChange={setPreferencesTab}
            />
          </div>
        </main>
      </div>
    </Box>
  );
}
