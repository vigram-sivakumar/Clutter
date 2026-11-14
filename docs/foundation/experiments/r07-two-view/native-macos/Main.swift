import Cocoa
import WebKit

struct ManualCase: Decodable {
    let id: String
    let title: String
    let targets: [String]
    let seeds: [String]
    let steps: [String]
    let expected: String
}

func stamp() -> String { ISO8601DateFormatter().string(from: Date()) }
func argument(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}
func resource(_ name: String, _ ext: String) throws -> URL {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
        throw NSError(domain: "R07", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing bundled resource: \(name).\(ext)"])
    }
    return url
}

@MainActor
final class CandidateWindow: NSWindowController, NSWindowDelegate, WKNavigationDelegate {
    unowned let owner: LabDelegate
    let kind: String
    let web: WKWebView
    let cases: [ManualCase]
    let picker = NSPopUpButton(frame: .zero, pullsDown: false)
    let instructions = NSTextView(frame: NSRect(x: 0, y: 0, width: 1000, height: 110))
    let notes = NSTextField(string: "")
    let status = NSTextField(wrappingLabelWithString: "Loading fixture…")
    var states: [String: String] = [:]
    var attempts: [[String: Any]] = []
    var quickRuns: [[String: Any]] = []
    var latestCapture: [String: Any] = [:]
    var loadError: String?

