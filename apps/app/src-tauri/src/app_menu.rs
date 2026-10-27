//! The native macOS menu bar: Clutter's own "Clutter" (application) and File menus, plus one added Edit item and the
//! View menu's zoom items.
//!
//! The rest of the bar (Edit, View, Window, Help) stays exactly what Tauri's default menu provides until each is
//! designed separately, so `install` starts from that default and swaps out only the submenus Clutter owns.
//!
//! Hide, Hide Others, Show All, Services and About are predefined native items, so the system supplies their
//! behaviour and shortcuts. Settings… and Quit are custom: Settings… asks the frontend to open the existing Settings
//! dialog, and Quit asks the frontend to close the window the same way the close button does, so unsaved changes are
//! never discarded without the user being asked. (Quitting from the Dock menu or at logout still ends the process
//! directly: tao installs no applicationShouldTerminate hook that could defer it.)

use tauri::menu::{
    AboutMetadata, Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu,
};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Id of the Edit menu's "Copy Link to Current Page" item (placed right below the native Copy).
pub const COPY_PAGE_LINK_ITEM_ID: &str = "edit-copy-page-link";

/// Event the frontend listens for to copy the open page's link (see src/app/layouts/sidebar/useNativeEditMenu.ts).
pub const COPY_PAGE_LINK_EVENT: &str = "menu:copy-page-link";

/// Id of the Quit item, matched in `handle_event`. Quit is custom (not the predefined native item) because the native
/// one ends the process immediately: the page could never ask about unsaved changes first.
pub const QUIT_ITEM_ID: &str = "app-quit";

/// Event the frontend listens for to run its close flow (flush, then the unsaved-changes dialog if needed, then
/// destroy the window, which ends the app). See src/app/windowCloseHandler.ts.
pub const QUIT_REQUESTED_EVENT: &str = "menu:quit";

/// Id of the Settings… item, matched in `handle_event`.
pub const SETTINGS_ITEM_ID: &str = "app-settings";

/// Event the frontend listens for to open its Settings dialog (see src/app/useNativeSettingsMenu.ts).
pub const OPEN_SETTINGS_EVENT: &str = "menu:open-settings";

/// File-menu items that run an existing app action: (item id, label, frontend event, accelerator). The frontend
/// listens for these exact event names (src/app/layouts/sidebar/useNativeFileMenu.ts) and runs the same handlers as
/// the sidebar's Create menu. The accelerators are the shortcuts the Keyboard shortcuts dialog lists
/// (src/app/shortcuts/shortcuts.ts, `owner: 'native'`): the menu owns them on the desktop, so the page does not
/// also handle them.
pub const FILE_ACTIONS: [(&str, &str, &str, &str); 3] = [
    ("file-new-note", "New Note", "menu:new-note", "CmdOrCtrl+N"),
    ("file-new-daily-note", "Today’s Daily Note", "menu:new-daily-note", "CmdOrCtrl+Shift+D"),
    ("file-new-folder", "New Folder", "menu:new-folder", "CmdOrCtrl+Shift+N"),
];

/// Go-menu items: (item id, label, frontend event, accelerator). History navigation, as in Safari's History menu.
/// Menu items, so the system shows and owns the shortcut; the Markdown editor does not bind ⌘[ or ⌘] (they used to
/// indent, see editorDefaultKeymap.ts), so they work with a note focused too. The frontend listens in
/// src/app/layouts/app-layout/useNativeGoMenu.ts.
pub const GO_ACTIONS: [(&str, &str, &str, &str); 2] = [
    ("go-back", "Back", "menu:go-back", "CmdOrCtrl+["),
    ("go-forward", "Forward", "menu:go-forward", "CmdOrCtrl+]"),
];

/// Ids of the View menu's zoom items, matched in `handle_event`. Zoom is handled entirely here: it scales the whole
/// webview and involves no vault, page or frontend state, so no event is forwarded.
pub const ZOOM_ACTUAL_SIZE_ITEM_ID: &str = "view-actual-size";
pub const ZOOM_IN_ITEM_ID: &str = "view-zoom-in";
pub const ZOOM_OUT_ITEM_ID: &str = "view-zoom-out";

/// Event the frontend listens for to learn the zoom factor (see src/app/nativeZoom.ts); the payload is the factor.
pub const ZOOM_CHANGED_EVENT: &str = "zoom:changed";

/// Label of the one window the zoom applies to (see tauri.conf.json).
const MAIN_WINDOW_LABEL: &str = "main";

const ZOOM_STEP: f64 = 0.1;
const ZOOM_MIN: f64 = 0.5;
const ZOOM_MAX: f64 = 3.0;

/// What a zoom menu item asks for.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ZoomAction {
    In,
    Out,
    Reset,
}

/// The webview's current zoom factor (1.0 is actual size). Not persisted: a new launch starts at actual size.
pub struct ZoomState(Mutex<f64>);

impl Default for ZoomState {
    fn default() -> Self {
        Self(Mutex::new(1.0))
    }
}

