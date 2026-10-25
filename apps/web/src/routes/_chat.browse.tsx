import { createFileRoute } from "@tanstack/react-router";

import { ArdiaSurface } from "../browser/ardia/ArdiaSurface";
import { ardiaAvailable } from "../browser/ardia/ardiaHostStore";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";

/** The browser on its own, filling the window: tabs that belong to no thread open here. */
function BrowseRoute() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      {ardiaAvailable ? (
        <ArdiaSurface visible owner={null} cornerRadius={11} />
      ) : (
        <Empty className="flex-1">
          <EmptyHeader className="max-w-md">
            <EmptyTitle>The browser needs the desktop app</EmptyTitle>
            <EmptyDescription>
              Open this window in the desktop app to browse the web.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/browse")({
  component: BrowseRoute,
});
