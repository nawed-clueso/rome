import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

interface ThreadSpaceState {
  /** The space each thread lives in, by scoped thread key. */
  readonly spaceOf: Record<string, string>;
  readonly assign: (threadKey: string, spaceId: string) => void;
}

/** Threads belong to a browser space; one never placed lives in the first space. */
export const useThreadSpaceStore = create<ThreadSpaceState>()(
  persist(
    (set) => ({
      spaceOf: {},
      assign: (threadKey, spaceId) =>
        set((state) =>
          state.spaceOf[threadKey] === spaceId
            ? state
            : { spaceOf: { ...state.spaceOf, [threadKey]: spaceId } },
        ),
    }),
    {
      name: "rome:thread-spaces:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ spaceOf: state.spaceOf }),
    },
  ),
);

/** The space a thread shows in, given the spaces that exist. */
export function spaceOfThread(
  spaceOf: Record<string, string>,
  threadKey: string,
  spaceIds: readonly string[],
): string | null {
  const placed = spaceOf[threadKey];
  return placed && spaceIds.includes(placed) ? placed : (spaceIds[0] ?? null);
}
