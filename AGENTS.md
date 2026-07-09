# AGENTS.md

Guidance for AI coding agents working on flobro-app. Human docs live in README.md
and CONTRIBUTING.md; this file is for you.

## Project

Flobro desktop app for Mac and Windows, built with Tauri 2 (Rust + system webview).

src/ holds the launcher and settings UI (plain HTML/CSS/JS, no framework; translations in src/i18n.js). src-tauri/src/lib.rs holds all commands, deep-link handling and analytics. src-tauri/src/toolbar.js is injected into every float window.

## Setup

Install Rust via https://rustup.rs plus the Tauri prerequisites for your OS (https://tauri.app/start/prerequisites/), then `cargo install tauri-cli --version "^2"` and run `npm install` once to activate git hooks and dev tooling.

## Commands

- Run locally: `cargo tauri dev`
- Build: `cargo tauri build`
- Lint: `npm run lint` (Biome). Auto-fix: `npm run lint:fix`
- Tests: cargo check inside src-tauri/ plus `npm run lint` for the frontend

## Code style

- Biome is the formatter and linter: 2-space indent, single quotes, semicolons, line width 100. Do not hand-format against it.
- Plain JavaScript only, no frameworks and no build step. Keep it that way.
- All user-facing strings must exist in BOTH English and Dutch. English is the source language.
- Rust: `cargo fmt` formatting is mandatory; the pre-commit hook runs `cargo fmt --check`. Keep commands in `src-tauri/src/lib.rs` small and synchronous unless they need `async`.

## Commits and PRs

- Conventional Commits are enforced by a commit-msg hook: `<type>(<scope>): <description>` with types build/chore/ci/docs/feat/fix/perf/refactor/revert/style/test.
- The changelog is generated from commits (commitizen + Keep a Changelog). Write commit descriptions that read well as release notes.
- Never commit secrets. Analytics keys are public-by-design PostHog project keys, but Apple signing secrets live only in GitHub Actions secrets.

## Boundaries

- Do not add cookies, fingerprinting or any tracking beyond the existing hostname-only PostHog events; the privacy page (flobro.app/privacy.html) is a promise, not decoration.
- Do not add dependencies without a very good reason; the project's identity is being lightweight.