/// The zoom action a menu item id stands for, or None for any other item.
fn zoom_action_for_item(id: &str) -> Option<ZoomAction> {
    match id {
        ZOOM_IN_ITEM_ID => Some(ZoomAction::In),
        ZOOM_OUT_ITEM_ID => Some(ZoomAction::Out),
        ZOOM_ACTUAL_SIZE_ITEM_ID => Some(ZoomAction::Reset),
        _ => None,
    }
}

/// The zoom factor after `action`, kept within the allowed range. Rounded to two decimals so repeated steps do not
/// drift (0.1 is not exact in binary floating point).
fn next_zoom(current: f64, action: ZoomAction) -> f64 {
    let target = match action {
        ZoomAction::In => current + ZOOM_STEP,
        ZoomAction::Out => current - ZOOM_STEP,
        ZoomAction::Reset => 1.0,
    };
    ((target * 100.0).round() / 100.0).clamp(ZOOM_MIN, ZOOM_MAX)
}

/// Applies a zoom action to the main window's webview and remembers the new factor.
fn apply_zoom<R: Runtime>(app: &AppHandle<R>, action: ZoomAction) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else { return };
    let state = app.state::<ZoomState>();
    let Ok(mut zoom) = state.0.lock() else { return };
    let next = next_zoom(*zoom, action);
    match window.set_zoom(next) {
        Ok(()) => {
            *zoom = next;
            // The native traffic lights do not scale with the zoom, so the frontend holds the window chrome beside
            // them at a constant on-screen size from this factor (src/app/nativeZoom.ts).
            if let Err(error) = app.emit(ZOOM_CHANGED_EVENT, next) {
                log::error!("could not announce zoom {next}: {error}");
            }
        }
        Err(error) => log::error!("could not set zoom to {next}: {error}"),
    }
}

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

    let quit = MenuItem::with_id(
        app,
        QUIT_ITEM_ID,
        format!("Quit {name}"),
        true,
        Some("CmdOrCtrl+Q"),
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
            &quit,
        ],
    )
}

/// New Note, Today’s Daily Note / New Folder, grouped by separators. There is deliberately no Close Window item and
/// no New Window: Clutter is single-window by construction (see the multi-window notes in docs/autosave-*.md; the
/// vault watcher, window label and document registry are all process-global).
#[cfg(target_os = "macos")]
fn build_file_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let [note, daily, folder] =
        FILE_ACTIONS.map(|(id, label, _, accelerator)| MenuItem::with_id(app, id, label, true, Some(accelerator)));
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

/// The Go menu: Back and Forward.
#[cfg(target_os = "macos")]
fn build_go_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let [back, forward] =
        GO_ACTIONS.map(|(id, label, _, accelerator)| MenuItem::with_id(app, id, label, true, Some(accelerator)));
    Submenu::with_items(app, "Go", true, &[&back?, &forward?])
}

/// Inserts the Go menu right after View (before Window), where macOS apps put navigation.
#[cfg(target_os = "macos")]
fn add_go_menu<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let go = build_go_submenu(app)?;
    let after_view = menu
        .items()?
        .iter()
        .position(|item| item.as_submenu().is_some_and(|s| s.text().is_ok_and(|t| t == "View")))
        .map(|index| index + 1);
    match after_view {
        Some(position) => menu.insert(&go, position),
        None => menu.append(&go),
    }
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

/// Adds Actual Size / Zoom In / Zoom Out at the top of the existing View submenu, above its native items.
#[cfg(target_os = "macos")]
fn add_zoom_items<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    // "=" is the key ⌘+ is typed on (without Shift), as in other Mac apps.
    let actual = MenuItem::with_id(app, ZOOM_ACTUAL_SIZE_ITEM_ID, "Actual Size", true, Some("CmdOrCtrl+0"))?;
    let zoom_in = MenuItem::with_id(app, ZOOM_IN_ITEM_ID, "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, ZOOM_OUT_ITEM_ID, "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    for entry in menu.items()? {
        let Some(view) = entry.as_submenu() else { continue };
        if view.text()? != "View" {
            continue;
        }
        view.insert(&actual, 0)?;
        view.insert(&zoom_in, 1)?;
        view.insert(&zoom_out, 2)?;
        return view.insert(&PredefinedMenuItem::separator(app)?, 3);
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
    add_zoom_items(app, &menu)?;
    add_go_menu(app, &menu)?;
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
    if event.id().as_ref() == QUIT_ITEM_ID {
        request_quit(app);
        return;
    }
    if let Some(action) = zoom_action_for_item(event.id().as_ref()) {
        apply_zoom(app, action);
        return;
    }
    if let Some(name) = event_for_item(event.id().as_ref()) {
        if let Err(error) = app.emit(name, ()) {
            log::error!("could not forward menu item {}: {error}", event.id().as_ref());
        }
    }
}

/// Asks the page to close. If the page cannot take the request (the window is not showing: startup has not finished
/// or has failed, so there is no editor and nothing unsaved) the app exits directly, so Quit never goes dead.
fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let page_is_showing = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .is_some_and(|window| window.is_visible().unwrap_or(false));

    if page_is_showing && app.emit(QUIT_REQUESTED_EVENT, ()).is_ok() {
        return;
    }
    app.exit(0);
}

