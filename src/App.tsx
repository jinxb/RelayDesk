import { DesktopWorkbench } from "./desktop/components/DesktopWorkbench";
import { useRelayDeskStudio } from "./desktop/useRelayDeskStudio";

export function App() {
  const studio = useRelayDeskStudio();
  return <DesktopWorkbench studio={studio} />;
}
