# Rome

Rome is [T3 Code](https://github.com/pingdotgg/t3code) with the [Ardia](https://github.com/mantrakp04/ardia) browser built in: your coding agents and your browser in one window, sharing one sidebar.

- **Chats and tabs together.** Tabs opened while working in a chat belong to it and come back with it. Spaces, pinned tabs and folders work as in Arc.
- **Split view.** Put chats and pages side by side, name the split, and keep it in its space.
- **One New screen.** Cmd+N starts a chat, Cmd+T searches or opens a page.
- **Bring your browsing.** Import spaces, pinned tabs, folders and history from Arc, Dia, Chrome, Brave, Edge, Vivaldi, Comet or Helium.
- **A real browser.** Two-finger swipes go back and forward, extensions install from the Chrome Web Store, and protected media (Spotify, Netflix) plays through Widevine.

Rome works with the agents T3 Code supports (Claude Code, Codex, Cursor, Grok Build, OpenCode and Antigravity) using your own subscriptions. Install and sign in to at least one of them first.

Rome is a personal fork and macOS only for now. It isn't affiliated with T3 Tools or the Ardia project.

## Build from source

You need macOS on Apple Silicon, [Vite+](https://viteplus.dev/guide/) (`curl -fsSL https://vite.plus | bash`) and Node 26.

```bash
git clone --recurse-submodules https://github.com/nawed-clueso/rome.git
cd rome
vp i
```

Run the app in development:

```bash
vp run dev:desktop
```

Set `T3CODE_DESKTOP_HIDDEN=1` to run it invisibly (it still renders, for automated testing), and `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9333` to drive it over the Chrome DevTools Protocol.

Build the app:

```bash
node scripts/build-desktop-artifact.ts --platform mac --target zip --arch arm64 --output-dir release-local
```

The zip in `release-local` holds `Rome.app`. Rome keeps its data in `~/.rome`, apart from T3 Code's.

After installing a build, `scripts/rome-ui-update.sh` updates just the interface in place, without a full build, as long as only `apps/web` changed.

### Protected media

Rome runs on castLabs' [Electron for Content Security](https://github.com/castlabs/electron-releases), which installs Google's Widevine module on first launch. Out of the box it carries castLabs' development signature, which most streaming services refuse. To sign your builds for production, create a free [castLabs EVS](https://github.com/castlabs/electron-releases/wiki/EVS) account:

```bash
python3 -m pip install castlabs-evs
python3 -m castlabs_evs.account signup
```

Builds sign themselves once the account exists. Its sign-in lasts about a month; renew it with `python3 -m castlabs_evs.account reauth`.

## Documentation

T3 Code's documentation applies to Rome's agent side: see [docs](./docs) and the [T3 Code repository](https://github.com/pingdotgg/t3code).

## Security

See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## License

Rome is licensed under the [MIT License](./LICENSE), like T3 Code. It builds in Ardia's browser sources, which are under the Apache License 2.0; see [NOTICE](./NOTICE) for all credits.
