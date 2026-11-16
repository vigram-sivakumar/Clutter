import Cocoa
import WebKit

@MainActor
final class Host34: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    let config: [String: Any]
    let web: WKWebView
    let window: NSWindow
    var allowed = false
    var guarding = false
    var guardNonce: String?
    init(config: [String: Any]) throws {
        guard let address = config["url"] as? String, let url = URL(string: address), url.scheme == "http", url.host == "127.0.0.1", config["script"] is String, config["report"] is String, config["bootNonce"] is String else { throw NSError(domain: "InvalidHostConfig",code:1) }
        self.config = config
        let preferences = WKWebViewConfiguration(); preferences.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero,configuration:preferences)
        window = NSWindow(contentRect:NSRect(x:80,y:80,width:1024,height:768),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false)
        super.init()
        window.title = "Clutter H-S · build smoke"; window.delegate = self; window.isReleasedWhenClosed = false
        web.navigationDelegate = self; web.autoresizingMask = [.width,.height]
        web.configuration.userContentController.addUserScript(WKUserScript(source:config["script"] as! String,injectionTime:.atDocumentStart,forMainFrameOnly:true))
    }
    func record(_ event: String, safe: Bool? = nil) {
        var value:[String:Any] = ["host":"H-S","event":event]; if let safe = safe { value["safe"] = safe }
        guard let name = config["report"] as? String, var data = try? JSONSerialization.data(withJSONObject:value) else { return }; data.append(10)
        if !FileManager.default.fileExists(atPath:name) { FileManager.default.createFile(atPath:name,contents:nil,attributes:[.posixPermissions:0o600]) }
        if let handle = FileHandle(forWritingAtPath:name) { defer { try? handle.close() }; handle.seekToEndOfFile(); handle.write(data) }
    }
    func applicationDidFinishLaunching(_ note: Notification) {
        web.frame = NSRect(x:0,y:0,width:1024,height:768); window.contentView = web
        let menu = NSMenu(), item = NSMenuItem(); menu.addItem(item); let submenu = NSMenu(); item.submenu = submenu
        submenu.addItem(withTitle:"Quit H-S",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let editItem=NSMenuItem();menu.addItem(editItem);let edit=NSMenu(title:"Edit");editItem.submenu=edit
        for (title, action, key) in [("Cut",#selector(NSText.cut(_:)),"x"),("Copy",#selector(NSText.copy(_:)),"c"),("Paste",#selector(NSText.paste(_:)),"v"),("Select All",#selector(NSText.selectAll(_:)),"a")] { edit.addItem(withTitle:title,action:action,keyEquivalent:key) }
        NSApp.mainMenu=menu; window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        web.load(URLRequest(url:URL(string:config["url"] as! String)!))
    }
    func askClose() {
        if guarding { return }; guarding=true; let nonce=UUID().uuidString; guardNonce=nonce
        let arg = String(data:try! JSONSerialization.data(withJSONObject:[nonce]),encoding:.utf8)!
        web.evaluateJavaScript("globalThis.__host34Close?.("+arg+"[0]);") { _, error in if error != nil { self.guarding=false;self.record("close-guard",safe:false) } }
    }
    func windowShouldClose(_ sender:NSWindow)->Bool { if allowed { return true };askClose();return false }
    func windowWillClose(_ note:Notification) { allowed=true;NSApp.terminate(nil) }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply { if allowed { return .terminateNow };askClose();return .terminateCancel }
    func webView(_ view:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        guard let url=action.request.url else { decisionHandler(.cancel);return }
        if url.scheme == "clutter-host34",url.host == "event",let query=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="m"})?.value,query.utf8.count<=8192,let data=query.data(using:.utf8),let value=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],value["bootNonce"] as? String == config["bootNonce"] as? String {
            let event=value["event"] as? String ?? ""
            if event == "close",value["guardNonce"] as? String == guardNonce { guarding=false;guardNonce=nil;let safe=value["safe"] as? Bool == true;record("close-guard",safe:safe);if safe { allowed=true;DispatchQueue.main.async { self.window.close() } } }
            else if ["ready","error","pdf-not-qualified"].contains(event) { record(event) }
            decisionHandler(.cancel);return
        }
        let expected = config["url"] as? String
        decisionHandler(url.absoluteString == expected ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView) { record("renderer-gone-no-volatile-recovery-inferred") }
}
@main struct Entry34 {
    @MainActor static func main() {
        do {
            guard let i=CommandLine.arguments.firstIndex(of:"--host-config"), i+1<CommandLine.arguments.count else { throw NSError(domain:"HostConfigRequired",code:1) }
            let data=try Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[i+1]));guard data.count<1048576,let config=try JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw NSError(domain:"InvalidHostConfig",code:1) }
            let app=NSApplication.shared;app.setActivationPolicy(.regular);let delegate=try Host34(config:config);app.delegate=delegate;withExtendedLifetime(delegate){app.run()}
        } catch { fputs("H-S setup failed\n",stderr);exit(1) }
    }
}