/// The frontend event a custom menu item forwards to, or None for items the system handles itself.
fn event_for_item(id: &str) -> Option<&'static str> {
    if id == SETTINGS_ITEM_ID {
        return Some(OPEN_SETTINGS_EVENT);
    }
    if id == COPY_PAGE_LINK_ITEM_ID {
        return Some(COPY_PAGE_LINK_EVENT);
    }
    FILE_ACTIONS
        .iter()
        .chain(GO_ACTIONS.iter())
        .find(|(item, _, _, _)| *item == id)
        .map(|(_, _, event, _)| *event)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quit_is_a_custom_item_the_generic_forwarder_does_not_claim() {
        // handle_event routes it to request_quit() before event_for_item() is consulted.
        assert_eq!(QUIT_ITEM_ID, "app-quit");
        assert_eq!(event_for_item(QUIT_ITEM_ID), None);
        assert_eq!(QUIT_REQUESTED_EVENT, "menu:quit");
    }

    #[test]
    fn file_items_forward_to_their_frontend_events() {
        assert_eq!(event_for_item("file-new-note"), Some("menu:new-note"));
        assert_eq!(event_for_item("file-new-daily-note"), Some("menu:new-daily-note"));
        assert_eq!(event_for_item("file-new-folder"), Some("menu:new-folder"));
        assert_eq!(event_for_item(SETTINGS_ITEM_ID), Some(OPEN_SETTINGS_EVENT));
        assert_eq!(event_for_item("unknown"), None);
    }

    #[test]
    fn go_items_forward_to_their_frontend_events() {
        assert_eq!(event_for_item("go-back"), Some("menu:go-back"));
        assert_eq!(event_for_item("go-forward"), Some("menu:go-forward"));
    }

    #[test]
    fn accelerators_are_the_ones_the_shortcuts_dialog_lists() {
        // src/app/shortcuts/shortcuts.ts is the other half of this: change one side and change the other.
        let accelerators: Vec<_> = FILE_ACTIONS.iter().chain(GO_ACTIONS.iter()).map(|a| (a.0, a.3)).collect();
        assert_eq!(
            accelerators,
            vec![
                ("file-new-note", "CmdOrCtrl+N"),
                ("file-new-daily-note", "CmdOrCtrl+Shift+D"),
                ("file-new-folder", "CmdOrCtrl+Shift+N"),
                ("go-back", "CmdOrCtrl+["),
                ("go-forward", "CmdOrCtrl+]"),
            ]
        );
    }

    #[test]
    fn copy_page_link_forwards_to_its_frontend_event() {
        assert_eq!(event_for_item("edit-copy-page-link"), Some("menu:copy-page-link"));
    }

    #[test]
    fn zoom_items_map_to_their_actions() {
        assert_eq!(zoom_action_for_item(ZOOM_IN_ITEM_ID), Some(ZoomAction::In));
        assert_eq!(zoom_action_for_item(ZOOM_OUT_ITEM_ID), Some(ZoomAction::Out));
        assert_eq!(zoom_action_for_item(ZOOM_ACTUAL_SIZE_ITEM_ID), Some(ZoomAction::Reset));
        assert_eq!(zoom_action_for_item(SETTINGS_ITEM_ID), None);
        // Zoom is handled natively, so it never forwards a frontend event.
        assert_eq!(event_for_item(ZOOM_IN_ITEM_ID), None);
    }

    #[test]
    fn zoom_event_name_is_stable() {
        // The frontend listens for this exact name; changing one side alone silently breaks the window-chrome sizing.
        assert_eq!(ZOOM_CHANGED_EVENT, "zoom:changed");
    }

    #[test]
    fn zoom_steps_by_a_tenth_without_drift() {
        let mut zoom = 1.0;
        for _ in 0..3 {
            zoom = next_zoom(zoom, ZoomAction::In);
        }
        assert_eq!(zoom, 1.3);
        assert_eq!(next_zoom(zoom, ZoomAction::Out), 1.2);
    }

    #[test]
    fn zoom_is_clamped_and_resets_to_actual_size() {
        assert_eq!(next_zoom(ZOOM_MAX, ZoomAction::In), ZOOM_MAX);
        assert_eq!(next_zoom(ZOOM_MIN, ZoomAction::Out), ZOOM_MIN);
        assert_eq!(next_zoom(2.4, ZoomAction::Reset), 1.0);
    }

    #[test]
    fn file_action_ids_and_events_are_unique() {
        let all: Vec<_> = FILE_ACTIONS.iter().chain(GO_ACTIONS.iter()).collect();
        for (i, a) in all.iter().enumerate() {
            for b in all.iter().skip(i + 1) {
                assert_ne!(a.0, b.0);
                assert_ne!(a.2, b.2);
                assert_ne!(a.3, b.3, "two menu items share an accelerator");
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
