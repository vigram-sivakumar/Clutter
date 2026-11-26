//! Native host for the unmodified table-next-lab.html prototype.
//! This is a separate example binary, NOT Clutter's application or
//! the native-verify filesystem scenario runner. No vault or IPC.
use tauri::{menu::Menu, WebviewUrl, WebviewWindowBuilder};

fn main() {
    let mut context = tauri::generate_context!();
    // Do not create the native-verify filesystem harness window.
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .setup(|app| {
            // Exercise the normal native Edit menu too, not just DOM events.
            app.set_menu(Menu::default(app)?)?;
            let url = "http://localhost:5176/table-next-lab.html?cell=codemirror"
                .parse()
                .expect("static lab URL");
            WebviewWindowBuilder::new(app, "table-lab", WebviewUrl::External(url))
                .title("Clutter — original table prototype (native)")
                .inner_size(1020.0, 900.0)
                .on_navigation(|url| {
                    url.scheme() == "http"
                        && url.host_str() == Some("localhost")
                        && url.port() == Some(5176)
                        && url.path() == "/table-next-lab.html"
                })
                .build()?;
            Ok(())
        })
        .run(context)
        .expect("run native table prototype");
}
