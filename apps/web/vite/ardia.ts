import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite-plus";

// Builds Ardia's browser UI (vendor/ardia, React Native for macOS) for the DOM,
// the way Ardia's own apps/demo does: react-native resolves to react-native-web
// plus the shims in apps/web/ardia, and Ardia's native modules to web stand-ins.
// Everything here is scoped to Ardia's files so the rest of the app builds as before.

const dir = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const ardiaRepo = dir("../../../vendor/ardia/");
const integration = dir("../ardia/");
const shims = `${integration}shims/`;
const browserSrc = `${ardiaRepo}apps/browser/src/`;
const reactNativeWeb = createRequire(import.meta.url)
  .resolve("react-native-web/package.json")
  .replace(/[\\/]package\.json$/, "");

const REAL_PACKAGES: Record<string, string> = {
  shell: "packages/shell/src/index.tsx",
  ardiacore: "packages/ardiacore/src/index.ts",
  shaders: "packages/shaders/src/index.tsx",
  sync: "packages/sync/src/index.ts",
  import: "packages/import/src/index.ts",
};

const LAZY_COMPONENTS: Record<string, string[]> = {
  "components/settings/UtilityWindow.tsx": ["UtilityWindow"],
  "components/onboarding/OnboardingOverlay.tsx": ["OnboardingOverlay"],
  "components/pages/InternalPage.tsx": ["InternalPage"],
  "components/extensions/ExtensionOverlays.tsx": ["ExtensionOverlays", "InstallDialogHost"],
  "components/extensions/SidePanel.tsx": ["ExtensionSidePanel"],
  "components/bookmarks/BookmarkDialog.tsx": ["BookmarkDialog"],
  "components/bookmarks/EditBookmarkDialog.tsx": ["EditBookmarkDialog"],
  "components/littleArdia/LittleArdiaWindow.tsx": ["LittleArdiaWindow"],
};
// Ardia modules T3 Code replaces with its own version, which can still import the
// original through ORIGINAL_QUERY to wrap it.
const OVERRIDES: Record<string, string> = {
  "components/layout/SidebarDock.tsx": "overrides/SidebarDock.tsx",
  "components/layout/windowLayout.ts": "overrides/windowLayout.ts",
  "components/omnibox/newTabBar.ts": "overrides/newTabBar.ts",
  "components/omnibox/open.ts": "overrides/omniboxOpen.ts",
  "components/sidebar/actions.ts": "overrides/sidebarActions.ts",
};
const overrides = new Map(
  Object.entries(OVERRIDES).map(([file, replacement]) => [
    `${browserSrc}${file}`,
    `${integration}${replacement}`,
  ]),
);
const ORIGINAL_QUERY = "?ardia-original";

const lazyComponents = new Map(
  Object.entries(LAZY_COMPONENTS).map(([file, names]) => [`${browserSrc}${file}`, names]),
);

const LAZY_PREFIX = "\0ardia-lazy:";
// No script extension, so React Fast Refresh leaves these generated modules alone:
// it would make them import themselves by an id the dev server cannot serve.
const LAZY_SUFFIX = ".ardia-lazy";
const EAGER_QUERY = "?ardia-eager";
const ASSET = /\.(png|jpe?g|gif|webp|svg)$/;
const SCRIPT = /\.(t|j)sx?$/;

const cleanId = (id: string) => id.split("?", 1)[0]!;
const isArdiaFile = (id: string) => {
  const file = cleanId(id);
  return file.startsWith(ardiaRepo) || file.startsWith(integration);
};

