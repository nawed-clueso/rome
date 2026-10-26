import { create } from "zustand";

// How long a tab shows the agent at work after its last input.
const DRIVING_MS = 5_000;

const timers = new Map<string, number>();

/** Tabs the agent typed, clicked, navigated or ran script in a moment ago. */
export const useAgentActivityStore = create<{ readonly driving: Record<string, true> }>()(() => ({
  driving: {},
}));

/** The agent just worked in the tab; it shows so for a few seconds. */
export function noteAgentInput(tabId: string) {
  window.clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    window.setTimeout(() => {
      timers.delete(tabId);
      useAgentActivityStore.setState(({ driving }) => {
        const { [tabId]: _, ...rest } = driving;
        return { driving: rest };
      });
    }, DRIVING_MS),
  );
  if (useAgentActivityStore.getState().driving[tabId]) return;
  useAgentActivityStore.setState(({ driving }) => ({ driving: { ...driving, [tabId]: true } }));
}

export const useAgentDriving = (tabId: string) =>
  useAgentActivityStore((state) => state.driving[tabId] === true);
