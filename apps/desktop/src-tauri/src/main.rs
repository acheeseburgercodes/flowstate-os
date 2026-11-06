#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod windows;

#[tauri::command]
async fn discover_windows() -> Result<Vec<windows::WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(windows::enumerate)
        .await
        .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![discover_windows])
        .run(tauri::generate_context!())
        .expect("FlowState desktop failed to start");
}
