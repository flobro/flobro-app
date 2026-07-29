//! Tauri matches a page's full URL, port included, against the float
//! capability's `remote.urls`. A pattern without a port matches only the
//! scheme's default port, which denied the toolbar's IPC on every dev
//! server (#18). Reads the shipped capability file, not a copy.

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

    for url in [
        "http://localhost:5173/",
        "http://localhost:3000/",
        "https://localhost:5173/",
        "http://127.0.0.1:8080/",
        "http://localhost:5173/app/page?q=1#top",
    ] {
        assert!(covered(&patterns, url), "{url}");
    }
}

#[test]
fn float_capability_still_covers_ordinary_sites() {
    let patterns = float_remote_patterns();

    for url in [
        "https://www.youtube.com/watch?v=x",
        "https://tradingview.com/",
        "http://example.com/path",
        "https://example.com:8443/path",
    ] {
        assert!(covered(&patterns, url), "{url}");
    }
}
