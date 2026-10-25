import { useEffect, useSyncExternalStore } from "react";
import { UtilityWindow } from "@ardia-app/components/settings/UtilityWindow";
import { IMPORT_WINDOW_ID, isUtilityWindowId } from "@ardia-app/components/settings/windows";
import { useBrowser } from "@ardia-app/store/browser";
import { provideNativeModule } from "../expo-modules-core";
import { noteMissing } from "../missing";

// Native Ardia opens Settings and Import as their own macOS windows. Here they
// float over T3 Code at the size the native windows open at.

const SIZES: Record<string, [number, number]> = {
  settings: [820, 640],
  [IMPORT_WINDOW_ID]: [640, 600],
};

let open: string | null = null;
const watchers = new Set<() => void>();
const publish = (next: string | null) => {
  open = next;
  for (const watch of watchers) watch();
};

provideNativeModule("ArdiaShell", {
  openWindow: async (id: string) => {
    if (isUtilityWindowId(id)) publish(id);
    else noteMissing("ArdiaShell.openWindow");
  },
  closeWindow: async (id: string) => {
    if (id === open) publish(null);
    else if (!isUtilityWindowId(id)) noteMissing("ArdiaShell.closeWindow");
  },
});

export function UtilityWindowHost() {
  const id = useSyncExternalStore(
    (watch) => (watchers.add(watch), () => void watchers.delete(watch)),
    () => open,
  );
  const dark = useBrowser((s) => s.ui.appDark);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      publish(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);
  if (!id) return null;

  const [width, height] = SIZES[id] ?? [640, 600];
  return (
    <div
      onPointerDown={(e) => e.target === e.currentTarget && publish(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "relative",
          display: "flex",
          width: `min(${width}px, calc(100% - 32px))`,
          height: `min(${height}px, calc(100% - 32px))`,
          borderRadius: 12,
          overflow: "hidden",
          background: dark ? "#2A2A2D" : "#FFFFFF",
          boxShadow: "0 12px 40px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(0,0,0,0.25)",
        }}
      >
        <UtilityWindow id={id} />
        <button
          type="button"
          aria-label="Close"
          onClick={() => publish(null)}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            width: 14,
            height: 14,
            padding: 0,
            borderRadius: 7,
            border: "none",
            background: "#FF5F57",
            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.2)",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
