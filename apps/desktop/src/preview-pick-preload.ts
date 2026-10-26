import { contextBridge, ipcRenderer } from "electron";

import { PASSKEY_BRIDGE_ARGUMENT } from "./preview/GuestProtocol.ts";
import { installPasskeyBridge } from "./preview/PasskeyBridge.ts";
import { forwardPageSwipes, ROME_TAB_ARGUMENT } from "./ardia/PageGestures.ts";
import {
  isSignInLocation,
  presentPageAsFirefox,
  SIGN_IN_PERSONA_ARGUMENT,
} from "./ardia/SignInPersona.ts";
import "./preview/PickPreload.ts";

// Electron hands webPreferences.additionalArguments to sandboxed preloads in process.argv.
if (process.argv.includes(PASSKEY_BRIDGE_ARGUMENT)) {
  installPasskeyBridge((channel, publicKey) => ipcRenderer.invoke(channel, publicKey));
}

// Browser tabs on Google's sign-in pages: hide Chromium before the page's scripts run.
const persona = process.argv.find((argument) =>
  argument.startsWith(`${SIGN_IN_PERSONA_ARGUMENT}=`),
);
if (persona && isSignInLocation(window.location)) {
  contextBridge.executeInMainWorld({
    func: presentPageAsFirefox,
    args: [persona.slice(SIGN_IN_PERSONA_ARGUMENT.length + 1)],
  });
}

// Browser tabs: two-finger swipes go back and forward, so the app hears them.
if (process.argv.includes(ROME_TAB_ARGUMENT)) {
  forwardPageSwipes((channel, payload) => ipcRenderer.sendToHost(channel, payload));
}
