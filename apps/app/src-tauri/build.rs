/// Every application command registered in `lib.rs`'s `invoke_handler`. Tauri's permission system for application
/// commands is all or nothing: once any is listed here, every command a window calls must be listed and granted to it
/// (see `capabilities/default.json`), or the call is refused, `frontend_ready` included. `tests/command_permissions.rs`
/// fails the build of the tests if this list, the handler and the capability ever disagree.
const APP_COMMANDS: &[&str] = &[
    "frontend_ready",
    "sparkle_update",
    "frontend_failed",
    "set_dock_badge",
    "get_launch_at_login_status",
    "set_launch_at_login_enabled",
    "open_login_items_settings",
    "set_copy_page_link_enabled",
    "atomic_write_file",
    "atomic_inspect_write",
    "atomic_confirm_durability",
    "check_space_filesystem",
    "initialize_space",
    "export_pick_destination",
    "export_copy_file",
    "export_write_file",
    "move_file_no_clobber",
    "copy_file_no_clobber",
    "write_file_no_clobber",
    "parse_cache_read",
    "parse_cache_write",
    "parse_cache_remove",
    "recovery_write",
    "recovery_remove",
    "create_directory",
    "delete_path",
    "trash_path",
    "canonical_space_path",
    "sandbox_info",
    "restore_space_access",
    "remember_space_access",
    "forget_space_access",
    "documents_access",
    "request_documents_access",
    "create_space_folder",
    "ensure_space_access",
    "rename_space_folder",
    "check_rename_parent_access",
    "request_rename_parent_access",
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
    // The bundle identifier names the sandbox container, the saved folder access and the recovery records, and it is the
    // identifier registered with Apple. A packaged build must carry the production one, never the old development one.
    assert!(
        config.contains("\"identifier\": \"com.vigram.clutter\""),
        "tauri.conf.json must set \"identifier\" to com.vigram.clutter, the production bundle identifier."
    );
    assert!(
        !config.contains("com.clutter.dev"),
        "tauri.conf.json must not mention the retired development identifier com.clutter.dev."
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

/// Compile the small Objective-C adapter against the pinned Sparkle SDK only for the integration build.
fn build_sparkle_bridge() {
    println!("cargo:rerun-if-env-changed=CLUTTER_SPARKLE_FRAMEWORK");
    println!("cargo:rerun-if-changed=src/sparkle_bridge.m");
    if std::env::var_os("CARGO_FEATURE_SPARKLE_UPDATES").is_none() {
        return;
    }
    assert!(std::env::var_os("CARGO_FEATURE_DIRECT_UPDATES").is_none(), "Sparkle and Tauri updaters must never coexist");
    assert_eq!(std::env::var("CARGO_CFG_TARGET_OS").as_deref(), Ok("macos"));
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("Unsupported Sparkle target: {other:?}"),
    };
    let framework = std::path::PathBuf::from(std::env::var_os("CLUTTER_SPARKLE_FRAMEWORK")
        .expect("Use scripts/build-sparkle-integration.sh to provide the Sparkle SDK"));
    assert!(framework.join("Headers/Sparkle.h").is_file(), "Sparkle SDK headers missing");
    let search = framework.parent().expect("framework parent");
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
    let object = out.join("sparkle_bridge.o");
    let archive = out.join("libclutter_sparkle_bridge.a");
    let status = std::process::Command::new("xcrun")
        .args(["--sdk", "macosx", "clang", "-arch", arch, "-mmacosx-version-min=13.3",
               "-fobjc-arc", "-fblocks", "-c", "src/sparkle_bridge.m", "-F"])
        .arg(search).arg("-o").arg(&object).status().expect("run clang");
    assert!(status.success(), "Sparkle Objective-C bridge failed to compile");
    let status = std::process::Command::new("xcrun").args(["ar", "crs"])
        .arg(&archive).arg(&object).status().expect("run ar");
    assert!(status.success(), "archive Sparkle bridge");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=clutter_sparkle_bridge");
    println!("cargo:rustc-link-search=framework={}", search.display());
    println!("cargo:rustc-link-lib=framework=Sparkle");
    println!("cargo:rustc-link-lib=framework=Cocoa");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
}

fn main() {
    require_what_every_packaged_build_needs();
    build_sparkle_bridge();
    let attributes = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
}
