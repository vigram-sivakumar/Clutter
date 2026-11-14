import Cocoa
import WebKit

func argument(_ key: String) -> String? { guard let i = CommandLine.arguments.firstIndex(of: key), i+1 < CommandLine.arguments.count else { return nil }; return CommandLine.arguments[i+1] }
func stamp() -> String { ISO8601DateFormatter().string(from: Date()) }
struct ManualCase: Decodable { let id: String; let title: String; let steps: [String]; let expected: String }

@MainActor
final class JoinedLab: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    let session: URL
    let reportURL: URL
    let resources: URL
    let window: NSWindow
    let web: WKWebView
    let status = NSTextField(wrappingLabelWithString: "Starting packaged owner…")
    let picker = NSPopUpButton(frame: .zero, pullsDown: false)
    let instructions = NSTextField(wrappingLabelWithString: "")
    let notes = NSTextField(string: "")
    let cases: [ManualCase]
    var attempts: [[String: Any]] = []
    var events: [[String: Any]] = []
    var failures: Set<String> = []
    var ready = false
    var closing = false
    var allowClose = false
    var allowQuit = false
    var lastSnapshot: [String: Any] = [:]
    var descriptor: [String: Any] = [:]
    let started = stamp()
    let build: [String: Any]
    let headless: [String: Any]

    init(session: URL, report: URL) throws {
        self.session = session; self.reportURL = report
        guard let resources = Bundle.main.resourceURL else { throw NSError(domain: "JoinedLab", code: 1) }
        self.resources = resources
        cases = try JSONDecoder().decode([ManualCase].self, from: Data(contentsOf: resources.appendingPathComponent("cases.json")))
        build = (try JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("bundle.json")))) as? [String: Any] ?? [:]
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: config)
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0,y: 0,width: 1280,height: 900)
        window = NSWindow(contentRect: NSRect(x: visible.minX+20,y: visible.minY+20,width: min(1280,visible.width-40),height: min(980,visible.height-40)),styleMask: [.titled,.closable,.miniaturizable,.resizable],backing: .buffered,defer: false)
        headless = (try JSONSerialization.jsonObject(with: Data(contentsOf: session.appendingPathComponent("headless-report.json")))) as? [String: Any] ?? [:]
        super.init()
        window.title = "Clutter · Joined native qualification16"; window.isReleasedWhenClosed = false; window.delegate = self
        web.navigationDelegate = self
    }
    func button(_ title: String, _ selector: Selector) -> NSButton { NSButton(title: title,target: self,action: selector) }
    func layout() {
        let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 8; stack.translatesAutoresizingMaskIntoConstraints = false
        let container = NSView(); container.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: container.leadingAnchor,constant: 12),stack.trailingAnchor.constraint(equalTo: container.trailingAnchor,constant: -12),stack.topAnchor.constraint(equalTo: container.topAnchor,constant: 12),stack.bottomAnchor.constraint(equalTo: container.bottomAnchor,constant: -12)])
        let hint = NSTextField(wrappingLabelWithString: "Synthetic content only. A/B are actual editor views of one durable document. Manual observations are separate from automated headless checks.")
        for c in cases { picker.addItem(withTitle: "\(c.id) · \(c.title) — not-run") }; picker.target = self; picker.action = #selector(selectCase)
        let verdict = NSStackView(views: [picker,button("Pass",#selector(pass)),button("Fail",#selector(fail)),button("Blocked",#selector(blocked))]); verdict.spacing = 6
        let actions = NSStackView(views: [button("Close/reopen A",#selector(remount)),button("Pause A",#selector(pauseA)),button("Resume A",#selector(resumeA)),button("Protect pending",#selector(protectPending)),button("Recover protected A",#selector(recoverA)),button("Crash/reconnect",#selector(crashOwner))]); actions.spacing = 6
        let failSave = NSButton(checkboxWithTitle: "Fail saves",target: self,action: #selector(toggleSaves)); failSave.identifier = NSUserInterfaceItemIdentifier("fail_writes")
        let failProtect = NSButton(checkboxWithTitle: "Fail protection",target: self,action: #selector(toggleProtection)); failProtect.identifier = NSUserInterfaceItemIdentifier("fail_protection")
        let flags = NSStackView(views: [failSave,failProtect]); flags.spacing = 12
        notes.placeholderString = "Observation notes (synthetic content only)"
        for v in [hint,verdict,instructions,notes,actions,flags,status,web] { stack.addArrangedSubview(v); v.translatesAutoresizingMaskIntoConstraints = false; v.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        instructions.maximumNumberOfLines = 5; web.heightAnchor.constraint(greaterThanOrEqualToConstant: 300).isActive = true
        window.contentView = container; selectCase()
    }
    func applicationDidFinishLaunching(_ notification: Notification) { layout(); menu(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); ensureOwner(load: true) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func runCLI(_ arguments: [String], _ completion: @escaping (Result<[String: Any],Error>) -> Void) {
        let process = Process(); process.executableURL = resources.appendingPathComponent("runtime/node"); process.arguments = [resources.appendingPathComponent("launcher.mjs").path,"--session",session.path]+arguments
        var env = ProcessInfo.processInfo.environment; env["PATH"] = "/usr/bin:/bin"; process.environment = env
        let input = Pipe(), output = Pipe(), errors = Pipe(); process.standardInput = input; process.standardOutput = output; process.standardError = errors
        process.terminationHandler = { p in
            let data = output.fileHandleForReading.readDataToEndOfFile()
            DispatchQueue.main.async {
                do { guard p.terminationStatus == 0, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], value["ok"] as? Bool == true else { throw NSError(domain: "JoinedCLI",code: Int(p.terminationStatus),userInfo: [NSLocalizedDescriptionKey: String(data: data,encoding: .utf8) ?? "Packaged client failed"]) }; completion(.success(value)) }
                catch { completion(.failure(error)) }
            }
        }
        do { try process.run(); input.fileHandleForWriting.closeFile() } catch { completion(.failure(error)) }
    }
    func ensureOwner(load: Bool) { runCLI(["--ensure"]) { [weak self] result in
        guard let self = self else { return }
        switch result {
        case .failure(let error): self.recordError(error)
        case .success(let info):
            do {
                self.descriptor = try JSONSerialization.jsonObject(with: Data(contentsOf: self.session.appendingPathComponent("endpoint.json"))) as? [String: Any] ?? [:]
                self.events.append(["event":"owner-connected","at":stamp(),"profile":info])
                try self.installBootstrap()
                if load { guard let address = self.descriptor["url"] as? String, var url = URLComponents(string: address) else { throw NSError(domain:"JoinedURL",code:1) }; url.path = "/"; url.fragment = nil; guard let full = url.url else { throw NSError(domain:"JoinedURL",code:2) }; self.web.load(URLRequest(url: full)) }
                else { self.js("await window.joined.reconnect(descriptor); return window.joinedNative.capture();",arguments:["descriptor":self.descriptor]) { _ in } }
                self.writeReport()
            } catch { self.recordError(error) }
        }
    } }
    func installBootstrap() throws {
        var value: [String: Any] = [:]
        for key in ["url","token","editorGrants","spaceId","documentId"] { guard let item = descriptor[key] else { throw NSError(domain:"JoinedBootstrap",code:1) }; value[key] = item }
        let data = try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys])
        let template = try String(contentsOf:resources.appendingPathComponent("bootstrap.js"),encoding:.utf8)
        let script = template.replacingOccurrences(of:"__CLUTTER_NATIVE_BOOTSTRAP__",with:String(data:data,encoding:.utf8)!)
        web.configuration.userContentController.removeAllUserScripts()
        web.configuration.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentStart,forMainFrameOnly:true))
    }
    func js(_ body: String, arguments: [String: Any] = [:], completion: @escaping (Bool) -> Void = { _ in }) {
        web.callAsyncJavaScript(body,arguments: arguments,in: nil,in: .page) { [weak self] result in
            guard let self = self else { completion(false); return }
            switch result {
            case .failure(let error): self.recordError(error); completion(false)
            case .success(let value): self.lastSnapshot = value as? [String: Any] ?? [:]; self.status.stringValue = "Operation completed. Manual verdicts unchanged."; self.writeReport(); completion(true)
            }
        }
    }
    @objc func selectCase() { let i = picker.indexOfSelectedItem; guard cases.indices.contains(i) else { return }; let c = cases[i]; instructions.stringValue = c.steps.enumerated().map { "\($0.offset+1). \($0.element)" }.joined(separator:"\n")+"\nExpected: "+c.expected }
    func mark(_ verdict: String) { let i = picker.indexOfSelectedItem; guard cases.indices.contains(i), attempts.count < 100, ready else { status.stringValue = "Wait until the joined editor is ready."; return }; let c = cases[i], note = notes.stringValue
        js("return window.joinedNative.capture();") { [weak self] ok in guard let self = self else { return }; if verdict == "fail" { self.failures.insert(c.id) }; self.attempts.append(["caseId":c.id,"status":verdict,"at":stamp(),"notes":note,"captureSucceeded":ok,"snapshot":ok ? self.lastSnapshot : [:]]); let state = self.failures.contains(c.id) ? "fail" : verdict; self.picker.item(at:i)?.title = "\(c.id) · \(c.title) — \(state)"; self.writeReport() }
    }
    @objc func pass() { mark("pass") }; @objc func fail() { mark("fail") }; @objc func blocked() { mark("blocked") }
    @objc func remount() { js("window.originLab.recreateView('A'); return window.joinedNative.capture();") }
    @objc func pauseA() { js("window.originLab.pause('A'); return window.joinedNative.capture();") }
    @objc func resumeA() { js("await window.joined.resume('A'); return window.joinedNative.capture();") }
    @objc func protectPending() { js("await window.joinedNative.prepareClose(false); await window.joinedNative.reopen(); return window.joinedNative.capture();") }
    @objc func recoverA() { js("await window.joinedNative.recover('A'); return window.joinedNative.capture();") }
    @objc func toggleSaves(_ sender: NSButton) { controlFlag(sender,"fail_writes") }
    @objc func toggleProtection(_ sender: NSButton) { controlFlag(sender,"fail_protection") }
    func controlFlag(_ sender: NSButton,_ name: String) { let selected = sender.state == .on; runCLI(["--control",name,selected ? "true" : "false"]) { [weak self] result in switch result { case .success: self?.events.append(["event":name,"value":selected,"at":stamp()]); self?.status.stringValue = "Fault switch acknowledged by owner."; self?.writeReport(); case .failure(let error): sender.state = selected ? .off : .on; self?.recordError(error) } } }
    @objc func crashOwner() { runCLI(["--control","crash"]) { [weak self] result in switch result { case .success: self?.events.append(["event":"owner-crashed","at":stamp()]); self?.ensureOwner(load:false); case .failure(let e): self?.recordError(e) } } }
    func prepare(_ quitting: Bool,_ completion: @escaping (Bool) -> Void) { guard ready, !closing else { completion(false); return }; closing = true; js("return await window.joinedNative.prepareClose(quitting);",arguments:["quitting":quitting]) { [weak self] ok in self?.closing = false; completion(ok) } }
    func windowShouldClose(_ sender: NSWindow) -> Bool { if allowClose { return true }; prepare(false) { [weak self] ok in guard let self = self else { return }; if ok { self.allowClose = true; self.window.performClose(nil); self.allowClose = false } }; return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { if allowQuit || !window.isVisible { if !window.isVisible && !allowQuit { reopenWindow(); prepare(true) { ok in sender.reply(toApplicationShouldTerminate:ok) }; return .terminateLater }; return .terminateNow }; prepare(true) { [weak self] ok in self?.allowQuit = ok; sender.reply(toApplicationShouldTerminate:ok) }; return .terminateLater }
    @objc func reopenWindow() { window.makeKeyAndOrderFront(nil); if ready { js("return await window.joinedNative.reopen();") } }
    func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) { js("for(let i=0;i<150;i++){if(window.joinedNative)return window.joinedNative.capture();await new Promise(r=>setTimeout(r,100));}throw Error('JOINED_EDITOR_NOT_READY');") { [weak self] ok in self?.ready = ok; if ok { self?.status.stringValue = "Joined editor ready. Start JN-01 only; use synthetic text." } } }
    func webView(_ webView: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) { recordError(error) }
    func webView(_ webView: WKWebView,decidePolicyFor navigationAction: WKNavigationAction,decisionHandler: @escaping (WKNavigationActionPolicy)->Void) { guard let url = navigationAction.request.url, let address = descriptor["url"] as? String, let base = URL(string:address) else { decisionHandler(.cancel); return }; let local = url.scheme == base.scheme && url.host == base.host && url.port == base.port
        guard local || url.absoluteString == "about:blank" else { decisionHandler(.cancel); return }
        if local && navigationAction.navigationType == .reload && ready {
            prepare(true) { [weak self] ok in
                guard let self = self else { decisionHandler(.cancel); return }
                if ok { self.events.append(["event":"reload-protected","at":stamp()]); self.ready = false; self.writeReport() }
                decisionHandler(ok ? .allow : .cancel)
            }
            return
        }
        decisionHandler(.allow) }
    func recordError(_ error: Error) { status.stringValue = "Blocked: \(error.localizedDescription). Keep the app open and share the report."; events.append(["event":"error","message":error.localizedDescription,"at":stamp()]); writeReport() }
    func writeReport() { do { let value: [String: Any] = ["format":"clutter-joined-native16-v1","startedAt":started,"updatedAt":stamp(),"nativeAcceptance":"manual observations only; build/setup does not pass JG-11","os":ProcessInfo.processInfo.operatingSystemVersionString,"build":build,"headlessAutomation":headless,"manualAttempts":attempts,"events":events,"latestCapture":lastSnapshot,"limits":["Ad-hoc experiment, not notarized distribution/sandbox acceptance","Same-user private synthetic session, not production IPC/grants","IME unavailable and VoiceOver deferred; no automatic pass","No JG-12/13 entity/assets acceptance"]]; let data = try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]); guard data.count < 16*1024*1024 else { throw NSError(domain:"ReportLimit",code:1) }; try data.write(to:reportURL,options:.atomic) } catch { status.stringValue = "Report write failed: \(error.localizedDescription)" } }
    func menu() { let main = NSMenu(); let app = NSMenuItem(); let menu = NSMenu(); menu.addItem(withTitle:"Quit joined lab",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q"); app.submenu = menu; main.addItem(app)
        let editItem = NSMenuItem(); let edit = NSMenu(title:"Edit"); let commands: [(String,String,String,NSEvent.ModifierFlags)] = [("Undo","undo:","z",NSEvent.ModifierFlags.command),("Redo","redo:","z",[.command,.shift]),("Cut","cut:","x",.command),("Copy","copy:","c",.command),("Paste","paste:","v",.command),("Select All","selectAll:","a",.command)]; for (title,selector,key,flags) in commands { let item = NSMenuItem(title:title,action:Selector(selector),keyEquivalent:key); item.keyEquivalentModifierMask = flags; edit.addItem(item) }; editItem.submenu = edit; main.addItem(editItem)
        let labItem = NSMenuItem(); let lab = NSMenu(title:"Experiment"); let reopen = NSMenuItem(title:"Reopen window",action:#selector(reopenWindow),keyEquivalent:""); reopen.target = self; lab.addItem(reopen); labItem.submenu = lab; main.addItem(labItem); NSApp.mainMenu = main
    }
}
@main struct JoinedNativeMain { @MainActor static func main() { let app = NSApplication.shared; app.setActivationPolicy(.regular); guard let session = argument("--session"), let report = argument("--report"), session.hasPrefix("/"),report.hasPrefix("/") else { fputs("Use npm run native:joined.\n",stderr); exit(2) }; do { let lab = try JoinedLab(session:URL(fileURLWithPath:session),report:URL(fileURLWithPath:report)); app.delegate = lab; withExtendedLifetime(lab) { app.run() } } catch { fputs("Joined native setup failed: \(error.localizedDescription)\n",stderr); exit(1) } } }
