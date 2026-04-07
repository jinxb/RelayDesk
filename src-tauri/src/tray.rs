use crate::models::{
    TRAY_HIDE_ID, TRAY_ICON_ID, TRAY_QUIT_ID, TRAY_SHOW_ID,
};
use crate::shell::{hide_main_window, show_main_window, toggle_main_window};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

fn tray_icon_image() -> Image<'static> {
    let bytes = include_bytes!("../icons/icon.png");
    Image::from_bytes(bytes).expect("failed to load tray icon")
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, String> {
    let show = MenuItem::with_id(app, TRAY_SHOW_ID, "Show RelayDesk", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let hide = MenuItem::with_id(app, TRAY_HIDE_ID, "Hide Window", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit RelayDesk", true, Some("CmdOrCtrl+Q"))
        .map_err(|error| error.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?;

    Menu::with_items(app, &[&show, &hide, &separator, &quit]).map_err(|error| error.to_string())
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    if event.id() == TRAY_SHOW_ID {
        let _ = show_main_window(app);
        return;
    }
    if event.id() == TRAY_HIDE_ID {
        let _ = hide_main_window(app);
        return;
    }
    if event.id() == TRAY_QUIT_ID {
        app.exit(0);
    }
}

fn handle_tray_event<R: Runtime>(tray: &tauri::tray::TrayIcon<R>, event: TrayIconEvent) {
    let should_toggle = matches!(
        event,
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            }
    );

    if should_toggle {
        let _ = toggle_main_window(tray.app_handle());
    }
}

pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let menu = build_tray_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&menu)
        .tooltip("RelayDesk")
        .icon(tray_icon_image())
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event);

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(false);
    }

    builder
        .build(app)
        .map_err(|error: tauri::Error| error.to_string())?;
    Ok(())
}
