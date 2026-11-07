use crate::windows::{self, WindowInfo};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
pub(crate) static RESTORE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub captured_at: u64,
    pub windows: Vec<WindowInfo>,
    pub schema_version: u32,
    #[serde(default)]
    pub monitors: Vec<crate::layouts::Monitor>,
}

#[derive(Serialize)]
pub struct RestoreResult {
    pub rollback_snapshot_id: String,
    pub results: Vec<ActionResult>,
}

#[derive(Serialize)]
pub struct ActionResult {
    pub title: String,
    pub success: bool,
    pub detail: String,
}

fn connect(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, captured_at INTEGER NOT NULL, payload TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;
    Ok(db)
}

pub fn save(path: &Path, name: String, windows: Vec<WindowInfo>) -> Result<Snapshot, String> {
    if name.trim().is_empty() || name.len() > 200 || windows.is_empty() || windows.len() > 100 {
        return Err("Provide a name and select between 1 and 100 windows".into());
    }
    let snapshot = Snapshot {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        captured_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs(),
        windows,
        schema_version: 2,
        monitors: crate::layouts::monitors()?,
    };
    connect(path)?
        .execute(
            "INSERT INTO snapshots VALUES (?1, ?2, ?3)",
            params![
                snapshot.id,
                i64::try_from(snapshot.captured_at)
                    .map_err(|_| "Timestamp exceeds SQLite range")?,
                serde_json::to_string(&snapshot).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(snapshot)
}

pub fn capture(path: &Path, name: String, handles: Vec<String>) -> Result<Snapshot, String> {
    let selected: Vec<_> = windows::enumerate()?
        .into_iter()
        .filter(|window| handles.contains(&window.handle))
        .collect();
    if selected.len() != handles.len() {
        return Err("Window selection changed. Refresh and select again.".into());
    }
    save(path, name, selected)
}

pub fn list(path: &Path) -> Result<Vec<Snapshot>, String> {
    let db = connect(path)?;
    let mut statement = db
        .prepare("SELECT payload FROM snapshots ORDER BY captured_at DESC, rowid DESC LIMIT 200")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
    })
    .collect()
}

pub fn load(path: &Path, id: &str) -> Result<Snapshot, String> {
    let payload: String = connect(path)?
        .query_row("SELECT payload FROM snapshots WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .map_err(|_| "Snapshot not found".to_string())?;
    let snapshot: Snapshot = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    if snapshot.schema_version != 2 {
        return Err("Legacy snapshot coordinates cannot be safely restored. Capture a new DPI-aware snapshot.".into());
    }
    Ok(snapshot)
}

pub fn delete(path: &Path, id: &str) -> Result<(), String> {
    if connect(path)?
        .execute("DELETE FROM snapshots WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?
        != 1
    {
        return Err("Snapshot not found".into());
    }
    Ok(())
}

pub fn restore(path: &Path, id: &str) -> Result<RestoreResult, String> {
    let _guard = RESTORE_LOCK
        .try_lock()
        .map_err(|_| "Another restore is awaiting approval or running")?;
    let snapshot = load(path, id)?;
    let displays = crate::layouts::monitors()?;
    if snapshot.monitors.len() != displays.len()
        || snapshot.monitors.iter().any(|saved| {
            !displays.iter().any(|current| {
                (saved.x, saved.y, saved.width, saved.height)
                    == (current.x, current.y, current.width, current.height)
            })
        })
    {
        return Err("Monitor work areas changed since capture. Use a new layout preview instead of restoring stale coordinates.".into());
    }
    if !windows::confirm_restore(&snapshot.name, snapshot.windows.len()) {
        return Err("Restore cancelled at the local approval dialog".into());
    }
    let current = windows::enumerate()?;
    let matching: Vec<_> = current
        .into_iter()
        .filter(|window| {
            snapshot
                .windows
                .iter()
                .any(|old| windows::same_window(old, window))
        })
        .collect();
    if matching.is_empty() {
        return Err("None of the captured windows are still running. Relaunch restoration is not supported yet.".into());
    }
    let rollback = save(
        path,
        format!("Before restore: {}", snapshot.name)
            .chars()
            .take(100)
            .collect(),
        matching,
    )?;
    let results = snapshot
        .windows
        .iter()
        .map(|window| match windows::restore_bounds(window) {
            Ok(()) => ActionResult {
                title: window.title.clone(),
                success: true,
                detail: "Position and size verified".into(),
            },
            Err(detail) => ActionResult {
                title: window.title.clone(),
                success: false,
                detail,
            },
        })
        .collect();
    Ok(RestoreResult {
        rollback_snapshot_id: rollback.id,
        results,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn snapshots_survive_reopening_and_can_be_deleted() {
        let path = std::env::temp_dir().join(format!("flowstate-{}.db", uuid::Uuid::new_v4()));
        let window = crate::windows::WindowInfo {
            handle: "fixture".into(),
            process_id: 1,
            title: "Test fixture".into(),
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            minimized: false,
            maximized: false,
            process_started: Some(1),
        };
        let saved = super::save(&path, "Test snapshot".into(), vec![window]).unwrap();
        assert_eq!(super::list(&path).unwrap().len(), 1);
        assert_eq!(super::load(&path, &saved.id).unwrap().windows[0].width, 800);
        super::delete(&path, &saved.id).unwrap();
        assert!(super::load(&path, &saved.id).is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn empty_capture_is_rejected_without_creating_a_database() {
        let path = std::env::temp_dir().join(format!("flowstate-{}.db", uuid::Uuid::new_v4()));
        assert!(super::save(&path, "Empty".into(), vec![]).is_err());
        assert!(!path.exists());
    }
}
