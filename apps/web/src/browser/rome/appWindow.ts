/**
 * Whether this page is Rome's main window. Other browser windows (opened with
 * "Open in new window") show their own spaces, and leave app-wide work such as
 * snapshots to the main window.
 */
export const isMainAppWindow =
  typeof location === "undefined" || !new URLSearchParams(location.search).has("romeWindow");
