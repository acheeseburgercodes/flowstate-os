use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command},
};

#[derive(Serialize)]
pub struct TrustedApplication {
    pub id: String,
    pub name: String,
    pub executable: String,
}

fn connect(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|error| error.to_string())?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS trusted_applications (id TEXT PRIMARY KEY, name TEXT NOT NULL, executable TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL);").map_err(|error| error.to_string())?;
    Ok(db)
}

fn executable(path: &Path) -> Result<PathBuf, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "Application is no longer available")?;
    if !path.is_file()
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("exe"))
            != Some(true)
    {
        return Err("Select an executable .exe file".into());
    }
    if path.to_string_lossy().starts_with("\\\\?\\UNC\\") {
        return Err("Network executable paths are not supported".into());
    }
    Ok(path)
}

fn digest(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn register_path(database: &Path, selected: &Path) -> Result<TrustedApplication, String> {
    let path = executable(selected)?;
    let mut application = TrustedApplication {
        id: uuid::Uuid::new_v4().to_string(),
        name: path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        executable: path.to_string_lossy().into_owned(),
    };
    let hash = digest(&path)?;
    connect(database)?.execute("INSERT INTO trusted_applications (id, name, executable, sha256) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(executable) DO UPDATE SET sha256=excluded.sha256", params![application.id, application.name, application.executable, hash]).map_err(|error| error.to_string())?;
    application.id = connect(database)?
        .query_row(
            "SELECT id FROM trusted_applications WHERE executable=?1",
            [&application.executable],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    Ok(application)
}

pub fn register(database: &Path) -> Result<TrustedApplication, String> {
    let selected = rfd::FileDialog::new()
        .set_title("Select an application to trust")
        .add_filter("Windows application", &["exe"])
        .pick_file()
        .ok_or("Registration cancelled")?;
    if !crate::windows::confirm_action(&format!("Trust this application for future approved launches?\n\n{}\n\nNo arbitrary arguments or shell commands are accepted. Registered VS Code can open separately authorized folders after confirmation.", selected.display())) { return Err("Registration cancelled".into()); }
    register_path(database, &selected)
}

pub fn list(database: &Path) -> Result<Vec<TrustedApplication>, String> {
    let db = connect(database)?;
    let mut statement = db
        .prepare("SELECT id, name, executable FROM trusted_applications ORDER BY name")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(TrustedApplication {
                id: row.get(0)?,
                name: row.get(1)?,
                executable: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn revoke(database: &Path, id: &str) -> Result<(), String> {
    if connect(database)?
        .execute("DELETE FROM trusted_applications WHERE id=?1", [id])
        .map_err(|error| error.to_string())?
        == 0
    {
        return Err("Application is not registered".into());
    }
    Ok(())
}

pub(crate) fn launch_verified(database: &Path, id: &str) -> Result<Child, String> {
    spawn_verified(database, id, None)
}

pub(crate) fn spawn_verified(
    database: &Path,
    id: &str,
    project: Option<&Path>,
) -> Result<Child, String> {
    let (path, expected): (String, String) = connect(database)?
        .query_row(
            "SELECT executable, sha256 FROM trusted_applications WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Application is not registered")?;
    let path = executable(Path::new(&path))?;
    if digest(&path)? != expected {
        return Err("Application changed since registration. Register it again to review the updated executable.".into());
    }
    let mut command = Command::new(&path);
    command.current_dir(
        path.parent()
            .ok_or("Application directory is unavailable")?,
    );
    if let Some(directory) = project {
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_ascii_lowercase();
        if !matches!(filename.as_str(), "code.exe" | "code - insiders.exe") {
            return Err(
                "Project arguments are supported only by the registered VS Code launcher".into(),
            );
        }
        if !directory.is_absolute() || !directory.is_dir() {
            return Err("Project must be an authorized existing directory".into());
        }
        command.arg("--new-window").arg(directory);
    }
    command.spawn().map_err(|error| error.to_string())
}

pub fn launch(database: &Path, id: &str) -> Result<u32, String> {
    let application = list(database)?
        .into_iter()
        .find(|app| app.id == id)
        .ok_or("Application is not registered")?;
    if !crate::windows::confirm_action(&format!(
        "Launch this registered application?\n\n{}\n\nNo command-line arguments will be passed.",
        application.executable
    )) {
        return Err("Launch cancelled".into());
    }
    let mut child = launch_verified(database, id)?;
    let pid = child.id();
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(pid)
}

#[cfg(test)]
mod tests {
    #[test]
    fn unregistered_applications_are_rejected() {
        let database =
            std::env::temp_dir().join(format!("flowstate-apps-{}.db", uuid::Uuid::new_v4()));
        assert!(super::launch_verified(&database, "not-registered").is_err());
        std::fs::remove_file(database).unwrap();
    }

    #[test]
    #[ignore = "Run with FLOWSTATE_LAUNCH_PROBE pointing to the compiled fixture"]
    fn launches_registered_fixture_and_rejects_modified_binary() {
        let fixture = std::env::var("FLOWSTATE_LAUNCH_PROBE")
            .expect("Compile the launch_probe.rs fixture and set FLOWSTATE_LAUNCH_PROBE");
        let directory =
            std::env::temp_dir().join(format!("flowstate-launch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let copied = directory.join("probe.exe");
        std::fs::copy(fixture, &copied).unwrap();
        let database = directory.join("registry.db");
        let app = super::register_path(&database, &copied).unwrap();
        assert!(super::spawn_verified(&database, &app.id, Some(&directory))
            .unwrap_err()
            .contains("VS Code"));
        let mut child = super::launch_verified(&database, &app.id).unwrap();
        assert!(child.wait().unwrap().success());
        use std::io::Write;
        std::fs::OpenOptions::new()
            .append(true)
            .open(&copied)
            .unwrap()
            .write_all(b"changed")
            .unwrap();
        assert!(super::launch_verified(&database, &app.id)
            .unwrap_err()
            .contains("changed"));
        super::revoke(&database, &app.id).unwrap();
        assert!(super::list(&database).unwrap().is_empty());
        std::fs::remove_file(copied).unwrap();
        std::fs::remove_file(database).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
