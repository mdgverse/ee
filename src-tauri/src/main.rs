// Evita abrir um console do Windows junto da janela em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::PageLoadEvent;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // A janela nasce com `visible: false` no tauri.conf.json. So a exibimos
        // quando o webview terminou de carregar: isso elimina o "flash branco"
        // e faz o app *parecer* (e efetivamente ficar) pronto mais rapido.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Some(window) = webview.window().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .setup(|app| {
            // Rede de seguranca: se por algum motivo o on_page_load nao disparar
            // (pagina com erro, por exemplo), mostramos a janela mesmo assim.
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(3000));
                    let _ = w.show();
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o EE Editor");
}
