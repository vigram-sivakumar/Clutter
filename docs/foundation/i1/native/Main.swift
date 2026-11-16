import Cocoa
import WebKit
import PDFKit

func argument(_ key: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: key), i+1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[i+1]
}

@MainActor
final class Core28Lab: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    let session: URL
    let reportURL: URL
    let resources: URL
    let window: NSWindow
    let web: WKWebView
    let status = NSTextField(wrappingLabelWithString: "Starting NEW Core…")
    let picker = NSPopUpButton(frame: .zero, pullsDown: false)
    let notes = NSTextField(string: "")
    let instructions = NSTextField(wrappingLabelWithString: "")
    var checks: [String: NSButton] = [:]
    var descriptor: [String: Any] = [:]
    var attempts: [[String: Any]] = []
    var events: [[String: Any]] = []
    var lastCapture: [String: Any] = [:]
    var profile: [String: Any] = [:]
    var pdfWindows: [NSWindow] = []
    var ready = false
    var guarding = false
    var allowClose = false
    var allowQuit = false
    var allowNavigation = false
    let started = ISO8601DateFormatter().string(from: Date())
    struct NativeCase: Decodable { let id: String; let title: String; let expected: String; let steps: [String] }
    struct Contract: Decodable { let manualCases: [NativeCase] }
    let cases: [NativeCase]
    var titles: [String] { cases.map { "\($0.id) · \($0.title)" } }


    init(session: URL, report: URL) throws {
        self.session = session; self.reportURL = report
        guard let resources = Bundle.main.resourceURL else { throw NSError(domain: "Core28", code: 1) }
        self.resources = resources
        cases = try JSONDecoder().decode(Contract.self,from:Data(contentsOf:resources.appendingPathComponent("native-contract.json"))).manualCases
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: config)
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0,y: 0,width: 1280,height: 900)
        window = NSWindow(contentRect: NSRect(x: visible.minX+20,y: visible.minY+20,width: min(1300,visible.width-40),height: min(1000,visible.height-40)),styleMask: [.titled,.closable,.miniaturizable,.resizable],backing: .buffered,defer: false)
        super.init()
        window.title = "Clutter · NEW Core28 native qualification"; window.delegate = self; window.isReleasedWhenClosed = false
        web.navigationDelegate = self; web.configuration.userContentController.add(self,name: "core28")
    }
    func button(_ title: String, _ selector: Selector) -> NSButton { NSButton(title: title,target: self,action: selector) }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 8; stack.translatesAutoresizingMaskIntoConstraints = false
        let container = NSView(); container.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: container.leadingAnchor,constant: 12),stack.trailingAnchor.constraint(equalTo: container.trailingAnchor,constant: -12),stack.topAnchor.constraint(equalTo: container.topAnchor,constant: 12),stack.bottomAnchor.constraint(equalTo: container.bottomAnchor,constant: -12)])
        let hint = NSTextField(wrappingLabelWithString: "Synthetic disposable Space. This is NEW Core28, not Clutter or the old lab. Manual verdicts are separate from automated checks.")
        for title in titles { picker.addItem(withTitle: title + " — not-run") }; picker.target = self; picker.action = #selector(selectCase)
        let verdicts = NSStackView(views: [picker,button("Pass",#selector(pass)),button("Fail",#selector(fail)),button("Blocked",#selector(blocked))]); verdicts.spacing = 6
        let flags = NSStackView(); flags.spacing = 8
        for (key,title) in [("failSaves","Fail saves"),("failProtection","Fail protection"),("failMedia","Fail media"),("failJournal","Fail journal")] {
            let b = NSButton(checkboxWithTitle: title,target: self,action: #selector(flagChanged(_:))); b.identifier = NSUserInterfaceItemIdentifier(key); checks[key] = b; flags.addArrangedSubview(b)
        }
        flags.addArrangedSubview(button("Reload safely",#selector(reloadPage))); flags.addArrangedSubview(button("Restart service",#selector(restartService))); flags.addArrangedSubview(button("Show report",#selector(showReport)))
        notes.placeholderString = "Manual observation notes — synthetic content only"
        for v in [hint,verdicts,instructions,notes,flags,status,web] { stack.addArrangedSubview(v); v.translatesAutoresizingMaskIntoConstraints = false; v.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        instructions.maximumNumberOfLines = 6; web.heightAnchor.constraint(greaterThanOrEqualToConstant: 330).isActive = true
        window.contentView = container; selectCase(); menu(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); connect()
    }
    func menu() {
        let main = NSMenu(), appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(); appMenu.addItem(withTitle: "Quit Core28",action: #selector(NSApplication.terminate(_:)),keyEquivalent: "q"); appItem.submenu = appMenu
        let editItem = NSMenuItem(); main.addItem(editItem); let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        for (title,action,key) in [("Cut",#selector(NSText.cut(_:)),"x"),("Copy",#selector(NSText.copy(_:)),"c"),("Paste",#selector(NSText.paste(_:)),"v"),("Select All",#selector(NSText.selectAll(_:)),"a")] { edit.addItem(withTitle:title,action:action,keyEquivalent:key) }
        NSApp.mainMenu = main
    }
    // Read stdout while the child runs; large media replies must not fill a pipe
    // while a termination handler waits for process exit.
    func cli(_ args: [String], completion: @escaping (Result<[String: Any],Error>) -> Void) {
        let executable = resources.appendingPathComponent("runtime/node"), launcher = resources.appendingPathComponent("launcher.mjs"), directory = session
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process(), output = Pipe(); process.executableURL = executable; process.arguments = [launcher.path,"--session",directory.path]+args; process.standardOutput = output; process.standardError = FileHandle.nullDevice; process.standardInput = FileHandle.nullDevice
            var env = ProcessInfo.processInfo.environment; env["PATH"] = "/usr/bin:/bin"; process.environment = env
            let result: Result<[String: Any],Error>
            do { try process.run(); let data = output.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit(); guard process.terminationStatus == 0, let value = try JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw NSError(domain:"Core28CLI",code:Int(process.terminationStatus),userInfo:[NSLocalizedDescriptionKey:String(data:data,encoding:.utf8) ?? "Client failed; inspect owner-error.txt"]) }; result = .success(value) }
            catch { result = .failure(error) }
            DispatchQueue.main.async { completion(result) }
        }
    }
    func connect() {
        ready = false; status.stringValue = "Connecting to same disposable Space…"
        cli(["--ensure"]) { [weak self] result in
            guard let self = self else { return }
            do {
                let info = try result.get(); self.profile = (info["status"] as? [String:Any])?["profile"] as? [String:Any] ?? [:]
                let flags = (info["status"] as? [String:Any])?["flags"] as? [String:Bool] ?? [:]; for (key,b) in self.checks { b.state = flags[key] == true ? .on : .off }
                self.descriptor = try JSONSerialization.jsonObject(with:Data(contentsOf:self.session.appendingPathComponent("endpoint.json"))) as? [String:Any] ?? [:]
                guard let address = self.descriptor["url"] as? String, let tokens = self.descriptor["tokens"] as? [String:String], let token = tokens["ui"], let spaceId = self.descriptor["spaceId"] as? String, let url = URL(string:address) else { throw NSError(domain:"Core28Bootstrap",code:1) }
                let boot:[String:Any] = ["url":address,"token":token,"spaceId":spaceId,"png":try Data(contentsOf:self.resources.appendingPathComponent("sample.png")).base64EncodedString(),"pngAlt":try Data(contentsOf:self.resources.appendingPathComponent("sample-alt.png")).base64EncodedString(),"pdf":try Data(contentsOf:self.resources.appendingPathComponent("sample.pdf")).base64EncodedString()]
                let data = try JSONSerialization.data(withJSONObject:boot,options:[.sortedKeys]), script = "Object.defineProperty(globalThis,'__clutterCore28Bootstrap',{value:"+String(data:data,encoding:.utf8)!+",configurable:false});"
                self.web.configuration.userContentController.removeAllUserScripts(); self.web.configuration.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentStart,forMainFrameOnly:true))
                self.allowNavigation = true; self.web.load(URLRequest(url:url)); self.writeReport()
            } catch { self.record(error.localizedDescription) }
        }
    }
    func js(_ code: String, completion: @escaping (Result<Any,Error>) -> Void) { web.callAsyncJavaScript(code,arguments:[:],in:nil,in:.page,completionHandler: { result in completion(result) }) }
    func guarded(onRefused: (() -> Void)? = nil, _ action: @escaping () -> Void) {
        if guarding { onRefused?(); return }; if !ready { onRefused?(); return }
        guarding = true; status.stringValue = "Saving or protecting pending work…"
        js("return await globalThis.lab28.prepareClose();") { [weak self] result in
            guard let self = self else { return }; self.guarding = false
            switch result {
            case .success(let value):
                let data = value as? [String:Any] ?? [:]; self.lastCapture = data["capture"] as? [String:Any] ?? [:]
                self.events.append(["at":ISO8601DateFormatter().string(from:Date()),"event":"close-guard","safe":data["safe"] as? Bool ?? false]); self.writeReport()
                if data["safe"] as? Bool == true { action() } else { self.status.stringValue = "Close/reload REFUSED. Work remains live; clear failure and retry."; onRefused?() }
            case .failure(let error): self.record("Guard failed; close refused: "+error.localizedDescription); onRefused?()
            }
        }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { if allowClose || !ready { return true }; guarded { self.allowClose = true; self.window.close() }; return false }
    func windowWillClose(_ notification: Notification) { for pdf in pdfWindows { pdf.close() }; allowQuit = true; writeReport(); NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { if allowQuit || allowClose || !ready { return .terminateNow }; if guarding { return .terminateCancel }; guarded(onRefused:{ NSApp.reply(toApplicationShouldTerminate:false) }) { self.allowQuit = true; NSApp.reply(toApplicationShouldTerminate:true) }; return .terminateLater }
    @objc func reloadPage() { guarded { self.ready = false; self.allowNavigation = true; self.web.reload() } }
    @objc func restartService() { guarded { self.cli(["--control","stop"]) { result in do { _ = try result.get(); self.connect() } catch { self.record(error.localizedDescription) } } } }
    @objc func flagChanged(_ sender: NSButton) {
        guard let key = sender.identifier?.rawValue else { return }; let value = sender.state == .on
        cli(["--control","{\"\(key)\":\(value ? "true":"false")}"]) { result in do { _ = try result.get(); self.events.append(["event":"flag","name":key,"value":value]); self.writeReport() } catch { self.record(error.localizedDescription) } }
    }
    @objc func showReport() { NSWorkspace.shared.activateFileViewerSelecting([reportURL]) }
    @objc func selectCase() { let c = cases[max(0,picker.indexOfSelectedItem)]; instructions.stringValue = c.steps.joined(separator:"\n")+"\nExpected: "+c.expected }
    @objc func pass() { verdict("pass") }; @objc func fail() { verdict("fail") }; @objc func blocked() { verdict("blocked") }
    func verdict(_ value: String) { let index = picker.indexOfSelectedItem; js("return globalThis.lab28.capture();") { [weak self] result in guard let self = self else { return }; let capture = (try? result.get()) as? [String:Any] ?? [:]; self.lastCapture = capture; self.attempts.append(["case":self.cases[index].id,"verdict":value,"notes":self.notes.stringValue,"at":ISO8601DateFormatter().string(from:Date()),"capture":capture]); self.picker.item(at:index)?.title = self.titles[index]+" — "+value; self.writeReport() } }
    func record(_ message: String) { status.stringValue = message; events.append(["event":"error","message":message]); writeReport() }
    func writeReport() { let value:[String:Any] = ["format":"clutter-native-observations28","started":started,"updated":ISO8601DateFormatter().string(from:Date()),"scope":"Synthetic NEW Core native observations; not production or full durability acceptance","profile":profile,"attempts":attempts,"events":events,"lastCapture":lastCapture]; do { let data = try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]); try data.write(to:reportURL,options:.atomic) } catch { status.stringValue = "Report write failed: "+error.localizedDescription } }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.webView === web, message.frameInfo.isMainFrame, let source = message.frameInfo.request.url, let address = descriptor["url"] as? String, let expected = URL(string:address), source.scheme == expected.scheme, source.host == expected.host, source.port == expected.port, let body = message.body as? [String:Any], let action = body["action"] as? String else { return }
        if action == "ready" { ready = true; lastCapture = body["capture"] as? [String:Any] ?? [:]; status.stringValue = "Ready. Start NC28-01; use only synthetic content."; writeReport() }
        else if action == "error" { record(body["message"] as? String ?? "Browser failed") }
        else if action == "pdf", let payload = body["payload"] as? String, payload.count < 400000, let data = Data(base64Encoded:payload), data.count <= 262144, let document = PDFDocument(data:data) {
            let panel = NSWindow(contentRect:NSRect(x:120,y:100,width:700,height:700),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false); panel.title = "Synthetic PDF · Core28"; panel.isReleasedWhenClosed = false; let view = PDFView(frame:panel.contentView?.bounds ?? .zero); view.autoresizingMask = [.width,.height]; view.autoScales = true; view.document = document; panel.contentView = view; pdfWindows.append(panel); panel.makeKeyAndOrderFront(nil); events.append(["event":"native-pdf-opened","pages":document.pageCount]); writeReport()
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame == true else { decisionHandler(.cancel); return }
        guard allowNavigation, let url = navigationAction.request.url, let address = descriptor["url"] as? String, let expected = URL(string:address), url.scheme == expected.scheme, url.host == expected.host, url.port == expected.port, url.path == "/" else { decisionHandler(.cancel); return }
        allowNavigation = false; decisionHandler(.allow)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { ready = false; record("Web content process ended. Saved/protected work stays in the same session. Use same-session reopen; volatile unacknowledged input is not inferred recovered.") }
}

@main
struct Core28Main {
    @MainActor static func main() {
        guard let path = argument("--session"), let report = argument("--report") else { fputs("--session and --report required\n",stderr); return }
        do { let app = NSApplication.shared; app.setActivationPolicy(.regular); let delegate = try Core28Lab(session:URL(fileURLWithPath:path),report:URL(fileURLWithPath:report)); app.delegate = delegate; withExtendedLifetime(delegate) { app.run() } }
        catch { fputs("Core28 startup: \(error)\n",stderr) }
    }
}
