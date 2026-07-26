/**
 * Flobro regression harness.
 *
 * Loads each fixture in a real WKWebView and injects toolbar.js the way the
 * app does, as a user script at document start, so the specs run against the
 * engine that ships rather than a DOM emulation. That distinction is the
 * whole point: the jsdom repro on #2 passed while the toolbar was still dead
 * on YouTube, because jsdom has no Trusted Types, no CSP and no hit testing.
 *
 * Usage, from the repo root:
 *   npm test                  every fixture
 *   npm test -- --only hotkeys  one fixture
 *   npm test -- --live        the same smoke specs against the real sites
 *
 * Specs registered with gated() describe behaviour that is still broken.
 * They run, and a failure is reported as pending rather than counted as a
 * regression, so an open issue does not hold the build red. A pending spec
 * that starts passing is called out instead: promote it to a real spec.
 */
import AppKit
import Foundation
import WebKit

struct Target {
  let name: String
  let url: URL
  let isFile: Bool
}

struct SpecResult {
  let fixture: String
  let name: String
  let ok: Bool
  let gate: Int
  let error: String
}

let repoRoot = FileManager.default.currentDirectoryPath
let fixturesDir = URL(fileURLWithPath: repoRoot).appendingPathComponent("tests/fixtures")

func readFile(_ relativePath: String) -> String {
  let path = URL(fileURLWithPath: repoRoot).appendingPathComponent(relativePath)
  guard let text = try? String(contentsOf: path, encoding: .utf8) else {
    FileHandle.standardError.write("cannot read \(relativePath) (run from the repo root)\n".data(using: .utf8)!)
    exit(2)
  }
  return text
}

// Mirrors what lib.rs does when it hands the script to the webview.
let toolbarScript = readFile("src-tauri/src/toolbar.js")
  .replacingOccurrences(of: "__FLOBRO_LANG__", with: "en")
let supportScript = readFile("tests/support.js")
let suiteScript = readFile("tests/suite.js")

/* The sites the issue names, plus two ordinary ones as a control. Opt-in
 * only: real sites change under us and CI should not depend on them. */
let liveSites = [
  "https://example.com/",
  "https://en.wikipedia.org/wiki/Main_Page",
  "https://www.youtube.com/",
  "https://www.twitch.tv/",
  "https://www.tradingview.com/",
]

var only: String?
var live = false
var arguments = Array(CommandLine.arguments.dropFirst())
while let argument = arguments.first {
  arguments.removeFirst()
  switch argument {
  case "--live": live = true
  case "--only": only = arguments.isEmpty ? nil : arguments.removeFirst()
  default:
    FileHandle.standardError.write("unknown argument: \(argument)\n".data(using: .utf8)!)
    exit(2)
  }
}

var targets: [Target] = []
if live {
  targets = liveSites.compactMap { site in
    guard let url = URL(string: site), let host = url.host else { return nil }
    return Target(name: host, url: url, isFile: false)
  }
} else {
  let files = (try? FileManager.default.contentsOfDirectory(atPath: fixturesDir.path)) ?? []
  targets = files.filter { $0.hasSuffix(".html") }.sorted().map {
    Target(
      name: String($0.dropLast(".html".count)),
      url: fixturesDir.appendingPathComponent($0), isFile: true)
  }
}
if let only = only {
  targets = targets.filter { $0.name == only }
}
if targets.isEmpty {
  FileHandle.standardError.write("no targets to run\n".data(using: .utf8)!)
  exit(2)
}

let green = "\u{001B}[32m", red = "\u{001B}[31m", yellow = "\u{001B}[33m"
let dim = "\u{001B}[2m", bold = "\u{001B}[1m", reset = "\u{001B}[0m"

final class Harness: NSObject, WKNavigationDelegate {
  private var queue: [Target]
  private var results: [SpecResult] = []
  private var current: Target?
  private var webView: WKWebView?
  private var watchdog: Timer?
  private let window: NSWindow

