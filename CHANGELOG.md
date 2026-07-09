# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are
generated from [Conventional Commits](https://www.conventionalcommits.org)
using [commitizen](https://commitizen-tools.github.io/commitizen/) (`cz bump`).

## [Unreleased]

## [1.0.0] - 2026-07-09

### Added

- Complete rebuild of the discontinued Flobro Chrome App as a native Mac and Windows app on Tauri 2
- Frameless always-on-top float windows with a hover-only toolbar (zoom, 16:9 snap, pin, minimize, settings, close)
- Launcher with recent pages and a settings window (default page, stay-on-top, recents, analytics opt-out)
- flobro:// deep link with single-instance handling, used by the Chrome extension
- English and Dutch UI, system-locale aware
- Privacy-friendly, hostname-only usage stats via PostHog EU with opt-out
- Signed and notarized macOS builds plus Windows NSIS installer via GitHub Actions

[Unreleased]: https://github.com/flobro/flobro-app/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/flobro/flobro-app/releases/tag/v1.0.0
