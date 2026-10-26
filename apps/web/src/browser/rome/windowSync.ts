import { useSplitViewStore } from "../../splitViewStore";
import { useAddressBarStore } from "./addressBarStore";
import { useFolderStore } from "./folderStore";
import { useTabMentionStore } from "./tabMentionStore";
import { useThreadSpaceStore } from "./threadSpaceStore";

// Each of Rome's app windows keeps its own copy of these stores. When another
// window saves one, this window takes in the saved copy.
const SHARED_STORES = [
  useFolderStore,
  useSplitViewStore,
  useThreadSpaceStore,
  useAddressBarStore,
  useTabMentionStore,
];

let syncing = false;
export function syncStoresAcrossWindows() {
  if (syncing || typeof window === "undefined") return;
  syncing = true;
  window.addEventListener("storage", (event) => {
    for (const store of SHARED_STORES) {
      if (event.key === store.persist.getOptions().name) void store.persist.rehydrate();
    }
  });
}
