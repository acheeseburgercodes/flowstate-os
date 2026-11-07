use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

static EXECUTION_LOCK: Mutex<()> = Mutex::new(());
static CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    LaunchApplication {
        application_id: String,
    },
    OpenUrl {
        url: String,
    },
    OpenProject {
        application_id: String,
        project_id: String,
    },
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ActionResult {
    pub index: usize,
    pub state: String,
    pub detail: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Execution {
    pub id: String,
    pub state: String,
    pub results: Vec<ActionResult>,
}

fn database(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|error| error.to_string())?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS local_executions (id TEXT PRIMARY KEY, actions TEXT NOT NULL, result TEXT NOT NULL);").map_err(|error| error.to_string())?;
    Ok(db)
}

fn validate_url(value: &str) -> Result<url::Url, String> {
    if value.len() > 4096 || value.chars().any(char::is_control) {
        return Err("Unsupported URL".into());
    }
    let parsed = url::Url::parse(value).map_err(|_| "Invalid URL")?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only HTTP(S) URLs without embedded credentials can be opened".into());
    }
    Ok(parsed)
}

#[cfg(windows)]
fn open_url(value: &str) -> Result<String, String> {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    let parsed = validate_url(value)?;
    let url: Vec<u16> = parsed.as_str().encode_utf16().chain(Some(0)).collect();
    let operation: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            url.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result <= 32 {
        return Err(format!("Windows rejected URL open request (code {result})"));
    }
    Ok("Default browser accepted the open request; tab load is not verified".into())
}

#[cfg(not(windows))]
fn open_url(_: &str) -> Result<String, String> {
    Err("Windows is required".into())
}

pub fn list(path: &Path) -> Result<Vec<Execution>, String> {
    let idle_guard = EXECUTION_LOCK.try_lock().ok();
    let db = database(path)?;
    let mut statement = db
        .prepare("SELECT result FROM local_executions ORDER BY rowid DESC LIMIT 100")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut executions: Vec<Execution> = rows
        .map(|row| {
            serde_json::from_str(&row.map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())
        })
        .collect::<Result<_, String>>()?;
    if idle_guard.is_some() {
        for execution in &mut executions {
            if matches!(execution.state.as_str(), "running" | "awaiting_approval") {
                execution.state = "interrupted".into();
                persist(&db, execution)?;
            }
        }
    }
    Ok(executions)
}

pub fn cancel() {
    CANCELLED.store(true, Ordering::SeqCst);
}

