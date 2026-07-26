# Passkeys in float windows

Passkey sign-in does not work in a float window today. The cause is a gate on
Apple's side, not anything in Flobro's code, and clearing it needs a request
to Apple rather than a patch.

## What we measured

A real float window on https://webauthn.io reports:

| check | result |
| --- | --- |
| `window.PublicKeyCredential` | present |
| `navigator.credentials.get` | present |
| `isUserVerifyingPlatformAuthenticatorAvailable()` | **false** |
| `isConditionalMediationAvailable()` | **false** |
| `navigator.credentials.get({publicKey})` | rejects, `NotAllowedError` |

So the API is there, but no authenticator is offered, which means no prompt
can ever appear. The same numbers come out of the test harness, so this is the
app's behaviour rather than a quirk of the test rig.

## Why

WKWebView only offers a platform authenticator (Touch ID, and passkeys stored
in Apple Passwords) to an app holding this entitlement:

```
com.apple.developer.web-browser.public-key-credential
```

It is a managed entitlement, granted per app to apps that really are
browsers. Chrome and Firefox both carry it on macOS, which is how they offer
Apple Passwords passkeys; Brave on this machine carries it too, which is how
the key name above was confirmed.

The entitlement lets an app make registration and assertion requests for any
relying party identifier. That is the whole point: a browser acts on behalf of
whatever site it happens to be showing, so it cannot be limited to relying
parties it owns the way an ordinary app is.

## What is already in the repo

- `src-tauri/Entitlements.plist` holds the entitlement.
- `src-tauri/tauri.passkeys.conf.json` is an overlay that wires it into a
  build.

It is deliberately **not** in `tauri.conf.json`. A build signed with an
entitlement the team has not been granted does not launch at all: ad-hoc
signing the dev binary with it was enough to make macOS refuse the process,
with nothing printed on stderr. Wiring it into the default build before the
grant arrives would break every release.

## What to do

1. **Request the entitlement from Apple.** Sign in to the Apple Developer
   account and file a request for
   `com.apple.developer.web-browser.public-key-credential`, describing Flobro
   as what it is: an app that displays arbitrary third-party sites in a
   webview, which therefore needs to make WebAuthn requests on their behalf.
   Apple reviews these individually, since the entitlement is meant for
   browsers. Expect a wait and possibly follow-up questions.
2. **Regenerate the provisioning profile** once granted, so the profile
   carries the entitlement, and make it available to the signing step in CI
   (alongside the existing `APPLE_*` secrets).
3. **Build with the overlay:**

   ```sh
   cargo tauri build --config tauri.passkeys.conf.json
   ```

   Once the grant is in place and CI signs with the new profile, fold the
   `entitlements` key into `tauri.conf.json` and delete the overlay.
4. **Verify on a signed build**, not in the harness and not in `cargo tauri
   dev`: open a float window on https://webauthn.io and check that
   `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
   resolves `true`, then complete a real sign-in.
5. **Promote the pending spec.** `tests/suite.js` has a `gated(6, ...)` spec
   asserting exactly that call. When it passes, the runner says so; change
   `gated(6, ...)` to `spec(...)` and close #6.

## Windows

The Apple entitlement is macOS-only and nothing in it applies to Windows.

WebView2 has no equivalent gate, and Microsoft describes it as capable of
Windows Hello and FIDO key sign-in, so passkeys may already work there. That
is unverified: there are reports of the Windows Hello prompt not appearing for
embedded WebView2 hosts, and Flobro's own behaviour has not been checked on
Windows at all.

It is also untested in the automated sense. The regression suite drives
WKWebView and only runs on macOS, so the `passkey` fixture says nothing about
Windows. Covering it would need a WebView2 harness running the same probes.
