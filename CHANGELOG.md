# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are
generated from [Conventional Commits](https://www.conventionalcommits.org)
using [commitizen](https://commitizen-tools.github.io/commitizen/) (`cz bump`).


[Unreleased]: https://github.com/flobro/flobro-app/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/flobro/flobro-app/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/flobro/flobro-app/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/flobro/flobro-app/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/flobro/flobro-app/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/flobro/flobro-app/releases/tag/v1.0.0

## Unreleased

## v1.2.2 (2026-07-23)

### Fixed

- issue with 'signature verification failed' during updating on macOS

## v1.2.1 (2026-07-21)

### Added

- report update failures and app errors anonymously via PostHog

### Fixed

- register report_error command for ACL permission generation
- show the published release notes instead of the draft placeholder

## v1.2.0 (2026-07-21)

### Added

- clarify onboarding illustrations and allow stepping back
- replace the blank float page with a new-tab page with a hero address bar
- add zoom and 16:9 snap to the View menu
- report manual update checks in a native dialog
- clearer sections in settings screen
- improve macOS menu bar options
- toolbar upgrades, macOS menu and language plumbing
- improve launcher and settings UX

### Fixed

- restrict typed URLs to http and https in the new-tab page and toolbar
- optically raise the toolbar pin and unify the titlebar grab cursor
- make the launcher version label link to the changelog instead of About credits
- put the changelog link where macOS shows it and sharpen the About icon
- center toolbar pin and gear icons and fix dropdown menu font
- register float_new command for ACL permission generation

## v1.1.0 (2026-07-17)

### Added

- release notes modal with What changed link and post-update support nudge
- in-app auto-update via the Tauri updater plugin

### Fixed

- hidden attribute beats flex layouts, banner action order and link hover, website donation icons in the update modal
- switch to the Flobro profile Mollie payment link
- include the app bundle target so macOS updater artifacts are built
- show dynamic app version
- set proper dragging behavior on title bar

### Refactor

- unify sponsor button integration

## v1.0.1 (2026-07-15)

### Fixed

- grant float toolbar commands to remote pages via the ACL

## v1.0.0 (2026-07-10)

### Added

- Complete rebuild of the discontinued Flobro Chrome App as a native Mac and Windows app on Tauri 2
- Frameless always-on-top float windows with a hover-only toolbar (zoom, 16:9 snap, pin, minimize, settings, close)
- Launcher with recent pages and a settings window (default page, stay-on-top, recents, analytics opt-out)
- flobro:// deep link with single-instance handling, used by the Chrome extension
- English and Dutch UI, system-locale aware
- Privacy-friendly, hostname-only usage stats via PostHog EU with opt-out
- Signed and notarized macOS builds plus Windows NSIS installer via GitHub Actions

### Fixed

- skip macos code signing while the Apple secrets are absent
