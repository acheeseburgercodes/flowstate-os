#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod applications;
mod execution;
mod layouts;
mod projects;
mod snapshots;
mod windows;
use tauri::{Emitter, Manager};

#[tauri::command]
fn startup_status() -> Result<String, String> {
    match std::env::var("FLOWSTATE_STARTUP_STATUS") {
        Ok(path) => std::fs::read_to_string(path).map_err(|_| "Startup status is updating".to_string()),
        Err(_) => Ok("{\"ready\":true,\"logs\":[]}".to_string()),
    }
}

#[tauri::command]
fn local_session_token() -> Result<String, String> {
    std::env::var("FLOWSTATE_API_TOKEN").map_err(|_| "Start with Launch FlowState to connect automatically".to_string())
}

#[tauri::command]
async fn register_project(app: tauri::AppHandle) -> Result<projects::Project, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || projects::register(&path))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn list_projects(app: tauri::AppHandle) -> Result<Vec<projects::Project>, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || projects::list(&path))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn revoke_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || projects::revoke(&path, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn list_monitors() -> Result<Vec<layouts::Monitor>, String> {
    tauri::async_runtime::spawn_blocking(layouts::monitors)
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn preview_layout(
    handles: Vec<String>,
    monitor_id: String,
    layout: String,
) -> Result<Vec<windows::WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || layouts::preview(handles, monitor_id, layout))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn arrange_windows(
    app: tauri::AppHandle,
    handles: Vec<String>,
    monitor_id: String,
    layout: String,
) -> Result<snapshots::RestoreResult, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        layouts::arrange(&path, handles, monitor_id, layout)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn execute_plan(
    app: tauri::AppHandle,
    id: String,
    actions: Vec<execution::Action>,
) -> Result<execution::Execution, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        execution::execute(&path, id, actions, |progress| {
            let _ = app.emit("execution-progress", progress);
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn cancel_execution() {
    execution::cancel();
}

#[tauri::command]
async fn list_executions(app: tauri::AppHandle) -> Result<Vec<execution::Execution>, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || execution::list(&path))
        .await
        .map_err(|error| error.to_string())?
}

fn snapshot_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join("snapshots.db"))
}

#[tauri::command]
async fn register_application(
    app: tauri::AppHandle,
) -> Result<applications::TrustedApplication, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || applications::register(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn list_applications(
    app: tauri::AppHandle,
) -> Result<Vec<applications::TrustedApplication>, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || applications::list(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn revoke_application(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || applications::revoke(&path, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn launch_application(app: tauri::AppHandle, id: String) -> Result<u32, String> {
    let path = snapshot_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || applications::launch(&path, &id))
        .await
        .map_err(|error| error.to_string())?
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
            startup_status,
            local_session_token,
            discover_windows,
            capture_snapshot,
            list_snapshots,
            delete_snapshot,
            restore_snapshot,
            register_application,
            list_applications,
            revoke_application,
            launch_application,
            execute_plan,
            cancel_execution,
            list_executions,
            list_monitors,
            preview_layout,
            arrange_windows,
            register_project,
            list_projects,
            revoke_project
        ])
        .run(tauri::generate_context!())
        .expect("FlowState desktop failed to start");
}