export function ardiaPlugins(): Plugin[] {
  const config: Plugin = {
    name: "t3code:ardia-config",
    config: () => ({
      resolve: {
        dedupe: ["react", "react-dom", "react-native-web", "zustand"],
        alias: [
          {
            find: /^react-native\/Libraries\/Animated\/useAnimatedProps$/,
            replacement: `${reactNativeWeb}/dist/vendor/react-native/Animated/useAnimatedProps.js`,
          },
          { find: /^react-native(-macos)?$/, replacement: `${shims}react-native.tsx` },
          { find: /^expo-modules-core$/, replacement: `${shims}expo-modules-core.ts` },
          {
            find: /^@ardia\/(shell|ardiacore|shaders|sync|import)$/,
            replacement: `${shims}$1.tsx`,
          },
          { find: /^@ardia\/core$/, replacement: `${ardiaRepo}packages/core/src/index.ts` },
          { find: /^@ardia\/core\//, replacement: `${ardiaRepo}packages/core/` },
          ...Object.entries(REAL_PACKAGES).map(([name, path]) => ({
            find: new RegExp(`^@ardia-real/${name}$`),
            replacement: `${ardiaRepo}${path}`,
          })),
          { find: /^@ardia-app\//, replacement: browserSrc },
          { find: /^@t3-ardia\/entry$/, replacement: `${integration}entry.tsx` },
        ],
      },
      optimizeDeps: { include: ["react-native-web"] },
    }),
  };

  // Ardia's React Native code uses CommonJS require() for modules and assets.
  const requires: Plugin = {
    name: "t3code:ardia-requires",
    enforce: "pre",
    transform(code, id) {
      if (!SCRIPT.test(cleanId(id)) || !isArdiaFile(id) || !code.includes("require(")) return null;
      const specs: string[] = [];
      const body = code.replace(
        /\brequire\((["'])([^"']+)\1\)/g,
        (_match, _quote, spec: string) => {
          let index = specs.indexOf(spec);
          if (index < 0) index = specs.push(spec) - 1;
          return ASSET.test(spec) ? `__required${index}.default` : `__required${index}`;
        },
      );
      if (!specs.length) return null;
      const imports = specs
        .map((spec, i) => `import * as __required${i} from ${JSON.stringify(spec)};`)
        .join("\n");
      return { code: `${imports}\n${body}`, map: null };
    },
  };

  // Metro defines __DEV__; Ardia's sources read it as a free global.
  const devFlag: Plugin = {
    name: "t3code:ardia-dev-flag",
    enforce: "pre",
    transform(code, id) {
      if (!SCRIPT.test(cleanId(id)) || !isArdiaFile(id) || !code.includes("__DEV__")) return null;
      return { code: code.replace(/\b__DEV__\b/g, "false"), map: null };
    },
  };

  const override: Plugin = {
    name: "t3code:ardia-overrides",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !isArdiaFile(importer) || source.endsWith(ORIGINAL_QUERY)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const replacement = resolved && overrides.get(cleanId(resolved.id));
      if (!replacement || cleanId(importer) === replacement) return null;
      return replacement;
    },
  };

  // Ardia's own words for itself, in text it shows, read as Rome's. Only a bare
  // "Ardia" inside text matches: identifiers such as ArdiaShell are left alone.
  const rename: Plugin = {
    name: "t3code:ardia-rename",
    enforce: "pre",
    transform(code, id) {
      const file = cleanId(id);
      if (!SCRIPT.test(file) || !file.startsWith(browserSrc) || !code.includes("Ardia"))
        return null;
      const renamed = code.replace(/(["'`> ])Ardia(?=[ .,!?'’"`<:]|$)/gm, "$1Rome");
      return renamed === code ? null : { code: renamed, map: null };
    },
  };

  // Windows the panel rarely shows load on first use instead of with the sidebar.
  const lazy: Plugin = {
    name: "t3code:ardia-lazy-components",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || source.endsWith(EAGER_QUERY) || importer.startsWith(LAZY_PREFIX)) {
        return null;
      }
      if (!isArdiaFile(importer)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !lazyComponents.has(resolved.id)) return null;
      return LAZY_PREFIX + resolved.id + LAZY_SUFFIX;
    },
    load(id) {
      if (!id.startsWith(LAZY_PREFIX)) return null;
      const file = id.slice(LAZY_PREFIX.length, -LAZY_SUFFIX.length);
      const names = lazyComponents.get(file)!;
      return [
        `import { createElement, lazy, Suspense } from "react";`,
        `const load = () => import(${JSON.stringify(file + EAGER_QUERY)});`,
        ...names.flatMap((name) => [
          `const Lazy${name} = lazy(() => load().then((m) => ({ default: m.${name} })));`,
          `export function ${name}(props) { return createElement(Suspense, { fallback: null }, createElement(Lazy${name}, props)); }`,
        ]),
      ].join("\n");
    },
  };

  // T3 Code compiles its own components with the React Compiler; Ardia's were
  // written for plain React (refs mutated during render, store reads in callbacks).
  // Runs after the transforms above so the directive stays the first statement.
  const noMemo: Plugin = {
    name: "t3code:ardia-no-memo",
    enforce: "pre",
    transform(code, id) {
      if (!SCRIPT.test(cleanId(id)) || !isArdiaFile(id)) return null;
      return { code: `"use no memo";\n${code}`, map: null };
    },
  };

  // The directive only speaks to the React Compiler; once it has run, drop it so the
  // bundler does not warn about a module-level directive in every Ardia file.
  const dropNoMemo: Plugin = {
    name: "t3code:ardia-drop-no-memo",
    enforce: "post",
    transform(code, id) {
      if (!SCRIPT.test(cleanId(id)) || !isArdiaFile(id)) return null;
      const stripped = code.replace(/^(\s*)["']use no memo["'];?/, "$1");
      return stripped === code ? null : { code: stripped, map: null };
    },
  };

  return [config, requires, devFlag, rename, override, lazy, noMemo, dropNoMemo];
}
