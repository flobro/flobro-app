# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are
generated from [Conventional Commits](https://www.conventionalcommits.org)
using [commitizen](https://commitizen-tools.github.io/commitizen/) (`cz bump`).

## [Unreleased]

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

[Unreleased]: https://github.com/flobro/flobro-app/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/flobro/flobro-app/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/flobro/flobro-app/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/flobro/flobro-app/releases/tag/v1.0.0
