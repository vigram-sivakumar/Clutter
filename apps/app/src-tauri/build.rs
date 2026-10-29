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
    "create_space_folder",
    "ensure_space_access",
    "rename_space_folder",
    "allow_vault_asset_scope",
    "start_vault_watcher",
    "stop_vault_watcher",
];

fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
}
