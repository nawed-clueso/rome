import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

/** Where a page's address and controls sit: above the page, or in the sidebar under the space (as Arc). */
export type AddressBarPlace = "page" | "sidebar";

export const useAddressBarStore = create<{
  readonly place: AddressBarPlace;
  readonly setPlace: (place: AddressBarPlace) => void;
}>()(
  persist(
    (set) => ({
      place: "page",
      setPlace: (place) => set({ place }),
    }),
    {
      name: "rome:address-bar:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ place: state.place }),
    },
  ),
);

/** The tab the browser surface shows right now, for the sidebar's address; null when none is on screen. */
export const useShownTabStore = create<{ readonly tabId: string | null }>()(() => ({
  tabId: null,
}));

/** Cmd+L's request to edit a tab's address: each request bumps `nonce`. */
export const useAddressEditStore = create<{
  readonly tabId: string | null;
  readonly nonce: number;
}>()(() => ({ tabId: null, nonce: 0 }));

export const requestAddressEdit = (tabId: string) =>
  useAddressEditStore.setState((state) => ({ tabId, nonce: state.nonce + 1 }));

/** Whether the hidden sidebar is peeking in from the window's edge. */
export const useSidebarPeekStore = create<{ readonly peeking: boolean }>()(() => ({
  peeking: false,
}));