    init(owner: LabDelegate, kind: String, path: String, title: String) {
        self.owner = owner
        self.kind = kind
        self.cases = owner.cases.filter { $0.targets.contains(kind) }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(source: owner.captureScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        self.web = WKWebView(frame: .zero, configuration: configuration)
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 900)
        let window = NSWindow(contentRect: NSRect(x: visible.minX + 25, y: visible.minY + 25, width: min(1260, visible.width - 50), height: min(940, visible.height - 50)), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = title
        window.minSize = NSSize(width: 900, height: 650)
        window.isReleasedWhenClosed = false
        super.init(window: window)
        window.delegate = self
        web.navigationDelegate = self
        for item in cases { states[item.id] = "not-run" }
        configureLayout()
        refreshPicker()
        let url = URL(string: path, relativeTo: owner.baseURL)!.absoluteURL
        web.load(URLRequest(url: url))
    }
    required init?(coder: NSCoder) { fatalError("No storyboard") }

    func button(_ title: String, _ action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        return button
    }
    func configureLayout() {
        let container = NSView()
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12), stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -12), stack.topAnchor.constraint(equalTo: container.topAnchor, constant: 10), stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -10)])
        let hint = NSTextField(wrappingLabelWithString: "Synthetic content only. A/B inside this window share a document. Candidate windows are independent. Manual verdicts and snapshots save automatically; quitting clears website data.")
        stack.addArrangedSubview(hint)
        picker.target = self
        picker.action = #selector(selectCase)
        picker.setAccessibilityLabel("Manual test case")
        picker.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let row = NSStackView(views: [picker, button("Pass", #selector(markPass)), button("Fail", #selector(markFail)), button("Blocked", #selector(markBlocked)), button("Fixture checks (resets)", #selector(runQuick))])
        row.orientation = .horizontal
        row.spacing = 6
        stack.addArrangedSubview(row)
        instructions.isEditable = false
        instructions.isSelectable = true
        instructions.drawsBackground = false
        instructions.minSize = NSSize(width: 0, height: 110)
        instructions.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        instructions.isVerticallyResizable = true
        instructions.isHorizontallyResizable = false
        instructions.autoresizingMask = [.width]
        instructions.textContainer?.widthTracksTextView = true
        instructions.font = .systemFont(ofSize: 12)
        let instructionScroll = NSScrollView()
        instructionScroll.hasVerticalScroller = true
        instructionScroll.documentView = instructions
        stack.addArrangedSubview(instructionScroll)
        instructionScroll.heightAnchor.constraint(equalToConstant: 110).isActive = true
        notes.placeholderString = "Notes: input source, physical chord, unexpected behaviour"
        notes.setAccessibilityLabel("Observation notes")
        stack.addArrangedSubview(notes)
        stack.addArrangedSubview(status)
        stack.addArrangedSubview(web)
        for view in [hint, row, instructionScroll, notes, status, web] {
            view.translatesAutoresizingMaskIntoConstraints = false
            view.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        }
        web.heightAnchor.constraint(greaterThanOrEqualToConstant: 280).isActive = true
        window?.contentView = container
    }
    func refreshPicker() {
        let selected = max(0, picker.indexOfSelectedItem)
        picker.removeAllItems()
        for item in cases { picker.addItem(withTitle: "\(item.id) · \(item.title) — \(states[item.id] ?? "not-run")") }
        if !cases.isEmpty { picker.selectItem(at: min(selected, cases.count - 1)) }
        selectCase()
    }
    @objc func selectCase() {
        let index = picker.indexOfSelectedItem
        guard cases.indices.contains(index) else { instructions.string = "No applicable cases"; return }
        let item = cases[index]
        instructions.string = item.steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n") + "\nExpected: " + item.expected
    }
    func capture(_ completion: @escaping ([String: Any]) -> Void) {
        web.evaluateJavaScript("window.r07Native ? window.r07Native.capture() : ({ready:false,error:'Capture API not ready'})") { value, error in
            var capture = value as? [String: Any] ?? [:]
            if let error = error { capture["captureError"] = error.localizedDescription }
            capture["capturedAt"] = stamp()
            completion(capture)
        }
    }
    func mark(_ verdict: String) {
        let index = picker.indexOfSelectedItem
        guard cases.indices.contains(index), attempts.count < 200 else { status.stringValue = "Report limit reached; start a new session."; return }
        let item = cases[index]
        let id = UUID().uuidString
        states[item.id] = (verdict == "fail" || attempts.contains(where: { $0["caseId"] as? String == item.id && $0["status"] as? String == "fail" })) ? "fail" : verdict
        attempts.append(["attemptId": id, "caseId": item.id, "status": verdict, "route": "manual native observation", "notes": notes.stringValue, "recordedAt": stamp(), "captureStatus": "pending"])
        owner.writeCheckpoint()
        refreshPicker()
        capture { [weak self] snapshot in
            guard let self = self, let index = self.attempts.firstIndex(where: { $0["attemptId"] as? String == id }) else { return }
            self.attempts[index]["snapshot"] = snapshot
            self.attempts[index]["captureStatus"] = snapshot["captureError"] == nil ? "captured" : "failed"
            self.latestCapture = snapshot
            let saved = self.owner.writeCheckpoint()
            self.status.stringValue = saved ? "Recorded \(item.id): \(verdict). Report saved automatically; fixture checks do not mark manual cases passed." : "Report save failed; keep this session open and inspect the terminal."
        }
    }
    @objc func markPass() { mark("pass") }
    @objc func markFail() { mark("fail") }
    @objc func markBlocked() { mark("blocked") }
    @objc func runQuick() {
        guard quickRuns.count < 100 else { status.stringValue = "Quick-check limit reached; start a new session."; return }
        web.evaluateJavaScript("window.r07Native ? window.r07Native.quick() : ({results:[{id:'QK-01',status:'blocked',reason:'Not ready'}]})") { [weak self] value, error in
            guard let self = self else { return }
            var result = value as? [String: Any] ?? [:]
            result["ranAt"] = stamp()
            if let error = error { result["error"] = error.localizedDescription }
            self.quickRuns.append(result)
            let saved = self.owner.writeCheckpoint()
            if !saved { return }
            if let error = error { self.status.stringValue = "Fixture checks failed: \(error.localizedDescription)"; return }
            let rows = result["results"] as? [[String: Any]] ?? []
            let passed = rows.filter { $0["status"] as? String == "pass" }.count
            let failed = rows.filter { $0["status"] as? String == "fail" }.count
            let blocked = rows.filter { $0["status"] as? String == "blocked" }.count
            self.status.stringValue = "Fixture checks: \(passed) passed, \(failed) failed, \(blocked) blocked. Manual verdicts unchanged; share the report if a check failed."
        }
    }
    func report() -> [String: Any] {
        ["kind": kind, "title": window?.title ?? kind, "windowFrame": window.map { NSStringFromRect($0.frame) } ?? "closed", "websiteData": "in-memory; not durable vault storage", "cases": cases.map { ["id": $0.id, "title": $0.title, "status": states[$0.id] ?? "not-run"] }, "manualAttempts": attempts, "caseStatusPolicy": "Any observed failure stays failing for this build/session; rerun attempts are retained", "automatedFixtureRuns": quickRuns, "latestCapture": latestCapture, "loadError": loadError ?? ""]
    }
    func windowDidBecomeKey(_ notification: Notification) { owner.active = self }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        capture { [weak self] value in
            guard let self = self else { return }
            self.latestCapture = value
            self.status.stringValue = "Page loaded. Run fixture checks first, then perform and mark manual cases."
            self.owner.writeCheckpoint()
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func failed(_ error: Error) { loadError = error.localizedDescription; status.stringValue = "Load failed: \(error.localizedDescription)"; owner.writeCheckpoint() }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let local = url.scheme == owner.baseURL.scheme && url.host == owner.baseURL.host && url.port == owner.baseURL.port
        decisionHandler(local || url.absoluteString == "about:blank" ? .allow : .cancel)
    }
}

@MainActor
final class LabDelegate: NSObject, NSApplicationDelegate {
    let baseURL: URL
    let reportURL: URL
    let cases: [ManualCase]
    let captureScript: String
    let buildInfo: [String: Any]
    let startedAt = stamp()
    var controllers: [CandidateWindow] = []
    weak var active: CandidateWindow?
    init(baseURL: URL, reportURL: URL) throws {
        self.baseURL = baseURL
        self.reportURL = reportURL
        self.cases = try JSONDecoder().decode([ManualCase].self, from: Data(contentsOf: resource("cases", "json")))
        self.captureScript = try String(contentsOf: resource("capture", "js"), encoding: .utf8)
        self.buildInfo = try JSONSerialization.jsonObject(with: Data(contentsOf: resource("build-info", "json"))) as? [String: Any] ?? [:]
        super.init()
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenu()
        open("origin")
        open("step")
        writeCheckpoint()
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) { writeCheckpoint() }
    func open(_ kind: String) {
        if let existing = controllers.first(where: { $0.kind == kind }) { existing.showWindow(nil); existing.window?.makeKeyAndOrderFront(nil); return }
        let paths = ["step": "/", "origin": "/origin", "raw": "/control", "adapted": "/control?selection=public"]
        let titles = ["step": "R07 · Guarded step / public selection", "origin": "R07 · Origin-aware history", "raw": "R07 · Raw minimal control", "adapted": "R07 · Adapted minimal control"]
        let controller = CandidateWindow(owner: self, kind: kind, path: paths[kind]!, title: titles[kind]!)
        controllers.append(controller)
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
    }
    @objc func openCandidate(_ item: NSMenuItem) { if let kind = item.representedObject as? String { open(kind) } }
    @objc func quick() { active?.runQuick() }
    @objc func revealReport() { guard writeCheckpoint() else { return }; NSWorkspace.shared.activateFileViewerSelecting([reportURL]) }
    @discardableResult func writeCheckpoint() -> Bool {
        let report: [String: Any] = ["format": "clutter-r07-native-v1", "startedAt": startedAt, "updatedAt": stamp(), "nativeAcceptance": "manual verdicts only; no architecture acceptance inferred", "system": ["os": ProcessInfo.processInfo.operatingSystemVersionString], "build": buildInfo, "limits": ["Candidate windows are independent; shared-document multi-window sync unqualified", "Website data is ephemeral, not on-disk durability", "Fixture commands are not OS keyboard/IME/menu input", "No production vault or provider access"], "windows": controllers.map { $0.report() }]
        do {
            let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: reportURL, options: .atomic)
            return true
        } catch {
            active?.status.stringValue = "Report save failed: \(error.localizedDescription). Keep the app open and inspect the terminal."
            fputs("Report save failed: \(error.localizedDescription)\n", stderr)
            return false
        }
    }
    func installMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "Clutter R07 Lab")
        appMenu.addItem(withTitle: "Quit Clutter R07 Lab", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)
        let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "Edit")
        let editActions: [(String, String, String, NSEvent.ModifierFlags)] = [("Undo", "undo:", "z", [.command]), ("Redo", "redo:", "z", [.command, .shift]), ("Cut", "cut:", "x", [.command]), ("Copy", "copy:", "c", [.command]), ("Paste", "paste:", "v", [.command]), ("Paste and Match Style", "pasteAsPlainText:", "v", [.command, .option, .shift]), ("Select All", "selectAll:", "a", [.command])]
        for (title, selector, key, modifiers) in editActions {
            let item = NSMenuItem(title: title, action: Selector(selector), keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            // Nil target deliberately uses the native responder chain, not JS undo.
            edit.addItem(item)
        }
        editItem.submenu = edit
        main.addItem(editItem)
        let experimentItem = NSMenuItem(title: "Experiment", action: nil, keyEquivalent: "")
        let experiment = NSMenu(title: "Experiment")
        for (title, kind) in [("Guarded step candidate", "step"), ("Origin-aware candidate", "origin"), ("Raw minimal control", "raw"), ("Adapted minimal control", "adapted")] {
            let item = NSMenuItem(title: title, action: #selector(openCandidate(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = kind
            experiment.addItem(item)
        }
        let quickItem = NSMenuItem(title: "Run fixture checks (resets)", action: #selector(quick), keyEquivalent: "")
        quickItem.target = self
        experiment.addItem(quickItem)
        let reveal = NSMenuItem(title: "Reveal saved JSON report", action: #selector(revealReport), keyEquivalent: "")
        reveal.target = self
        experiment.addItem(reveal)
        experimentItem.submenu = experiment
        main.addItem(experimentItem)
        let windowItem = NSMenuItem(title: "Window", action: nil, keyEquivalent: "")
        let windows = NSMenu(title: "Window")
        windowItem.submenu = windows
        main.addItem(windowItem)
        NSApp.mainMenu = main
        NSApp.windowsMenu = windows
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
guard let address = argument("--url"), let base = URL(string: address), base.scheme == "http", base.host == "127.0.0.1", base.port != nil, base.user == nil, base.password == nil, base.query == nil, base.fragment == nil, (base.path.isEmpty || base.path == "/"), let output = argument("--report"), output.hasPrefix("/"), output.hasSuffix(".json") else {
    fputs("Launch using npm run native:mac; requires a loopback URL and absolute JSON report path.\n", stderr)
    exit(2)
}
do {
    let delegate = try LabDelegate(baseURL: base, reportURL: URL(fileURLWithPath: output))
    app.delegate = delegate
    withExtendedLifetime(delegate) { app.run() }
} catch {
    fputs("Native harness setup failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
