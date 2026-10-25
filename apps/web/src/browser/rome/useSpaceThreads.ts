import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useShallow } from "zustand/react/shallow";

import { useBrowserModel } from "./browserStore";
import { spaceOfThread, useThreadSpaceStore } from "./threadSpaceStore";

const NO_SPACES: readonly string[] = [];

/** The threads of the space the browser is in; all of them until the browser has loaded. */
export function useSpaceThreads<T extends Pick<EnvironmentThreadShell, "environmentId" | "id">>(
  threads: readonly T[],
): readonly T[] {
  const spaceIds = useBrowserModel(
    useShallow((state) => state.browser?.spaces.map((space) => space.id) ?? NO_SPACES),
  );
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const spaceOf = useThreadSpaceStore((state) => state.spaceOf);
  if (!spaceId || spaceIds.length < 2) return threads;
  return threads.filter(
    (thread) =>
      spaceOfThread(
        spaceOf,
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        spaceIds,
      ) === spaceId,
  );
}
