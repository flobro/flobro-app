# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are
generated from [Conventional Commits](https://www.conventionalcommits.org)
using [commitizen](https://commitizen-tools.github.io/commitizen/) (`cz bump`).

## [Unreleased]

## [1.2.1] - 2026-07-21

### Added

- Anonymous error reporting: app failures are now reported to PostHog as long as user consented to analytics, with no personally identifiable information.

### Fixed

- Updating from 1.1.0 failed with "The signature verification failed": two release builds ran in parallel for the v1.2.0 tag and uploaded mismatched binaries and signatures.

## [1.2.0] - 2026-07-21

### Added

- Native macOS menu bar, fully localized: Preferences (Cmd+,), New Float Window (Cmd+N), Reload Page (Cmd+R), Check for Updates, Help links and a replayable onboarding tour
- Zoom In, Zoom Out and Actual Size (Cmd+=, Cmd+-, Cmd+0) plus Snap to 16:9 in the View menu, acting on the focused float window and kept in sync with the toolbar
- New float windows open a new-tab page with a large, auto-focused address bar: type or paste a link and press Enter
- A first-run onboarding tour in three short steps, with back navigation
- The version label in the launcher footer opens the changelog of the installed version

### Changed

- Check for Updates now answers in a native dialog and can install the update right from there, whichever window is focused
- The hover toolbar groups zoom, 16:9 snap, new window and settings in a dropdown menu, and follows the app language setting
- The launcher and settings screens are organized into clearer sections
- Clearer onboarding illustrations
- The About window shows a sharp app icon

### Fixed

- URLs typed in the new-tab page and the toolbar URL editor are restricted to http and https, matching the launcher
- The toolbar pin and gear icons are optically centered and the dropdown menu uses the system font instead of a serif fallback
- The title bar and the drag area share the same grab cursor
- Float windows are granted the new-window command through the ACL

## [1.1.0] - 2026-07-17

### Added

- Automatic updates: Flobro checks for a new version on launch and shows a small banner; nothing downloads or installs until you choose Update now. Updates are cryptographically verified before they are installed
- "What changed" in the update banner opens the release notes right in the app
- After an automatic update, Flobro shows the release notes once, with links to support development

### Changed

- Donations now run through the Flobro Mollie profile

### Fixed

- The launcher footer shows the real app version
- The window title is no longer selectable text and dragging the title bar works as expected

## [1.0.1] - 2026-07-15

### Fixed

- Float toolbar buttons (zoom, 16:9 snap, pin, minimize, settings, close) did nothing on remote pages: the app commands are now granted to float windows through the ACL
- The injected toolbar falls back to the Tauri internals when the global API bundle is unavailable and logs failures to the webview console
- Release builds no longer fail on macOS when the Apple signing secrets are absent; signing activates automatically once the secrets exist

## [1.0.0] - 2026-07-10

### Added

- Complete rebuild of the discontinued Flobro Chrome App as a native Mac and Windows app on Tauri 2
- Frameless always-on-top float windows with a hover-only toolbar (zoom, 16:9 snap, pin, minimize, settings, close)
- Launcher with recent pages and a settings window (default page, stay-on-top, recents, analytics opt-out)
- flobro:// deep link with single-instance handling, used by the Chrome extension
- English and Dutch UI, system-locale aware
- Privacy-friendly, hostname-only usage stats via PostHog EU with opt-out
- Signed and notarized macOS builds plus Windows NSIS installer via GitHub Actions

[Unreleased]: https://github.com/flobro/flobro-app/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/flobro/flobro-app/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/flobro/flobro-app/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/flobro/flobro-app/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/flobro/flobro-app/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/flobro/flobro-app/releases/tag/v1.0.0
