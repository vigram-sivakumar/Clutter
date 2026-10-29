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

/// The App Store build adds no static capability: the user's real folders are reached through one runtime capability
/// per authorized folder (`space_access::grant_static_scope`), never through a broad path in a file. No capability
/// other than `default` exists, and the ordinary config lists only that one.
#[test]
fn there_is_no_broad_static_scope_for_the_app_store_build() {
    assert!(include_str!("../tauri.conf.json").contains("\"capabilities\": [\"default\"]"));
    assert!(!include_str!("../appstore/tauri.appstore.conf.json").contains("capabilities"));
    assert!(!CAPABILITY.contains("/Users"), "no absolute user path in the default capability");
    assert!(!CAPABILITY.contains("/Volumes"));
    assert!(!std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/app-store.json")).exists());
}
