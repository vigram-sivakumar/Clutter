/// Every application command registered in `lib.rs`'s `invoke_handler`. Tauri's permission system for application
/// commands is all or nothing: once any is listed here, every command a window calls must be listed and granted to it
/// (see `capabilities/default.json`), or the call is refused, `frontend_ready` included. `tests/command_permissions.rs`
/// fails the build of the tests if this list, the handler and the capability ever disagree.
const APP_COMMANDS: &[&str] = &[
    "frontend_ready",
    "frontend_failed",
    "set_copy_page_link_enabled",
    "atomic_write_file",
    "atomic_inspect_write",
    "atomic_confirm_durability",
    "move_file_no_clobber",
    "parse_cache_read",
    "parse_cache_write",
    "parse_cache_remove",
    "canonical_space_path",
    "sandbox_info",
    "restore_space_access",
    "remember_space_access",
    "documents_access",
    "request_documents_access",
    "create_space_folder",
    "ensure_space_access",
    "rename_space_folder",
    "allow_vault_asset_scope",
    "start_vault_watcher",
    "stop_vault_watcher",
];

/// What a packaged Clutter must be, checked while it is compiled. A release build is the one that gets packaged, and it
/// must not be able to come out unsandboxed or without the atomic writer: Clutter is one app with one saving system
/// and one permission system, whether installed from a local `.dmg` or the Mac App Store. (A debug build may omit the
/// native writer; the app then refuses to open a Space, which the build-matrix tests check.)
fn require_what_every_packaged_build_needs() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=Entitlements.plist");
    if std::env::var("PROFILE").as_deref() != Ok("release") {
        return;
    }
    assert!(
        std::env::var_os("CARGO_FEATURE_ATOMIC_WRITES").is_some(),
        "a release build must include the atomic writer: build with the default `atomic-writes` feature (do not pass --no-default-features). Atomic saves are the only saving system."
    );
    let config = std::fs::read_to_string("tauri.conf.json").expect("read tauri.conf.json");
    assert!(
        config.contains("\"entitlements\": \"Entitlements.plist\""),
        "tauri.conf.json must point bundle.macOS.entitlements at Entitlements.plist: every packaged Clutter is sandboxed."
    );
    let entitlements = std::fs::read_to_string("Entitlements.plist").expect("read Entitlements.plist");
    for required in [
        "com.apple.security.app-sandbox",
        "com.apple.security.files.user-selected.read-write",
        "com.apple.security.files.bookmarks.app-scope",
        "com.apple.security.network.client",
    ] {
        assert!(entitlements.contains(required), "Entitlements.plist is missing {required}: every packaged Clutter needs it.");
    }
    for forbidden in ["temporary-exception", "files.all", "network.server", "get-task-allow"] {
        assert!(!entitlements.contains(forbidden), "Entitlements.plist must not contain {forbidden}.");
    }
}

fn main() {
    require_what_every_packaged_build_needs();
    let attributes = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
}
