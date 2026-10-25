// Google's sign-in pages turn away embedded Chromium however it names itself:
// they check for parts of Chrome that Electron doesn't have. They let Firefox in,
// so on those pages alone tabs present as Firefox, as other Electron browsers do.
// Shared by the main process, which sets the identity, and the tabs' preload,
// which hides Chromium's own objects from the page.

export const SIGN_IN_HOSTS: ReadonlySet<string> = new Set([
  "accounts.google.com",
  "accounts.youtube.com",
]);

/** Carries the Firefox user agent to a tab's preload, as `<argument>=<user agent>`. */
export const SIGN_IN_PERSONA_ARGUMENT = "--rome-sign-in-persona";

/**
 * Runs in the page's own world before its scripts, on sign-in pages only: the
 * page sees what real Firefox shows, and none of Chrome's own objects
 * (window.chrome, navigator.userAgentData), whose presence gives Chromium away.
 * Self-contained, as Electron copies it into the page.
 */
export function presentPageAsFirefox(userAgent: string): void {
  const define = (target: object, name: string, value: unknown) => {
    try {
      Object.defineProperty(target, name, { get: () => value, configurable: true });
    } catch {
      // A page that locked the property keeps it.
    }
  };
  define(Navigator.prototype, "userAgent", userAgent);
  // Firefox gives only the platform's first word here: "5.0 (Macintosh)".
  const platform = /\(([^;)]+)/.exec(userAgent)?.[1] ?? "";
  define(Navigator.prototype, "appVersion", `5.0 (${platform})`);
  define(Navigator.prototype, "vendor", "");
  define(Navigator.prototype, "userAgentData", undefined);
  try {
    delete (window as { chrome?: unknown }).chrome;
  } catch {
    // Non-configurable in some builds; the definition below covers it.
  }
  define(window, "chrome", undefined);
}

export const isSignInLocation = (location: { protocol: string; hostname: string }): boolean =>
  location.protocol === "https:" && SIGN_IN_HOSTS.has(location.hostname);
