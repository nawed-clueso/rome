import { create } from "zustand";

/** Tabs whose pages the app shows outside the browser window, in split panes. */
export const useShownPagesStore = create<{ readonly tabIds: readonly string[] }>()(() => ({
  tabIds: [],
}));

export function noteShownPage(tabId: string, shown: boolean) {
  useShownPagesStore.setState((state) => {
    const has = state.tabIds.includes(tabId);
    if (has === shown) return state;
    return { tabIds: shown ? [...state.tabIds, tabId] : state.tabIds.filter((id) => id !== tabId) };
  });
}
