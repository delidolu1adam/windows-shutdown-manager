// Kapatma Zamanlayıcı - Tauri backend
//
// Zamanlama mantığının tamamı frontend'de (main.js) çalışır; süre dolduğunda
// tek seferlik bu komut çağrılır ve işlem anında (t=0) gerçekleştirilir.
// Bu sayede Windows'un kendi "shutdown /t" zamanlayıcısına güvenmek yerine
// tüm geri sayım/iptal/düzenleme mantığı uygulama içinde, tek yerde kalır.
//
// Ayrıca bir sistem tepsisi (tray) simgesi kurulur: pencere "-" ile
// gizlendiğinde uygulama arka planda çalışmaya devam eder, tepsi simgesine
// tıklanınca veya menüden "Göster / Gizle" seçilince pencere geri getirilir.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn run_power_action(action: String, force: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let mut args: Vec<&str> = Vec::new();

        match action.as_str() {
            "shutdown" => {
                args.push("/s");
                args.push("/t");
                args.push("0");
                if force {
                    args.push("/f");
                }
            }
            "restart" => {
                args.push("/r");
                args.push("/t");
                args.push("0");
                if force {
                    args.push("/f");
                }
            }
            "logoff" => {
                // "shutdown /l" oturumu anında kapatır; /t ve /f parametrelerini
                // desteklemez, bu yüzden force bayrağı bu işlem için etkisizdir.
                args.push("/l");
            }
            other => {
                return Err(format!("Bilinmeyen işlem: {other}"));
            }
        }

        Command::new("shutdown")
            .args(&args)
            .spawn()
            .map_err(|e| format!("Komut başlatılamadı: {e}"))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (action, force);
        Err("Bu özellik yalnızca Windows üzerinde desteklenir.".to_string())
    }
}

/// Ana pencereyi görünürlük durumuna göre gösterir veya gizler.
fn toggle_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_power_action])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "show_hide", "Göster / Gizle", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("varsayılan pencere ikonu bulunamadı (tauri.conf.json > windows > icon)")
                        .clone(),
                )
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => toggle_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılırken hata oluştu");
}
