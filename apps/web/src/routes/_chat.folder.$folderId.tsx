import { createFileRoute } from "@tanstack/react-router";

import { FolderView } from "../browser/rome/FolderView";
import { ScrollArea } from "../components/ui/scroll-area";
import { SidebarInset } from "../components/ui/sidebar";

/** A sidebar folder opened as a page. */
function FolderRoute() {
  const { folderId } = Route.useParams();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <ScrollArea className="min-h-0 flex-1">
        <FolderView folderId={folderId} />
      </ScrollArea>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/folder/$folderId")({
  component: FolderRoute,
});
