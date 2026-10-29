import { splitGroupOf, splitTabKey, useSplitViewStore } from "../../splitViewStore";
import { browser, useBrowserModel } from "./browserStore";
import { spaceOfThread, useThreadSpaceStore } from "./threadSpaceStore";

// The tab each chat's links last opened in, so the next link reuses it rather than adding
// a pane per link. Only tabs opened here: a tab the user put in the split is never taken.
const linkPanes = new Map<string, string>();

/**
 * Opens a link from a chat as a tab in a split beside that chat, in the chat's space. A
 * later link from the same chat goes to the same pane while it is still beside the chat.
 * Returns false when the browser can't take it, so the caller can fall back.
 */
export function openLinkBesideChat(chatKey: string, url: string): boolean {
  const actions = browser();
  const model = useBrowserModel.getState().browser;
  if (!actions || !model) return false;
  const store = useSplitViewStore.getState();

  const previous = linkPanes.get(chatKey);
  const group = splitGroupOf(store.groups, chatKey);
  if (
    previous &&
    model.tabs[previous] &&
    group?.rows.some((row) => row.includes(splitTabKey(previous)))
  ) {
    actions.navigateTab(previous, url);
    return true;
  }

  const spaceId = spaceOfThread(
    useThreadSpaceStore.getState().spaceOf,
    chatKey,
    model.spaces.map((space) => space.id),
  );
  const tabId = actions.openTab(url, {
    owner: chatKey,
    ...(spaceId ? { spaceId } : {}),
    background: true,
  });
  if (!tabId) return false;
  linkPanes.set(chatKey, tabId);
  if (!store.place(chatKey, splitTabKey(tabId), { target: chatKey, side: "right" })) {
    store.join(chatKey, splitTabKey(tabId));
  }
  return true;
}
