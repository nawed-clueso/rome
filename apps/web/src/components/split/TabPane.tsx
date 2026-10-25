import { useLayoutEffect, useRef } from "react";

import { browser, useBrowserModel, useTab } from "../../browser/rome/browserStore";
import { PageHeader } from "../../browser/rome/PageHeader";
import { noteShownPage } from "../../browser/rome/shownPagesStore";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

/** A browser tab as a split pane: the app's page header, with the page itself laid over the slot below. */
export function TabPane(props: {
  readonly tabId: string;
  readonly topLeft: boolean;
  readonly onClose: () => void;
}) {
  const slot = useRef<HTMLDivElement | null>(null);
  const ready = useBrowserModel((state) => state.browser !== null);
  const tab = useTab(props.tabId);
  const exists = tab !== null;
  useLayoutEffect(() => {
    const element = slot.current;
    const actions = browser();
    if (!ready || !element || !actions || !exists) return;
    noteShownPage(props.tabId, true);
    actions.showTabAt(props.tabId, element);
    return () => {
      actions.showTabAt(props.tabId, null);
      noteShownPage(props.tabId, false);
    };
  }, [props.tabId, ready, exists]);

  if (!tab) {
    return (
      <Empty className="flex-1">
        <EmptyHeader className="max-w-sm">
          <EmptyTitle>{ready ? "This tab was closed" : "Loading the browser"}</EmptyTitle>
          {ready ? (
            <EmptyDescription>Close this pane, or drag another tab in.</EmptyDescription>
          ) : null}
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader tabId={props.tabId} titleBar={props.topLeft} onClose={props.onClose} />
      <div ref={slot} className="min-h-0 flex-1 rounded-b-xl" />
    </div>
  );
}
