# Contributing to flobro-app

Great that you want to help! Flobro is a spare-time open source project, so
pull requests are very welcome, especially for
[open issues](https://github.com/flobro/flobro-app/issues).

## Getting started

Install Rust via https://rustup.rs plus the Tauri prerequisites for your OS (https://tauri.app/start/prerequisites/), then `cargo install tauri-cli --version "^2"` and run `npm install` once to activate git hooks and dev tooling.

Run it locally: `cargo tauri dev`

`npm install` also activates the git hooks in `.githooks/` (via the `prepare`
script), which lint staged files and check your commit message format.

## Project layout

src/ holds the launcher and settings UI (plain HTML/CSS/JS, no framework; translations in src/i18n.js). src-tauri/src/lib.rs holds all commands, deep-link handling and analytics. src-tauri/src/toolbar.js is injected into every float window.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org), enforced by
a commit-msg hook. The easiest way to get it right every time is
[commitizen](https://commitizen-tools.github.io/commitizen/):

```bash
pip install commitizen
cz commit        # guided prompt instead of git commit
```

Examples: `feat(toolbar): add 21:9 snap`, `fix: launcher crash on empty URL`,
`docs: clarify build steps`.

The changelog follows [Keep a Changelog](https://keepachangelog.com) and is
generated from these commits with `cz bump` at release time, so well-formed
commits directly become release notes.

## Code style

[Biome](https://biomejs.dev) formats and lints the JS/CSS/JSON. Run
`npm run lint` before pushing, or `npm run lint:fix` to auto-fix.
Rust code is formatted with `cargo fmt` (checked by the pre-commit hook).

## Pull requests

1. Fork, create a branch from `main` (`feat/…` or `fix/…`)
2. Keep PRs focused: one topic per PR
3. Make sure `npm run lint` passes and the app/site still works
4. Describe *why*, not just *what*, in the PR description

## Translations

English is the source language, Dutch is maintained alongside it. New
languages are chosen based on anonymous locale statistics; if you want to add
one, open an issue first so we can wire it up together.

## Questions

Open an issue. That is the one place for everything: bugs, ideas, questions.
