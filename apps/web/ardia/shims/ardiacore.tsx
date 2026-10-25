import type { FaviconImage } from "@ardia-real/ardiacore";
import { provideNativeModule } from "./expo-modules-core";
import { knownFavicon } from "./web/webviewPool";

export * from "@ardia-real/ardiacore";
export {
  devPagerState,
  pagerState,
  selectPager,
  stepPager,
  SwipeArea,
  switchPager,
} from "./web/Pager";
export { WebView } from "./web/WebView";

provideNativeModule("ArdiaCEF", {
  engineCall: async (name: string) =>
    JSON.stringify({ error: `${name} is not available in T3 Code` }),
  tabStrips: async () => ({ rev: 0, cmd: null, strips: [] }),
  // Tab sleeping sizes itself from this. A renderer can't see battery or memory
  // pressure, and `deviceMemory` is capped at 8 GB, so it errs towards sleeping.
  systemState: async () => ({
    onBattery: false,
    batteryLevel: null,
    lowPowerMode: false,
    memoryPressure: "normal",
    physicalMemory: ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) * 2 ** 30,
  }),
});
provideNativeModule("ArdiaExtensions", {
  list: async () => ({ extensions: [] }),
  searchEngineList: async () => ({ list: null }),
});

const siteFavicon = (page: string) => {
  try {
    const { protocol, origin } = new URL(page);
    return protocol === "http:" || protocol === "https:" ? `${origin}/favicon.ico` : null;
  } catch {
    return null;
  }
};

export async function faviconsFor(_profile: string, pages: string[], _icons: string[] = []) {
  const found = pages.flatMap((page) => {
    const uri = knownFavicon(page) ?? siteFavicon(page);
    return uri ? [[page, { uri, icon: uri }] as const] : [];
  });
  return { pages: new Map(found), icons: new Map<string, string>() };
}

export async function fetchFavicon(
  url: string,
  _profile: string,
  _page?: string,
): Promise<FaviconImage | null> {
  return { uri: url, width: 32, height: 32 };
}
