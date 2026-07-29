//! The float capability has to cover the URLs a float window can really load.
//!
//! Tauri resolves IPC access by testing the page's full URL, port included,
//! against the `remote.urls` patterns (see `Origin::matches`). Its pattern
//! parser fills in an empty `search`, `hash` and `pathname` with `*`, but
//! leaves an unspecified port as the empty string, which URLPattern only
//! matches against a scheme's default port. A pattern written `http://**`
//! therefore covers `http://example.com` and silently excludes every dev
//! server on `http://localhost:5173` (#18): the toolbar renders, and then
//! every button, the drag and the close are denied by the ACL.
//!
//! These assertions read the shipped capability file, so they fail if the
//! patterns regress, not just if a copy of them does.

use std::path::Path;

use tauri::utils::acl::RemoteUrlPattern;
use url::Url;

fn float_remote_patterns() -> Vec<RemoteUrlPattern> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/float.json");
    let raw = std::fs::read_to_string(&path).expect("read capabilities/float.json");
    let json: serde_json::Value =
        serde_json::from_str(&raw).expect("parse capabilities/float.json");
    let urls = json["remote"]["urls"]
        .as_array()
        .expect("float capability declares remote.urls");
    urls.iter()
        .map(|u| {
            let s = u.as_str().expect("remote.urls entries are strings");
            s.parse().unwrap_or_else(|e| panic!("pattern {s:?}: {e:?}"))
        })
        .collect()
}

fn covered(patterns: &[RemoteUrlPattern], url: &str) -> bool {
    let url = Url::parse(url).expect("test URL parses");
    patterns.iter().any(|p| p.test(&url))
}

#[test]
fn float_capability_covers_dev_servers_on_any_port() {
    let patterns = float_remote_patterns();

    // The reported case: a dev server on a non-default port, http and https.
    assert!(covered(&patterns, "http://localhost:5173/"), "vite default");
    assert!(covered(&patterns, "http://localhost:3000/"), "next default");
    assert!(
        covered(&patterns, "https://localhost:5173/"),
        "https dev server"
    );
    assert!(
        covered(&patterns, "http://127.0.0.1:8080/"),
        "loopback by IP"
    );
    assert!(
        covered(&patterns, "http://localhost:1420/"),
        "tauri dev server"
    );

    // A path, a query and a fragment must not change the answer.
    assert!(
        covered(&patterns, "http://localhost:5173/app/page?q=1#top"),
        "deep link into a dev server"
    );
}

#[test]
fn float_capability_still_covers_ordinary_sites() {
    let patterns = float_remote_patterns();

    assert!(covered(&patterns, "https://www.youtube.com/watch?v=x"));
    assert!(covered(&patterns, "https://tradingview.com/"));
    assert!(covered(&patterns, "http://example.com/path"));
    assert!(covered(&patterns, "https://example.com:8443/path"));
}
