import type { ArdiaActivePage } from "@t3-ardia/entry";
import { create } from "zustand";

import { isElectron } from "../../env";

/** The Ardia browser renders `<webview>` guests, which only exist in the desktop app. */
export const ardiaAvailable = isElectron;

/** The slot id the Ardia panel presents through `browserSurfaceStore`. */
export const ARDIA_SURFACE_ID = "ardia";

interface ArdiaHostState {
  /** Set the first time a panel shows the browser; the bundle loads from then on. */
  readonly requested: boolean;
  readonly request: () => void;
  /** What the browser is showing, for the panel's tab title and icon. */
  readonly activePage: ArdiaActivePage | null;
}

export const useArdiaHostStore = create<ArdiaHostState>()((set) => ({
  requested: false,
  request: () => set((state) => (state.requested ? state : { requested: true })),
  activePage: null,
}));

let entry: Promise<typeof import("@t3-ardia/entry")> | null = null;

export const loadArdia = () => {
  entry ??= import("@t3-ardia/entry").then((module) => {
    module.watchActivePage((activePage) => useArdiaHostStore.setState({ activePage }));
    return module;
  });
  return entry;
};
