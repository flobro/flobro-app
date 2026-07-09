# CLAUDE.md

Read AGENTS.md in this repo first: it holds the commands, code style and
boundaries. This file adds the working agreements for Claude sessions.

## Working agreements

- Conventional Commits are enforced by the commit-msg hook. Prefer `cz commit`;
  plain `git commit -m "type(scope): description"` also works.
- Run `npm run lint` before committing; the pre-commit hook checks staged files.
- Every user-facing string exists in BOTH English and Dutch. No em dashes in copy.
- Privacy is a product promise: analytics stay hostname-only, PostHog EU,
  opt-out intact. Never add tracking, cookies or third-party requests.
- Releases: `cz bump && git push --tags` (bumps version, updates CHANGELOG.md,
  tags; CI does the rest). Do not hand-edit version numbers or changelog entries.
- Secrets live in GitHub Actions secrets only. The PostHog project key is
  public-by-design and may be committed; Apple signing material may not.

## Publishing

The step-by-step publish sequence for all Flobro repos lives in the project
knowledge (FLOBRO-CONTEXT.md) and in SETUP-GUIDE.md next to the repos.
Ask before doing anything irreversible: publishing releases, store submissions,
DNS or Pages changes.
