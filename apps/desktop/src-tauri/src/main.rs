// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;

use database::DbConnection;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .manage(DbConnection(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            database::init_database,
            database::save_note,
            database::load_note,
            database::load_all_notes,
            database::search_notes,
            database::save_folder,
            database::load_all_folders,
            database::save_tag,
            database::load_all_tags,
            database::delete_tag,
            database::delete_note_permanently,
            database::delete_folder_permanently,
            database::cleanup_database,
            database::save_ui_state,
            database::load_ui_state,
            database::load_all_ui_state,
            database::append_block_intents,
            database::rebuild_blocks_from_journal,
            database::load_blocks_for_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

