# Releasing flobro-app

Developer documentation. Releases are built by GitHub Actions and published by a human. Nothing goes live from a push to `main`; only pushing a `v*` tag triggers a build.

## Prerequisites (already configured, listed for reference)

Repository secrets in Settings, Secrets and variables, Actions:

- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`: Developer ID signing and notarization for macOS.
- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the Tauri updater key. Signs the update payloads and makes the build emit `latest.json`. If you ever lose this key, existing installs can no longer verify updates; keep the backup safe.

Locally: `pip install commitizen` and a `node_modules` installed on the platform you commit from (`rm -rf node_modules && npm install` after switching machines, or the Biome pre-commit hook fails with a missing platform binary).

## Release steps

1. Land all work on `main` as Conventional Commits (`cz commit`). Pushing `main` is always safe; it never releases.
2. Bump and tag:

   ```bash
   cz bump          # picks the next semver from the commits, updates
                    # package.json, tauri.conf.json, Cargo.toml (version_files),
                    # updates CHANGELOG.md and creates the vX.Y.Z tag
   ```

   Check `CHANGELOG.md` afterwards: cz does not follow the Keep a Changelog layout, so tidy the new section by hand. Also keep `Cargo.lock`'s `flobro` entry in sync (a local `cargo tauri dev` or `cargo update -p flobro` does it).
3. Push: `git push && git push --tags`. CI builds a signed, notarized macOS universal build and a Windows installer into a **draft** release (10 to 20 minutes).
4. Verify the draft on the releases page. It must contain six uploaded assets:

   | Asset | What it is |
   |---|---|
   | `Flobro_x.y.z_universal.dmg` | macOS installer for humans (drag to Applications) |
   | `Flobro.app.tar.gz` | macOS **update payload**: the .app bundle packed into one file; the updater extracts it over the installed app |
   | `Flobro.app.tar.gz.sig` | updater signature (Tauri key, minisign) of the tar.gz |
   | `Flobro_x.y.z_x64-setup.exe` | Windows installer for humans, reused as the Windows update payload |
   | `Flobro_x.y.z_x64-setup.exe.sig` | updater signature of the exe |
   | `latest.json` | generated update manifest: version plus per-platform URL and signature; the app polls this via `releases/latest/download/latest.json` |

   Missing `.app.tar.gz`? The `app` target is missing from `bundle.targets` in `tauri.conf.json`. Missing `.sig`/`latest.json`? The `TAURI_SIGNING_*` secrets were not available to the build.
5. Write human release notes in the draft (the workflow only puts a placeholder).
6. **Publish.** Two consequences, so look before you click: releases are immutable (assets can never change; a mistake means a new version), and publishing makes `latest.json` live, which offers the update to every installed app on its next launch. The website download buttons switch to the new installers automatically.

## Troubleshooting

- **Build fails on macOS with "failed to import keychain certificate"**: an `APPLE_*` secret is empty or malformed. The workflow only exports non-empty secrets, so this normally cannot happen; check the secret values.
- **Buttons or IPC dead in float windows after adding a command**: every app command must be declared in `src-tauri/build.rs` (AppManifest) and granted in `src-tauri/capabilities/` (float.json for remote pages). See the note in README.md.
- **Draft contains stale assets from a failed attempt**: tauri-action reuses the draft for the same tag and replaces assets; if in doubt, discard the draft and re-run the workflow.
