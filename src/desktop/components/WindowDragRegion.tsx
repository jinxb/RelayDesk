import { forwardRef, type MouseEvent, type ReactNode } from "react";
import { desktopBridge } from "../../lib/desktop";

interface WindowDragRegionProps {
  readonly className?: string;
  readonly children: ReactNode;
}

function buildClassName(className?: string) {
  return className ? `relaydesk-windowDragRegion ${className}` : "relaydesk-windowDragRegion";
}

function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  void desktopBridge.startWindowDrag();
}

export const WindowDragRegion = forwardRef<HTMLDivElement, WindowDragRegionProps>(
  ({ className, children }, ref) => (
    <div
      ref={ref}
      className={buildClassName(className)}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  ),
);

WindowDragRegion.displayName = "WindowDragRegion";
