import { desktop, type DesktopDiaOperation } from "../../bridge";
import { provideNativeModule } from "../expo-modules-core";

// Ardia's importer talks to a native module. In T3 Code the only source it can
// reach is Dia, through the desktop app (apps/desktop/src/ardia/DiaImport.ts):
// Dia's open and pinned tabs, per profile. Chromium profiles, Safari, Arc and
// files need native code this build doesn't have, so they aren't listed.

const dia = async (operation: DesktopDiaOperation): Promise<string | null> => {
  if (!desktop?.dia) throw { code: "unsupported", message: "Importing isn't available here" };
  const reply = await desktop.dia(operation);
  if (!reply.ok) throw { code: reply.code, message: reply.message };
  return reply.value == null ? null : JSON.stringify(reply.value);
};

const unsupported = async () => {
  throw { code: "unsupported", message: "Not available in T3 Code" };
};

const DIA_SOURCE = {
  id: "dia",
  name: "Dia",
  family: "automation",
  requiresExport: false,
  needsKeychain: false,
  profiles: [],
};

provideNativeModule("ArdiaImport", {
  listBrowsers: async () => {
    if (!desktop?.dia) return "[]";
    const status = JSON.parse((await dia("status")) ?? "null") as string | null;
    return JSON.stringify(status && status !== "notInstalled" ? [DIA_SOURCE] : []);
  },
  diaAutomationStatus: () => dia("status"),
  requestDiaAutomation: () => dia("status"),
  readDiaTabs: () => dia("read"),
  openDia: () => dia("open"),
  openAutomationSettings: () => dia("openAutomationSettings"),
  cancelImport: () => {},
  forgetUnlockedKeys: () => {},
  isBrowserUnlocked: () => false,
  safariHasFullDiskAccess: () => false,
  discardImported: () => {},
  importData: unsupported,
  unlockBrowser: unsupported,
  writeImported: unsupported,
  listExtensions: async () => "[]",
  importSafariExport: unsupported,
  importSafariDirect: unsupported,
  importBookmarksHTML: unsupported,
  importPasswordsCSV: unsupported,
  chooseImportFile: async () => null,
  openFullDiskAccessSettings: unsupported,
});
