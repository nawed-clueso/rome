import { memo } from "react";

import { cn } from "~/lib/utils";
import { SidebarTrigger } from "../../ui/sidebar";

/** The sidebar's title bar: room for the window controls and a drag area, nothing else. */
export const RomeSidebarChrome = memo(function RomeSidebarChrome({
  isElectron,
}: {
  isElectron: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 items-center pr-2",
        isElectron && "drag-region",
      )}
    >
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger variant="ghost" aria-label="Toggle main sidebar" />
      </div>
    </div>
  );
});