  init(targets: [Target]) {
    queue = targets
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700),
      styleMask: [.titled], backing: .buffered, defer: false)
    super.init()
  }

  func start() { next() }

  private func next() {
    watchdog?.invalidate()
    webView = nil
    guard !queue.isEmpty else { return finish() }
    let target = queue.removeFirst()
    current = target
    print("\n\(bold)\(target.name)\(reset)")

    let controller = WKUserContentController()
    // Order matters: the shims have to be in place before the toolbar runs,
    // and both have to precede the page's own scripts, exactly as in the app.
    for source in [supportScript, toolbarScript, suiteScript] {
      controller.addUserScript(
        WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    let configuration = WKWebViewConfiguration()
    configuration.userContentController = controller

    let view = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 1000, height: 700), configuration: configuration)
    view.navigationDelegate = self
    window.contentView = view
    webView = view

    watchdog = Timer.scheduledTimer(withTimeInterval: target.isFile ? 20 : 45, repeats: false) {
      [weak self] _ in
      self?.record(error: "timed out loading the page")
    }

    if target.isFile {
      view.loadFileURL(target.url, allowingReadAccessTo: fixturesDir)
    } else {
      view.load(URLRequest(url: target.url))
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // The toolbar builds on DOMContentLoaded; give it and the page a beat.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
      webView.callAsyncJavaScript(
        "return await window.__flobroTest.run();", in: nil, in: .page
      ) { outcome in
        switch outcome {
        case .success(let value):
          self?.record(json: value as? String ?? "")
        case .failure(let error):
          self?.record(error: "the suite itself failed: \(error.localizedDescription)")
        }
      }
    }
  }

  func webView(
    _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
  ) {
    record(error: "navigation failed: \(error.localizedDescription)")
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error
  ) {
    record(error: "navigation failed: \(error.localizedDescription)")
  }

  private func record(json: String) {
    watchdog?.invalidate()
    guard let data = json.data(using: .utf8),
      let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
    else {
      return record(error: "could not read the suite's results")
    }
    if rows.isEmpty {
      return record(error: "no specs are registered for this page")
    }
    for row in rows {
      let result = SpecResult(
        fixture: row["fixture"] as? String ?? current?.name ?? "?",
        name: row["name"] as? String ?? "?",
        ok: row["ok"] as? Bool ?? false,
        gate: row["gate"] as? Int ?? 0,
        error: row["error"] as? String ?? "")
      results.append(result)
      report(result)
    }
    next()
  }

  private func record(error: String) {
    watchdog?.invalidate()
    guard let target = current else { return }
    let result = SpecResult(
      fixture: target.name, name: "loads and runs its specs", ok: false, gate: 0, error: error)
    results.append(result)
    report(result)
    next()
  }

  private func report(_ result: SpecResult) {
    if result.ok && result.gate > 0 {
      print(
        "  \(green)✓\(reset) \(result.name) "
          + "\(yellow)(pending on #\(result.gate) but passing: promote it)\(reset)")
    } else if result.ok {
      print("  \(green)✓\(reset) \(result.name)")
    } else if result.gate > 0 {
      print("  \(yellow)○\(reset) \(result.name) \(dim)(pending on #\(result.gate))\(reset)")
      print("    \(dim)\(result.error)\(reset)")
    } else {
      print("  \(red)✗\(reset) \(result.name)")
      print("    \(red)\(result.error)\(reset)")
    }
  }

  private func finish() {
    let passed = results.filter { $0.ok }
    let broken = results.filter { !$0.ok && $0.gate == 0 }
    let pending = results.filter { !$0.ok && $0.gate > 0 }
    let promotable = results.filter { $0.ok && $0.gate > 0 }
    let gates = Set(pending.map { $0.gate }).sorted().map { "#\($0)" }.joined(separator: ", ")

    print(
      "\n\(bold)\(passed.count) passed, \(broken.count) failed, "
        + "\(pending.count) pending\(reset)")
    if !broken.isEmpty {
      print("\(red)regressions:\(reset)")
      for result in broken { print("  \(result.fixture): \(result.name)") }
    }
    if !pending.isEmpty {
      print(
        "\(yellow)pending on \(gates):\(reset) behaviour that is still broken. "
          + "Skipped, not failed: fixing those issues is what makes these pass.")
    }
    if !promotable.isEmpty {
      print("\(green)ready to promote:\(reset)")
      for result in promotable { print("  #\(result.gate): \(result.name)") }
    }
    // Only real regressions fail the run.
    exit(broken.isEmpty ? 0 : 1)
  }
}

let harness = Harness(targets: targets)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
DispatchQueue.main.async { harness.start() }
app.run()
