import { ArrowLeftIcon, ArrowRightIcon, RotateCwIcon, SearchIcon } from "lucide-react";

import { openNewScreen } from "~/newScreenStore";
import { useAddressBarStore, useShownTabStore } from "../../../browser/rome/addressBarStore";
import { useTab } from "../../../browser/rome/browserStore";
import {
  AddressField,
  ChatTools,
  ExtensionActions,
  PageNavigation,
  showAddressBarMenu,
} from "../../../browser/rome/PageHeader";
import { Button } from "../../ui/button";

/**
 * The page's address and controls in the sidebar, under the space, as Arc keeps
 * them: back, forward, reload, the chat tools and extensions, and the address.
 * With the sidebar hidden the page's own header takes over (ArdiaSurface).
 * Always there while the address lives in the sidebar: with no page on screen (a
 * chat), it stays as a search field, so the sidebar never shifts between the two.
 */
export function SidebarAddress() {
  const place = useAddressBarStore((state) => state.place);
  const tabId = useShownTabStore((state) => state.tabId);
  const tab = useTab(tabId ?? "");
  if (place !== "sidebar") return null;
  if (!tab) return <IdleAddress />;
  return (
    // In the sidebar's own colours, as Arc keeps it: a row of controls over a soft
    // address pill. The page's colour stays with the header above the page.
    <div
      onContextMenu={(event) => void showAddressBarMenu(event, "sidebar")}
      className="flex flex-col gap-1"
    >
      <div className="flex items-center gap-0.5 px-0.5">
        <PageNavigation tab={tab} />
        <span className="flex-1" />
        <ChatTools tabId={tab.id} />
        <ExtensionActions tabId={tab.id} />
      </div>
      {/* Sized and set like the New button below it. */}
      <AddressField
        tab={tab}
        hostOnly
        className="h-9 flex-none rounded-xl bg-sidebar-foreground/[0.06] px-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-foreground/[0.1]"
      />
    </div>
  );
}

/** The address with no page on screen: the same shape, as a way to search or open one. */
function IdleAddress() {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5 px-0.5">
        <Button variant="ghost-muted" size="icon-xs" aria-label="Back" disabled>
          <ArrowLeftIcon />
        </Button>
        <Button variant="ghost-muted" size="icon-xs" aria-label="Forward" disabled>
          <ArrowRightIcon />
        </Button>
        <Button variant="ghost-muted" size="icon-xs" aria-label="Reload" disabled>
          <RotateCwIcon />
        </Button>
      </div>
      <button
        type="button"
        onClick={() => openNewScreen("browse")}
        className="flex h-9 flex-none cursor-text items-center gap-2 rounded-xl bg-sidebar-foreground/[0.06] px-2.5 text-left text-sidebar-muted-foreground text-sm outline-hidden hover:bg-sidebar-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 truncate">Search or type a URL</span>
      </button>
    </div>
  );
}
