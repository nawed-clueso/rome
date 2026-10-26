import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

interface TabMentionState {
  /** The chat each tab was last mentioned in, by browser tab id, as a scoped thread key. */
  readonly mentionedIn: Record<string, string>;
  readonly mention: (tabId: string, threadKey: string) => void;
  readonly forget: (tabId: string) => void;
}

/**
 * Tabs @-mentioned in a chat. A mentioned tab is the chat's to use, as a tab
 * opened from the chat is; a tab mentioned in another chat moves to that one.
 */
export const useTabMentionStore = create<TabMentionState>()(
  persist(
    (set) => ({
      mentionedIn: {},
      mention: (tabId, threadKey) =>
        set((state) =>
          state.mentionedIn[tabId] === threadKey
            ? state
            : { mentionedIn: { ...state.mentionedIn, [tabId]: threadKey } },
        ),
      forget: (tabId) =>
        set((state) => {
          if (!(tabId in state.mentionedIn)) return state;
          const { [tabId]: _, ...rest } = state.mentionedIn;
          return { mentionedIn: rest };
        }),
    }),
    {
      name: "rome:tab-mentions:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ mentionedIn: state.mentionedIn }),
    },
  ),
);
