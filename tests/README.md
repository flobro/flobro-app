# Regression suite

Runs `src-tauri/src/toolbar.js` in a real WKWebView, injected as a user script
at document start, which is exactly how `initialization_script` hands it to a
float window. Fixture pages reproduce the hostile behaviour of the sites that
broke the toolbar, so the specs stay deterministic and offline.

The engine matters here. The jsdom repro attached to #2 passed while the
toolbar was still completely dead on YouTube, because jsdom has no Trusted
Types, no CSP and no hit testing. Anything that replaces this harness has to
keep running on a shipped engine.

## Running

```sh
npm test                     # every fixture
npm test -- --only hotkeys   # one fixture
npm test -- --live           # the same smoke specs against the real sites
```

`--live` hits youtube.com, twitch.tv, tradingview.com and two ordinary sites.
It needs the network, it breaks when those sites change, and CI does not run
it. Use it to confirm a fixture still reflects reality.

Requires macOS with Swift (Xcode command line tools). There is no Windows
harness yet, so WebView2 differences are not covered.

## Layout

| file | what it is |
| --- | --- |
| `run.swift` | the harness: boots a webview per fixture, injects, collects results |
| `support.js` | test-only shims and the spec registry, injected before the toolbar |
| `suite.js` | the specs |
| `fixtures/*.html` | one page per hostile behaviour, naming itself with `<meta name="flobro-fixture">` |

## Adding coverage

Add a fixture page, name it with `<meta name="flobro-fixture" content="my-case">`,
then register specs against that name:

```js
spec('my-case', 'does the thing', async () => {
  hover(5);
  assert(invoked('float_close'), 'nothing happened');
});
```

Use `spec('common', ...)` for something every page should satisfy. Use
`gated(issue, ...)` for behaviour that is still broken: the spec runs, fails,
and names the issue that has to land before it can pass.

## What the shims change

Three things differ from a real float window, all in `support.js`:

- The toolbar's shadow root is closed in production; the harness opens it so
  specs can reach the bar.
- Tauri's IPC is stubbed and recorded, so `float_close` and friends are
  observable instead of moving a real window.
- The reveal transition is pinned off, because it only advances while the
  window is actually on screen.

## Known limits

- The harness is an unsigned, unbundled binary. `passkey` probes what the
  webview offers by default, so confirming a fix for #6 needs a signed build
  as well.
- macOS only.
