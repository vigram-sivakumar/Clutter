//! The native macOS menu bar: Clutter's own "Clutter" (application) and File menus, plus one added Edit item.
//!
//! The rest of the bar (Edit, View, Window, Help) stays exactly what Tauri's default menu provides until each is
//! designed separately, so `install` starts from that default and swaps out only the submenus Clutter owns.
//!
//! Hide, Hide Others, Show All, Services, About and Quit are predefined native items, so the system supplies their
//! behaviour and shortcuts. Only Settings… is custom: it asks the frontend to open the existing Settings dialog.

use tauri::menu::{
    AboutMetadata, Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu,
};
use tauri::{AppHandle, Emitter, Runtime};

/// Id of the Edit menu's "Copy Link to Current Page" item (placed right below the native Copy).
pub const COPY_PAGE_LINK_ITEM_ID: &str = "edit-copy-page-link";

/// Event the frontend listens for to copy the open page's link (see src/app/layouts/sidebar/useNativeEditMenu.ts).
pub const COPY_PAGE_LINK_EVENT: &str = "menu:copy-page-link";

/// Id of the Settings… item, matched in `handle_event`.
pub const SETTINGS_ITEM_ID: &str = "app-settings";

/// Event the frontend listens for to open its Settings dialog (see src/app/useNativeSettingsMenu.ts).
pub const OPEN_SETTINGS_EVENT: &str = "menu:open-settings";

/// File-menu items that run an existing app action: (item id, label, frontend event). The frontend listens for these
/// exact event names (src/app/useNativeFileMenu.ts) and runs the same handlers as the sidebar's Create menu.
pub const FILE_ACTIONS: [(&str, &str, &str); 3] = [
    ("file-new-note", "New Note", "menu:new-note"),
    ("file-new-daily-note", "Today’s Daily Note", "menu:new-daily-note"),
    ("file-new-folder", "New Folder", "menu:new-folder"),
];

/// Builds the Clutter menu: About / Settings… / Services / Hide, Hide Others, Show All / Quit, grouped by separators.
#[cfg(target_os = "macos")]
fn build_app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let package = app.package_info();
    let name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| package.name.clone());

    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(package.version.to_string()),
        ..Default::default()
    };
    let settings = MenuItem::with_id(
        app,
        SETTINGS_ITEM_ID,
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    Submenu::with_items(
        app,
        &name,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&format!("About {name}")), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&format!("Hide {name}")))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&format!("Quit {name}")))?,
        ],
    )
}

/// New Note, Today’s Daily Note / New Folder, grouped by separators. There is deliberately no Close Window item and
/// no New Window: Clutter is single-window by construction (see the multi-window notes in docs/autosave-*.md; the
/// vault watcher, window label and document registry are all process-global).
#[cfg(target_os = "macos")]
fn build_file_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let [note, daily, folder] = FILE_ACTIONS.map(|(id, label, _)| MenuItem::with_id(app, id, label, true, None::<&str>));
    Submenu::with_items(
        app,
        "File",
        true,
        &[
            &note?,
            &daily?,
            &PredefinedMenuItem::separator(app)?,
            &folder?,
        ],
    )
}

/// Adds "Copy Link to Current Page" directly below the native Copy item of the existing Edit submenu. Every other Edit
/// item is left exactly as Tauri's default menu provides it.
#[cfg(target_os = "macos")]
fn add_copy_page_link<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let item = MenuItem::with_id(
        app,
        COPY_PAGE_LINK_ITEM_ID,
        "Copy Link to Current Page",
        // Disabled until the frontend reports an open page (see `set_copy_page_link_enabled`).
        false,
        None::<&str>,
    )?;
    for entry in menu.items()? {
        let Some(edit) = entry.as_submenu() else { continue };
        if edit.text()? != "Edit" {
            continue;
        }
        let position = edit
            .items()?
            .iter()
            .position(|child| matches!(child, MenuItemKind::Predefined(p) if p.text().is_ok_and(|t| t == "Copy")))
            .map(|index| index + 1);
        return match position {
            Some(position) => edit.insert(&item, position),
            None => edit.append(&item),
        };
    }
    Ok(())
}