fn persist(db: &Connection, execution: &Execution) -> Result<(), String> {
    db.execute(
        "UPDATE local_executions SET result=?1 WHERE id=?2",
        params![
            serde_json::to_string(execution).map_err(|error| error.to_string())?,
            execution.id
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn execute(
    path: &Path,
    id: String,
    actions: Vec<Action>,
    progress: impl Fn(&Execution),
) -> Result<Execution, String> {
    let _guard = EXECUTION_LOCK
        .try_lock()
        .map_err(|_| "Another local execution is awaiting approval or running")?;
    CANCELLED.store(false, Ordering::SeqCst);
    uuid::Uuid::parse_str(&id).map_err(|_| "Invalid execution ID")?;
    if actions.is_empty() || actions.len() > 20 {
        return Err("Choose between 1 and 20 local actions".into());
    }
    let db = database(path)?;
    let serialized = serde_json::to_string(&actions).map_err(|error| error.to_string())?;
    let prior: Option<(String, String)> = db
        .query_row(
            "SELECT actions,result FROM local_executions WHERE id=?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((previous_actions, previous_result)) = prior {
        if previous_actions != serialized {
            return Err("Execution ID was already used for different actions".into());
        }
        let mut result: Execution =
            serde_json::from_str(&previous_result).map_err(|error| error.to_string())?;
        if result.state == "running" || result.state == "awaiting_approval" {
            result.state = "interrupted".into();
            persist(&db, &result)?;
        }
        return Ok(result);
    }
    let applications = crate::applications::list(path)?;
    let mut preview = Vec::new();
    for action in &actions {
        preview.push(match action {
            Action::LaunchApplication { application_id } => {
                let app = applications
                    .iter()
                    .find(|app| &app.id == application_id)
                    .ok_or("A selected application is not registered")?;
                format!("Launch {}", app.executable)
            }
            Action::OpenUrl { url } => format!("Open {}", validate_url(url)?),
            Action::OpenProject {
                application_id,
                project_id,
            } => {
                let app = applications
                    .iter()
                    .find(|app| &app.id == application_id)
                    .ok_or("VS Code is not registered")?;
                format!(
                    "Open project {} in {}",
                    crate::projects::resolve(path, project_id)?.display(),
                    app.executable
                )
            }
        });
    }
    if preview.join("\n").len() > 8000 {
        return Err("Action preview is too long; use fewer or shorter URLs".into());
    }
    let mut execution = Execution {
        id,
        state: "awaiting_approval".into(),
        results: vec![],
    };
    db.execute(
        "INSERT INTO local_executions VALUES (?1,?2,?3)",
        params![
            execution.id,
            serialized,
            serde_json::to_string(&execution).map_err(|error| error.to_string())?
        ],
    )
    .map_err(|error| error.to_string())?;
    progress(&execution);
    if !crate::windows::confirm_action(&format!("Approve these local workspace actions?\n\n{}\n\nNo window arrangement or project cloning is included. Already completed actions cannot be undone by cancellation.", preview.join("\n\n"))) {
        execution.state = "cancelled".into();
        persist(&db, &execution)?;
        progress(&execution);
        return Ok(execution);
    }
    execution.state = "running".into();
    persist(&db, &execution)?;
    for (index, action) in actions.iter().enumerate() {
        if CANCELLED.load(Ordering::SeqCst) {
            execution.state = "cancelled".into();
            break;
        }
        let result = match action {
            Action::OpenUrl { url } => open_url(url),
            Action::OpenProject {
                application_id,
                project_id,
            } => crate::projects::resolve(path, project_id)
                .and_then(|directory| {
                    crate::applications::spawn_verified(path, application_id, Some(&directory))
                })
                .map(|mut child| {
                    let pid = child.id();
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    format!("VS Code launch requested with PID {pid}; editor state is not verified")
                }),
            Action::LaunchApplication { application_id } => {
                crate::applications::launch_verified(path, application_id).map(|mut child| {
                    let pid = child.id();
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    format!("Process created with PID {pid}; window readiness is not verified")
                })
            }
        };
        execution.results.push(match result {
            Ok(detail) => ActionResult {
                index,
                state: "completed".into(),
                detail,
            },
            Err(detail) => ActionResult {
                index,
                state: "failed".into(),
                detail,
            },
        });
        persist(&db, &execution)?;
        progress(&execution);
    }
    if execution.state != "cancelled" {
        let succeeded = execution
            .results
            .iter()
            .filter(|result| result.state == "completed")
            .count();
        execution.state = if succeeded == actions.len() {
            "completed"
        } else if succeeded == 0 {
            "failed"
        } else {
            "partially_completed"
        }
        .into();
    }
    persist(&db, &execution)?;
    progress(&execution);
    Ok(execution)
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_nonweb_and_credential_urls() {
        for value in [
            "file:///C:/private",
            "javascript:alert(1)",
            "https://user:password@example.com",
            "https://example.com\n",
        ] {
            assert!(super::validate_url(value).is_err());
        }
        assert!(super::validate_url("https://react.dev/learn").is_ok());
    }
    #[test]
    fn rejects_unregistered_plan_before_native_approval() {
        let path =
            std::env::temp_dir().join(format!("flowstate-execution-{}.db", uuid::Uuid::new_v4()));
        let result = super::execute(
            &path,
            uuid::Uuid::new_v4().to_string(),
            vec![super::Action::LaunchApplication {
                application_id: "missing".into(),
            }],
            |_| {},
        );
        assert!(result.is_err());
        assert!(super::list(&path).unwrap().is_empty());
        std::fs::remove_file(path).unwrap();
    }
}
