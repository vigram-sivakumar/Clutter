//! The application commands are under Tauri's permission system (ADR-063): `build.rs` lists them, the capability
//! grants them to the main window, and `lib.rs` registers them. Tauri refuses any command that is registered but not
//! listed and granted, `frontend_ready` included, so a drift between the three is a broken app. This reads the three
//! files and fails if they disagree.

use std::collections::BTreeSet;

const BUILD_RS: &str = include_str!("../build.rs");
const LIB_RS: &str = include_str!("../src/lib.rs");
const CAPABILITY: &str = include_str!("../capabilities/default.json");

/// The command names `generate_handler![...]` registers: the last path segment of each entry.
fn registered() -> BTreeSet<String> {
    let start = LIB_RS.find("generate_handler![").expect("lib.rs registers commands") + "generate_handler![".len();
    let end = start + LIB_RS[start..].find("])").expect("the handler list ends");

    LIB_RS[start..end]
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("//"))
        .map(|line| line.trim_end_matches(',').rsplit("::").next().unwrap().to_string())
        .collect()
}

/// The names in `build.rs`'s `APP_COMMANDS`.
fn listed() -> BTreeSet<String> {
    let start = BUILD_RS.find("const APP_COMMANDS").expect("build.rs lists the commands");
    let list = &BUILD_RS[start..start + BUILD_RS[start..].find("];").unwrap()];

    list.lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix('"').and_then(|rest| rest.strip_suffix("\",")))
        .map(str::to_string)
        .collect()
}

/// The commands the capability grants, as `allow-<name-with-dashes>`.
fn granted() -> BTreeSet<String> {
    CAPABILITY
        .lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix("\"allow-").and_then(|rest| rest.strip_suffix("\",")))
        .map(|name| name.replace('-', "_"))
        .collect()
}

#[test]
fn every_registered_command_is_listed_and_granted_and_nothing_else_is() {
    let (registered, listed, granted) = (registered(), listed(), granted());

    assert!(!registered.is_empty());
    assert_eq!(listed, granted, "build.rs and capabilities/default.json disagree");
    assert_eq!(registered, listed, "lib.rs and build.rs disagree");
}

#[test]
fn only_the_main_window_is_granted_the_commands() {
    assert!(CAPABILITY.contains("\"windows\": [\"main\"]"));
    assert!(!CAPABILITY.contains("\"remote\""), "no remote origin may be given application commands");
}

/// No build adds a broad static capability: the user's real folders are reached through one runtime capability per
/// authorized folder (`space_access::grant_static_scope`), never through a broad path in a file. No capability other
/// than `default` exists, and the config lists only that one.
#[test]
fn there_is_no_broad_static_scope_in_any_build() {
    assert!(include_str!("../tauri.conf.json").contains("\"capabilities\": [\"default\"]"));
    assert!(!CAPABILITY.contains("/Users"), "no absolute user path in the default capability");
    assert!(!CAPABILITY.contains("/Volumes"));
    assert!(!std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/app-store.json")).exists());
}

/// One sandbox entitlement set for every packaged build: the local build and the App Store build are the same app with
/// the same sandboxed filesystem behavior; only signing and the identifiers Apple adds differ.
#[test]
fn every_packaged_build_is_sandboxed_with_the_same_entitlements() {
    let config = include_str!("../tauri.conf.json");
    let entitlements = include_str!("../Entitlements.plist");
    assert!(config.contains("\"entitlements\": \"Entitlements.plist\""));
    for required in [
        "com.apple.security.app-sandbox",
        "com.apple.security.files.user-selected.read-write",
        "com.apple.security.files.bookmarks.app-scope",
        "com.apple.security.network.client",
    ] {
        assert!(entitlements.contains(required), "{required}");
    }
    for forbidden in ["temporary-exception", "files.all", "network.server", "get-task-allow"] {
        assert!(!entitlements.contains(forbidden), "{forbidden}");
    }
}

/// The configuration carries the production identity and nothing of the development one: the bundle identifier names
/// the sandbox container and the app's saved data, and Apple registers it. The build number is its own value, apart
/// from the marketing version, so each App Store upload can raise it without a new version (`bundleVersion`).
#[test]
fn the_configuration_carries_the_production_identity() {
    let config = include_str!("../tauri.conf.json");
    assert!(config.contains("\"identifier\": \"com.vigram.clutter\""));
    assert!(!config.contains("com.clutter.dev"));
    assert!(config.contains("\"productName\": \"Clutter\""));
    assert!(config.contains("\"category\": \"Productivity\""));
    assert!(config.contains("\"bundleVersion\": \"1\""));
    assert!(config.contains("\"minimumSystemVersion\": \"13.3\""));
    assert!(config.contains("\"copyright\": \"© 2026 Vigram Sivakumar\""));
    assert!(config.contains("\"version\": \"../package.json\""), "the marketing version has one source: apps/app/package.json");
}

/// Development runs have their own identity, so they can never share the packaged app's container, saved folder access
/// or app data. The override file carries the identifier and nothing else (so it cannot quietly change the sandbox,
/// permissions or window settings of a development run), and it is applied only by `scripts/tauri.sh` for `tauri dev`
/// and by `scripts/dev-sandboxed.sh`; the packaged configuration never names it.
#[test]
fn development_runs_use_their_own_identifier_and_nothing_else_differs() {
    let dev: serde_json::Value = serde_json::from_str(include_str!("../tauri.dev.conf.json")).unwrap();
    let object = dev.as_object().unwrap();
    assert_eq!(object.get("identifier").and_then(|v| v.as_str()), Some("com.vigram.clutter.dev"));
    assert!(object.keys().all(|key| key == "identifier" || key == "$schema"), "the development override sets only the identifier");
    assert!(!include_str!("../tauri.conf.json").contains("com.vigram.clutter.dev"));
}

/// What script may run in the webview is a security boundary: the webview can call the native commands, so a script
/// injection bug would reach the user's notes. The packaged policy lets scripts come from the app itself only
/// (`script-src 'self'`; Tauri adds the hashes of the page's own inline scripts at build time), with no `eval` and no
/// inline script. The development server needs both (Vite's React refresh injects an inline preamble), so that is
/// confined to `devCsp`, which only a development run uses. `style-src` keeps `'unsafe-inline'` on purpose: the editor
/// and the components set inline styles at runtime, which a hash or nonce cannot cover.
#[test]
fn the_packaged_policy_allows_no_eval_and_no_inline_script_and_only_development_may() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let security = &config["app"]["security"];
    let csp = security["csp"].as_object().expect("the packaged policy is a directive map");
    let dev = security["devCsp"].as_object().expect("development has its own policy, so the packaged one can be strict");
    let text = |directives: &serde_json::Map<String, serde_json::Value>, name: &str| directives.get(name).and_then(|v| v.as_str()).unwrap_or("").to_string();

    for (name, value) in csp {
        let value = value.as_str().unwrap();
        assert!(!value.contains("'unsafe-eval'"), "{name} allows eval in the packaged app");
        assert!(!value.contains("localhost:5173") && !value.contains("localhost:1421"), "{name} names the dev server in the packaged app");
        if name != "style-src" {
            assert!(!value.contains("'unsafe-inline'"), "{name} allows inline code in the packaged app");
        }
    }
    assert_eq!(text(csp, "script-src"), "'self'", "scripts come from the app only");
    assert_eq!(text(csp, "object-src"), "'none'");
    assert_eq!(text(csp, "base-uri"), "'self'");
    // The development policy is where the permissive keywords live, and the only place.
    assert!(text(dev, "default-src").contains("'unsafe-eval'"));
}
