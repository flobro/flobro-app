<p align="center">
  <img src=".github/promo.png" alt="Flobro, floating browser window" width="700">
</p>

# Flobro

*Floating browser window* for Mac and Windows, built with [Tauri 2](https://tauri.app).

Float any webpage in a frameless, always-on-top window. No interface at all until you move your mouse to the top edge, where a toolbar appears with zoom, 16:9 snap, pin, minimize, settings and close.

## Architecture

```
src/                  Launcher + settings UI (plain HTML/CSS/JS, no framework)
  i18n.js             UI translations (English primary, Dutch second)
src-tauri/
  src/lib.rs          Commands, deep link handling, privacy-friendly analytics
  src/toolbar.js      Hover toolbar injected into every float window (shadow DOM)
  capabilities/
    default.json      IPC for local launcher/settings windows
    float.json        Minimal IPC surface for remote pages in float windows
```

Each floating window loads the target URL directly in the OS webview. The toolbar is an initialization script injected at document start. It lives in a closed shadow root so page CSS can't touch it, and it only talks to a small set of `float_*` commands.

> Security note: the `float` capability grants remote pages access to app IPC. The exposed surface is deliberately tiny (window controls only), but review `capabilities/float.json` before adding commands.

## Deep links

The app registers the `flobro://` URL scheme. The Chrome extension (and anything else) can hand a page to the app:

```
flobro://open?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D...
```

Single-instance handling makes sure the link lands in the running app instead of starting a second one.

## Analytics

Usage stats go to PostHog (EU cloud) and are deliberately minimal:

- events: `app_opened`, `float_opened`
- `float_opened` carries only the **hostname** (like `youtube.com`), never the full URL
- no IP storage (`$ip: null`), random anonymous id, no other profiling
- users switch it off in Settings ("Share anonymous usage stats")

Set `POSTHOG_KEY` in `src-tauri/src/lib.rs` to your project key. While the placeholder is in place, nothing is sent at all.

## Languages

English is primary, Dutch is included. UI strings live in `src/i18n.js` and `toolbar.js`; add languages there as usage data shows demand.

## Develop

Prerequisites: [Rust](https://rustup.rs) plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
cargo install tauri-cli --version "^2"
cargo tauri dev
```

## Build installers

```bash
cargo tauri build            # produces .dmg (macOS) or .exe/NSIS (Windows)
```

Or push a tag; the GitHub Actions workflow builds a universal macOS .dmg and a Windows NSIS installer and attaches them to a draft release:

```bash
git tag v1.0.0 && git push --tags
```

## Settings

Stored as JSON in the platform config dir (e.g. `~/Library/Application Support/app.flobro.desktop/settings.json`). Default page, open-on-launch, stay-on-top default, recent pages, and the analytics opt-out.

## License

MIT.
