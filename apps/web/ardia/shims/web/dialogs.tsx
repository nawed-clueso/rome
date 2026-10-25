import { useEffect, useRef, useSyncExternalStore } from "react";
import { useBrowser } from "@ardia-app/store/browser";

// Electron implements neither window.prompt nor a blocking window.confirm, so
// Ardia's text prompts and confirmations render here instead.

type Request =
  | {
      kind: "prompt";
      title: string;
      message?: string;
      value: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      message?: string;
      confirmLabel?: string;
      resolve: (confirmed: boolean) => void;
    };

let current: Request | null = null;
const watchers = new Set<() => void>();
const publish = (next: Request | null) => {
  current = next;
  for (const watch of watchers) watch();
};

export function askText(
  title: string,
  message: string | undefined,
  value: string,
): Promise<string | null> {
  if (current) settle(null);
  return new Promise((resolve) => publish({ kind: "prompt", title, message, value, resolve }));
}

export function askConfirm(
  title: string,
  message: string | undefined,
  confirmLabel?: string,
): Promise<boolean> {
  if (current) settle(null);
  return new Promise((resolve) =>
    publish({ kind: "confirm", title, message, confirmLabel, resolve }),
  );
}

function settle(answer: string | null | boolean) {
  const request = current;
  if (!request) return;
  publish(null);
  if (request.kind === "prompt") request.resolve(typeof answer === "string" ? answer : null);
  else request.resolve(answer === true);
}

export function DialogHost() {
  const request = useSyncExternalStore(
    (watch) => (watchers.add(watch), () => void watchers.delete(watch)),
    () => current,
  );
  const dark = useBrowser((s) => s.ui.appDark);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [request]);
  if (!request) return null;

  const fg = dark ? "#F2F2F3" : "#1D1D1F";
  const muted = dark ? "rgba(242,242,243,0.65)" : "rgba(29,29,31,0.6)";
  const submit = () => settle(request.kind === "prompt" ? (input.current?.value ?? "") : true);
  const button = (primary: boolean) => ({
    font: "inherit",
    fontSize: 13,
    padding: "5px 14px",
    borderRadius: 7,
    border: primary ? "none" : `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"}`,
    background: primary ? "#0A84FF" : "transparent",
    color: primary ? "#FFFFFF" : fg,
    cursor: "pointer",
  });

  return (
    <div
      onPointerDown={(e) => e.target === e.currentTarget && settle(null)}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 96,
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          settle(null);
        }}
        style={{
          width: 300,
          padding: 16,
          borderRadius: 12,
          background: dark ? "#2A2A2D" : "#FFFFFF",
          color: fg,
          boxShadow: "0 12px 40px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(0,0,0,0.25)",
          font: '13px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: request.message ? 4 : 10 }}>
          {request.title}
        </div>
        {request.message ? (
          <div style={{ color: muted, marginBottom: 10 }}>{request.message}</div>
        ) : null}
        {request.kind === "prompt" ? (
          <input
            ref={input}
            defaultValue={request.value}
            style={{
              width: "100%",
              boxSizing: "border-box",
              font: "inherit",
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
              background: dark ? "#1E1E20" : "#FFFFFF",
              color: fg,
              outline: "none",
            }}
          />
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" style={button(false)} onClick={() => settle(null)}>
            Cancel
          </button>
          <button type="submit" style={button(true)}>
            {request.kind === "confirm" ? (request.confirmLabel ?? "OK") : "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}
