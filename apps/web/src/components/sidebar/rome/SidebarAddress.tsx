import { useAddressBarStore, useShownTabStore } from "../../../browser/rome/addressBarStore";
import { useTab } from "../../../browser/rome/browserStore";
import {
  AddressField,
  ChatTools,
  ExtensionActions,
  PageNavigation,
  showAddressBarMenu,
} from "../../../browser/rome/PageHeader";

/**
 * The page's address and controls in the sidebar, under the space, as Arc keeps
 * them: back, forward, reload, the chat tools and extensions, and the address.
 * With the sidebar hidden the page's own header takes over (ArdiaSurface).
 * Shown while a page is on screen and the address lives in the sidebar.
 */
export function SidebarAddress() {
  const place = useAddressBarStore((state) => state.place);
  const tabId = useShownTabStore((state) => state.tabId);
  const tab = useTab(tabId ?? "");
  if (place !== "sidebar" || !tab) return null;
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
