#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod snapshots;
mod windows;
use tauri::Manager;

fn snapshot_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join("snapshots.db"))
}

#[tauri::command]
async fn capture_snapshot(
    app: tauri::AppHandle,
    name: String,
    handles: Vec<String>,
) -> Result<snapshots::Snapshot, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || snapshots::capture(&path, name, handles))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_snapshots(app: tauri::AppHandle) -> Result<Vec<snapshots::Snapshot>, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || snapshots::list(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_snapshot(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || snapshots::delete(&path, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn restore_snapshot(
    app: tauri::AppHandle,
    id: String,
) -> Result<snapshots::RestoreResult, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || snapshots::restore(&path, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discover_windows() -> Result<Vec<windows::WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(windows::enumerate)
        .await
        .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            discover_windows,
            capture_snapshot,
            list_snapshots,
            delete_snapshot,
            restore_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("FlowState desktop failed to start");
}