/// Enables or disables "Copy Link to Current Page"; the frontend enables it only while a page is open.
#[tauri::command]
pub fn set_copy_page_link_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let Some(menu) = app.menu() else { return Ok(()) };
    for entry in menu.items().map_err(|e| e.to_string())? {
        let Some(edit) = entry.as_submenu() else { continue };
        if let Some(MenuItemKind::MenuItem(item)) = edit.get(COPY_PAGE_LINK_ITEM_ID) {
            return item.set_enabled(enabled).map_err(|e| e.to_string());
        }
    }
    Ok(())
}

/// Replaces the submenu titled `title` in `menu` with `replacement`, keeping its position.
#[cfg(target_os = "macos")]
fn replace_submenu<R: Runtime>(menu: &Menu<R>, title: &str, replacement: &Submenu<R>) -> tauri::Result<()> {
    let position = menu
        .items()?
        .iter()
        .position(|item| item.as_submenu().is_some_and(|s| s.text().is_ok_and(|t| t == title)));
    match position {
        Some(index) => {
            menu.remove_at(index)?;
            menu.insert(replacement, index)
        }
        None => menu.append(replacement),
    }
}

/// Installs the menu bar: Tauri's default bar with the application and File submenus replaced by Clutter's.
#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    // The application menu is always first; Tauri titles it with the package name, so it is replaced by position.
    menu.remove_at(0)?;
    menu.insert(&build_app_submenu(app)?, 0)?;
    replace_submenu(&menu, "File", &build_file_submenu(app)?)?;
    add_copy_page_link(app, &menu)?;
    app.set_menu(menu)?;
    Ok(())
}

/// Other platforms keep Tauri's default menu untouched.
#[cfg(not(target_os = "macos"))]
pub fn install<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}

/// Routes a menu click. Settings… only notifies the frontend, which owns the dialog and decides whether it can open.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if let Some(name) = event_for_item(event.id().as_ref()) {
        if let Err(error) = app.emit(name, ()) {
            log::error!("could not forward menu item {}: {error}", event.id().as_ref());
        }
    }
}

/// The frontend event a custom menu item forwards to, or None for items the system handles itself.
fn event_for_item(id: &str) -> Option<&'static str> {
    if id == SETTINGS_ITEM_ID {
        return Some(OPEN_SETTINGS_EVENT);
    }
    if id == COPY_PAGE_LINK_ITEM_ID {
        return Some(COPY_PAGE_LINK_EVENT);
    }
    FILE_ACTIONS.iter().find(|(item, _, _)| *item == id).map(|(_, _, event)| *event)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_items_forward_to_their_frontend_events() {
        assert_eq!(event_for_item("file-new-note"), Some("menu:new-note"));
        assert_eq!(event_for_item("file-new-daily-note"), Some("menu:new-daily-note"));
        assert_eq!(event_for_item("file-new-folder"), Some("menu:new-folder"));
        assert_eq!(event_for_item(SETTINGS_ITEM_ID), Some(OPEN_SETTINGS_EVENT));
        assert_eq!(event_for_item("unknown"), None);
    }

    #[test]
    fn copy_page_link_forwards_to_its_frontend_event() {
        assert_eq!(event_for_item("edit-copy-page-link"), Some("menu:copy-page-link"));
    }

    #[test]
    fn file_action_ids_and_events_are_unique() {
        for (i, a) in FILE_ACTIONS.iter().enumerate() {
            for b in FILE_ACTIONS.iter().skip(i + 1) {
                assert_ne!(a.0, b.0);
                assert_ne!(a.2, b.2);
            }
        }
    }

    #[test]
    fn event_and_item_ids_are_stable() {
        // The frontend listens for this exact name; changing one side alone silently breaks Settings….
        assert_eq!(OPEN_SETTINGS_EVENT, "menu:open-settings");
        assert_eq!(SETTINGS_ITEM_ID, "app-settings");
    }
}
