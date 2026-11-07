use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub directory: String,
}

fn connect(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|error| error.to_string())?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS authorized_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, directory TEXT NOT NULL UNIQUE);").map_err(|error| error.to_string())?;
    Ok(db)
}
pub fn list(path: &Path) -> Result<Vec<Project>, String> {
    let db = connect(path)?;
    let mut statement = db
        .prepare("SELECT id,name,directory FROM authorized_projects ORDER BY name")
        .map_err(|error| error.to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                directory: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string());
    result
}
pub fn register(path: &Path) -> Result<Project, String> {
    let directory = rfd::FileDialog::new()
        .set_title("Authorize a local project directory")
        .pick_folder()
        .ok_or("Directory selection cancelled")?;
    if !directory.is_dir() {
        return Err("Select an existing directory".into());
    }
    let directory = directory.to_string_lossy().into_owned();
    let name = Path::new(&directory)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let db = connect(path)?;
    db.execute(
        "INSERT OR IGNORE INTO authorized_projects VALUES (?1,?2,?3)",
        params![uuid::Uuid::new_v4().to_string(), name, directory],
    )
    .map_err(|error| error.to_string())?;
    db.query_row(
        "SELECT id,name,directory FROM authorized_projects WHERE directory=?1",
        [directory],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                directory: row.get(2)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}
pub fn resolve(path: &Path, id: &str) -> Result<PathBuf, String> {
    let directory: String = connect(path)?
        .query_row(
            "SELECT directory FROM authorized_projects WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|_| "Project is not authorized")?;
    let directory = PathBuf::from(directory);
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("Authorized project is no longer available".into());
    }
    Ok(directory)
}
pub fn revoke(path: &Path, id: &str) -> Result<(), String> {
    connect(path)?
        .execute("DELETE FROM authorized_projects WHERE id=?1", [id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn project_access_requires_registration_and_survives_only_until_revocation() {
        let directory =
            std::env::temp_dir().join(format!("flowstate-project-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let database = directory.join("projects.db");
        assert!(super::resolve(&database, "project").is_err());
        super::connect(&database)
            .unwrap()
            .execute(
                "INSERT INTO authorized_projects VALUES (?1,?2,?3)",
                rusqlite::params!["project", "Fixture", directory.to_str().unwrap()],
            )
            .unwrap();
        assert_eq!(super::resolve(&database, "project").unwrap(), directory);
        super::revoke(&database, "project").unwrap();
        assert!(super::resolve(&database, "project").is_err());
        std::fs::remove_file(database).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
