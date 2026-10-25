import { create } from "zustand";

/** What the New screen starts: a chat with an agent, or a page in the browser. */
export type NewScreenMode = "chat" | "browse";

interface NewScreenState {
  readonly mode: NewScreenMode;
  /** The folder a page opened from the New screen goes into, when it was opened for one. */
  readonly folderId: string | null;
  readonly setMode: (mode: NewScreenMode, folderId?: string | null) => void;
  /** What's typed in the New screen's search; kept across switching to Chat and back. */
  readonly searchText: string;
  readonly setSearchText: (text: string) => void;
}

export const useNewScreenStore = create<NewScreenState>()((set) => ({
  mode: "chat",
  folderId: null,
  searchText: "",
  setSearchText: (searchText) =>
    set((state) => (state.searchText === searchText ? state : { searchText })),
  setMode: (mode, folderId = null) =>
    set((state) =>
      state.mode === mode && state.folderId === folderId ? state : { mode, folderId },
    ),
}));

let opener: ((mode: NewScreenMode, folderId: string | null) => void) | null = null;

/** Lets the chat layout open the New screen for anything that asks. */
export function registerNewScreenOpener(open: typeof opener) {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Opens the New screen, set to `mode`; a page opened from it goes into `folderId` when given. */
export function openNewScreen(mode: NewScreenMode, folderId: string | null = null) {
  opener?.(mode, folderId);
}
