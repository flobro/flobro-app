/**
 * The regression specs. Each fixture page names itself with
 * <meta name="flobro-fixture" content="..."> and gets the specs registered
 * for that name, plus every 'common' spec.
 *
 * Specs registered with gated() describe behaviour that is still broken and
 * name the issue that has to land before they can pass. They fail the run on
 * purpose: that is the gate.
 */
(() => {
  'use strict';

  const t = window.__flobroTest;
  const { spec, gated, assert, assertIs, q, host, invoked, mouse, key, hover, summon, waitFor } = t;

  /* --------------------------- every fixture --------------------------- */

  spec('common', 'injects the toolbar host into the page', async () => {
    const el = host();
    assert(el, 'no <flobro-toolbar> in the document');
    assert(el.isConnected, 'the toolbar host is detached');
    assertIs(
      document.documentElement.lastElementChild,
      el,
      'the toolbar is not the last child of <html>',
    );
  });

  spec('common', 'reveals the bar when the pointer lingers at the top edge', async () => {
    const bar = q('.bar');
    assert(!bar.classList.contains('visible'), 'the bar started out visible');
    await summon();
    assert(bar.classList.contains('visible'), 'lingering at the top edge did not reveal the bar');
    const rect = bar.getBoundingClientRect();
    assertIs(Math.round(rect.width), innerWidth, 'the bar does not span the window');
    assertIs(Math.round(rect.height), 38, 'unexpected bar height');
  });

  spec('common', 'takes the pointer at the top edge, ahead of the page', async () => {
    await summon();
    const hit = document.elementFromPoint(Math.round(innerWidth / 2), 12);
    assertIs(hit, host(), 'the page, not the toolbar, owns the top edge');
  });

  spec('common', 'drags the window when the titlebar is pressed and moved', async () => {
    const title = q('.title');
    await summon();
    mouse(title, 'mousedown', { button: 0, clientX: 100, clientY: 12 });
    mouse(title, 'mousemove', { clientX: 140, clientY: 12 });
    assert(invoked('plugin:window|start_dragging'), 'dragging the titlebar started no window drag');
  });

  spec('common', 'closes and minimizes the window from the toolbar', async () => {
    await summon();
    mouse(q('.close'), 'click', { button: 0 });
    assert(invoked('float_close'), 'the close button did not ask the app to close');
    mouse(q('.min'), 'click', { button: 0 });
    assert(invoked('float_minimize'), 'the minimize button did not ask the app to minimize');
  });

  spec('common', 'shows the page title in the toolbar', async () => {
    assertIs(q('.title .text').textContent, document.title, 'the toolbar title is out of sync');
  });

  /* A pointer on its way to the site's own header must not summon anything:
   * the toolbar covering that header is what #1 was about. */
  spec('common', 'ignores a pointer passing through the top edge', async () => {
    hover(3);
    hover(200);
    await t.sleep(500);
    assert(!q('.bar').classList.contains('visible'), 'a pass-through opened the bar');
  });

  spec('common', 'leaves the top edge to the page until the bar is summoned', async () => {
    const hit = document.elementFromPoint(Math.round(innerWidth / 2), 12);
    assert(hit !== host(), 'the toolbar owns the top edge while it is hidden');
  });

  spec('common', 'dismisses the bar on Escape', async () => {
    await summon();
    assert(q('.bar').classList.contains('visible'), 'the bar did not open');
    key(document.body, 'Escape');
    assert(!q('.bar').classList.contains('visible'), 'Escape did not dismiss the bar');
  });

  /* Cmd+W / Ctrl+W (#5). A float window has no titlebar to close from. */
  spec('common', 'closes the window with the close shortcut', async () => {
    const mac = /mac/i.test(navigator.platform || navigator.userAgent || '');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: mac,
        ctrlKey: !mac,
        bubbles: true,
        composed: true,
      }),
    );
    assert(invoked('float_close'), 'the close shortcut did not close the window');
  });

  spec('common', 'ignores a bare w', async () => {
    key(document.body, 'w');
    assert(!invoked('float_close'), 'typing w closed the window');
  });

  /* The loading line (#7). It has to clear itself and never take clicks. */
  spec('common', 'clears the loading line once the page is done', async () => {
    const line = q('.progress');
    assert(line, 'no loading line in the toolbar');
    assertIs(getComputedStyle(line).pointerEvents, 'none', 'the loading line can swallow clicks');
    assert(
      await waitFor(() => !line.classList.contains('active'), 3000),
      'the line never finished',
    );
  });

  spec('common', 'runs the loading line again on a navigation', async () => {
    const line = q('.progress');
    window.dispatchEvent(new Event('beforeunload'));
    assert(line.classList.contains('active'), 'leaving the page showed no progress');
    assert(parseFloat(line.style.width) > 0, 'the line has no width');
    window.dispatchEvent(new Event('load'));
    assertIs(line.style.width, '100%', 'arriving did not complete the line');
  });

  /* ------------------------------ baseline ----------------------------- */

  spec('baseline', 'hides the bar again once the pointer leaves', async () => {
    await summon();
    hover(400);
    const hidden = await waitFor(() => !q('.bar').classList.contains('visible'), 3000);
    assert(hidden, 'the bar stayed visible after the pointer left');
  });

  spec('baseline', 'drives zoom, aspect, new window and settings from the menu', async () => {
    await summon();
    mouse(q('.mn'), 'click', { button: 0 });
    assert(q('.menu').classList.contains('open'), 'the menu did not open');

    mouse(q('.zi'), 'click', { button: 0 });
    const zoom = invoked('float_zoom');
    assert(zoom, 'zoom in sent no float_zoom');
    assert(Math.abs(zoom.args.factor - 1.1) < 1e-9, `unexpected zoom factor ${zoom.args.factor}`);
    assertIs(q('.zlbl').textContent, '110%', 'the zoom label is out of sync');

    mouse(q('.ar'), 'click', { button: 0 });
    assert(invoked('float_aspect'), 'snap to 16:9 sent no float_aspect');

    mouse(q('.mn'), 'click', { button: 0 });
    mouse(q('.nw'), 'click', { button: 0 });
    assert(invoked('float_new'), 'new window sent no float_new');

    mouse(q('.mn'), 'click', { button: 0 });
    mouse(q('.cfg'), 'click', { button: 0 });
    assert(invoked('open_settings'), 'settings sent no open_settings');
  });

  spec('baseline', 'shows the page favicon in the toolbar', async () => {
    const img = q('.title img');
    const link = document.querySelector('link[rel~="icon"]');
    assertIs(img.src, link.href, 'the toolbar favicon does not follow the page');
  });

  /* --------------------------- trusted types --------------------------- */

  spec('trusted-types', 'the fixture really does enforce Trusted Types', async () => {
    assert(window.trustedTypes, 'this webview has no Trusted Types at all');
    let threw = '';
    try {
      document.createElement('div').innerHTML = '<i>x</i>';
    } catch (e) {
      threw = e.name;
    }
    assertIs(threw, 'TypeError', 'innerHTML did not throw, so the page is not hostile');
  });

  /* ------------------------------ dom wipe ----------------------------- */

  spec('dom-wipe', 're-attaches after the page replaces the document', async () => {
    window.wipeDocument();
    assert(!host(), 'the fixture did not actually detach the toolbar');
    const back = await waitFor(() => !!host());
    assert(back, 'the toolbar never came back after the document was replaced');
  });

  spec('dom-wipe', 'still works after the document is replaced twice', async () => {
    window.wipeDocument();
    await waitFor(() => !!host());
    window.wipeDocument();
    assert(await waitFor(() => !!host()), 'the toolbar did not survive a second replacement');
    await summon();
    mouse(q('.close'), 'click', { button: 0 });
    assert(invoked('float_close'), 'the re-attached toolbar has dead buttons');
  });

  /* ------------------------------ hotkeys ------------------------------ */

  spec('hotkeys', 'the fixture really does swallow keystrokes', async () => {
    const before = window.pageKeysSeen();
    key(document.body, 'k');
    assert(window.pageKeysSeen() > before, 'the page is not capturing keys, so nothing is proven');
  });

  spec('hotkeys', 'double-clicking the titlebar opens the URL editor', async () => {
    await summon();
    mouse(q('.title'), 'dblclick', { button: 0 });
    assert(q('.bar').classList.contains('editing'), 'the URL editor did not open');
    assertIs(t.root().activeElement, q('.urlbox'), 'the URL editor did not take focus');
    assertIs(q('.urlbox').value, location.href, 'the URL editor is not preloaded with the URL');
  });

  spec('hotkeys', 'page hotkeys do not see keys while the URL editor is open', async () => {
    await summon();
    mouse(q('.title'), 'dblclick', { button: 0 });
    const before = window.pageKeysSeen();
    key(q('.urlbox'), 'k');
    assertIs(
      window.pageKeysSeen(),
      before,
      'the page intercepted a keystroke meant for the editor',
    );
  });

  spec('hotkeys', 'Escape closes the URL editor', async () => {
    await summon();
    mouse(q('.title'), 'dblclick', { button: 0 });
    key(q('.urlbox'), 'Escape');
    assert(!q('.bar').classList.contains('editing'), 'Escape did not close the URL editor');
  });

  spec('hotkeys', 'the URL editor refuses schemes other than http(s)', async () => {
    const before = location.href;
    await summon();
    mouse(q('.title'), 'dblclick', { button: 0 });
    q('.urlbox').value = 'javascript:void 0';
    key(q('.urlbox'), 'Enter');
    assert(q('.bar').classList.contains('editing'), 'a javascript: URL was accepted');
    assertIs(location.href, before, 'a javascript: URL navigated the window');
  });

  /* ---------------------------- blank links ---------------------------- */

  spec('blank-links', 'target=_blank opens a float window instead of nothing', async () => {
    const link = document.getElementById('external');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    const call = invoked('open_float');
    assert(call, 'the link opened no float window');
    assertIs(call.args.url, link.href, 'the float window got the wrong URL');
    assert(event.defaultPrevented, 'the click was left to navigate the current window too');
  });

  spec('blank-links', 'window.open routes to a float window', async () => {
    window.open('https://example.com/opened');
    const call = invoked('open_float');
    assert(call, 'window.open opened no float window');
    assertIs(call.args.url, 'https://example.com/opened', 'the float window got the wrong URL');
  });

  /* ------------------------- oauth popup (#4) -------------------------- */

  spec('oauth-popup', 'the popup request reaches the app', async () => {
    window.startSignIn();
    assert(invoked('open_float'), 'the sign-in popup never reached the app');
  });

  gated(4, 'oauth-popup', 'window.open returns a handle the opener can drive', async () => {
    const popup = window.open('https://accounts.google.com/o/oauth2/auth', 'oauth', 'popup');
    assert(popup, 'window.open returned null, so the OAuth flow has nothing to talk to');
    assertIs(typeof popup.closed, 'boolean', 'the popup handle cannot be polled for closure');
  });

  /* --------------------------- passkeys (#6) --------------------------- */

  spec('passkey', 'the WebAuthn API is exposed to the page', async () => {
    assertIs(
      typeof window.PublicKeyCredential,
      'function',
      'no PublicKeyCredential in this webview',
    );
    assert(navigator.credentials && navigator.credentials.get, 'no navigator.credentials.get');
  });

  /* Confirmed against a real float window on webauthn.io, not just here:
   * the API is present and no authenticator is offered. WKWebView gates
   * platform authenticators behind a managed Apple entitlement, so this can
   * only start passing on a signed build. See docs/passkeys.md. */
  gated(6, 'passkey', 'a platform authenticator is available for passkey sign-in', async () => {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    assert(available, 'no platform authenticator, so no passkey prompt can ever appear');
  });

  /* ------------------------------- live -------------------------------- */

  /* Only what survives a real, changing site: no fixture hooks, no counters. */
  spec('live', 'injects the toolbar and takes the top edge', async () => {
    const el = host();
    assert(el && el.isConnected, 'no toolbar on this site');
    await summon();
    assert(q('.bar').classList.contains('visible'), 'the bar did not reveal');
    assertIs(
      document.elementFromPoint(Math.round(innerWidth / 2), 12),
      el,
      'the site, not the toolbar, owns the top edge',
    );
  });

  spec('live', 'wires the window controls', async () => {
    await summon();
    mouse(q('.close'), 'click', { button: 0 });
    assert(invoked('float_close'), 'the close button is dead on this site');
  });
})();
