use axum::{
    extract::{Path, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::AppState;

#[derive(Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
}

pub async fn list_projects(
    State(state): State<AppState>,
) -> Json<Vec<Project>> {
    let projects = sqlx::query_as!(
        Project,
        "SELECT id, name, created_at FROM projects ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(projects)
}

pub async fn create_project(
    State(state): State<AppState>,
    Json(payload): Json<CreateProjectRequest>,
) -> Json<Project> {
    let project = sqlx::query_as!(
        Project,
        "INSERT INTO projects (name) VALUES ($1) RETURNING id, name, created_at",
        payload.name
    )
    .fetch_one(&state.db)
    .await
    .expect("Failed to create project");

    Json(project)
}

#[derive(Serialize)]
pub struct ProjectDetails {
    pub project: Project,
    pub versions: Vec<MixVersion>,
    pub references: Vec<ReferenceTrack>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MixVersion {
    pub id: Uuid,
    pub version_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub stem_job_id: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ReferenceTrack {
    pub id: Uuid,
    pub name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Json<ProjectDetails> {
    let project = sqlx::query_as!(
        Project,
        "SELECT id, name, created_at FROM projects WHERE id = $1",
        id
    )
    .fetch_one(&state.db)
    .await
    .expect("Project not found");

    let versions = sqlx::query_as!(
        MixVersion,
        "SELECT id, version_name, created_at, stem_job_id FROM mix_versions WHERE project_id = $1 ORDER BY created_at DESC",
        id
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let references = sqlx::query_as!(
        ReferenceTrack,
        "SELECT id, name, created_at FROM reference_tracks WHERE project_id = $1 ORDER BY created_at DESC",
        id
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(ProjectDetails {
        project,
        versions,
        references,
    })
}

#[derive(Serialize, sqlx::FromRow)]
pub struct AnalysisRecord {
    pub id: Uuid,
    pub metrics: serde_json::Value,
    pub ai_report: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_analysis_by_version(
    State(state): State<AppState>,
    Path(version_id): Path<Uuid>,
) -> Json<Option<AnalysisRecord>> {
    let analysis = sqlx::query_as!(
        AnalysisRecord,
        "SELECT id, metrics, ai_report, created_at FROM analyses WHERE mix_version_id = $1 ORDER BY created_at DESC LIMIT 1",
        version_id
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or_default();

    Json(analysis)
}

/// Delete a mix version (cascades to analyses)
/// Delete a mix version (cascades to analyses) and clean up files
pub async fn delete_version(
    State(state): State<AppState>,
    Path(version_id): Path<Uuid>,
) -> Json<serde_json::Value> {
    // 1. Fetch file paths and IDs before deletion
    let version_info = sqlx::query!(
        "SELECT file_path, stem_job_id FROM mix_versions WHERE id = $1",
        version_id
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if let Some(info) = version_info {
        // Get associated reference track
        let ref_info = sqlx::query!(
            "SELECT rt.id, rt.file_path 
             FROM reference_tracks rt 
             JOIN analyses a ON a.reference_track_id = rt.id 
             WHERE a.mix_version_id = $1",
            version_id
        )
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

        // 2. Delete physical files
        
        // Delete Mix File
        let mix_path = std::path::Path::new(&info.file_path);
        if mix_path.exists() {
            let _ = tokio::fs::remove_file(mix_path).await;
        }

        // Delete Reference File
        if let Some(ref ref_data) = ref_info {
            let ref_path = std::path::Path::new(&ref_data.file_path);
            if ref_path.exists() {
                let _ = tokio::fs::remove_file(ref_path).await;
            }
        }

        // Delete Stems Directory
        if let Some(stem_id) = info.stem_job_id {
            let stems_dir = std::path::Path::new(&state.upload_dir).join("stems").join(stem_id);
            if stems_dir.exists() {
                let _ = tokio::fs::remove_dir_all(stems_dir).await;
            }
        }

        // 3. Delete DB Records
        
        // Delete version (cascades to analyses)
        let result = sqlx::query!(
            "DELETE FROM mix_versions WHERE id = $1",
            version_id
        )
        .execute(&state.db)
        .await;

        // Delete reference track (now orphaned from this analysis)
        if let Some(ref_data) = ref_info {
            let _ = sqlx::query!(
                "DELETE FROM reference_tracks WHERE id = $1",
                ref_data.id
            )
            .execute(&state.db)
            .await;
        }

        match result {
            Ok(_) => Json(serde_json::json!({ "success": true })),
            Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        }
    } else {
        Json(serde_json::json!({ "success": false, "error": "Version not found" }))
    }
}

/// Get file paths for a version (for re-analysis)
#[derive(Serialize, sqlx::FromRow)]
pub struct VersionFiles {
    pub mix_path: String,
    pub ref_path: String,
}

pub async fn get_version_files(
    State(state): State<AppState>,
    Path(version_id): Path<Uuid>,
) -> Json<Option<VersionFiles>> {
    // Get mix file path from version
    let version = sqlx::query!(
        "SELECT file_path, project_id FROM mix_versions WHERE id = $1",
        version_id
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if let Some(v) = version {
        // Get reference file path (most recent one for the project)
        let reference = sqlx::query!(
            "SELECT file_path FROM reference_tracks WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1",
            v.project_id
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(r) = reference {
            return Json(Some(VersionFiles {
                mix_path: v.file_path,
                ref_path: r.file_path,
            }));
        }
    }

    Json(None)
}
