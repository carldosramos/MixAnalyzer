use axum::{
    extract::{DefaultBodyLimit, Multipart, State, Path},
    response::{Html, IntoResponse, Json, Sse},
    routing::{get, post, delete},
    Router,
};
use axum::response::sse::{Event, KeepAlive};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::fs;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

mod audio_analysis;
mod projects;
mod stem_separation;
use audio_analysis::{analyze_pair, ComparisonResult};
use stem_separation::StemSeparationResult;

// --- Data Structures ---

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", content = "data")]
pub enum JobStatus {
    Queued,
    Processing(String), // Current step description
    Completed(ComparisonResult, String), // Result + AI Text
    Failed(String),
}

/// Job status for stem separation (separate from main analysis)
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", content = "data")]
pub enum StemJobStatus {
    Queued,
    Separating { progress: u8, stage: String },
    Analyzing { stem: String },
    Completed(StemAnalysisResult),
    Failed(String),
}

/// Result of stem-level analysis
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StemAnalysisResult {
    pub stems: std::collections::HashMap<String, StemMetrics>,
}

/// Metrics for a single stem
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StemMetrics {
    pub file_path: String,
    pub integrated_lufs: f32,
    pub spectral_centroid: f32,
    pub spectral_rolloff: f32,
}

#[derive(Clone)]
struct AppState {
    upload_dir: String,
    openai_api_key: String,
    jobs: Arc<Mutex<HashMap<String, JobStatus>>>,
    stem_jobs: Arc<Mutex<HashMap<String, StemJobStatus>>>,
    db: sqlx::PgPool,
}

#[derive(Serialize)]
struct JobResponse {
    job_id: String,
}

#[derive(Serialize)]
struct FullJobResponse {
    job_id: String,
    stem_job_id: String,
}

// --- Main ---

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenvy::dotenv().ok();
    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "uploads".to_string());
    let openai_api_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    // Create upload directory if it doesn't exist
    fs::create_dir_all(&upload_dir).await.unwrap();

    // Database Connection
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    // Run Migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Shared state
    let upload_dir_for_serve = upload_dir.clone();
    let state = AppState {
        upload_dir,
        openai_api_key,
        jobs: Arc::new(Mutex::new(HashMap::new())),
        stem_jobs: Arc::new(Mutex::new(HashMap::new())),
        db: pool,
    };

    // Router
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/api/analyze", post(start_analysis_job))
        .route("/api/jobs/:id", get(job_status_stream))
        .route("/api/stems/:id", get(stem_job_status_stream))
        .route("/api/projects", get(projects::list_projects).post(projects::create_project))
        .route("/api/projects/:id", get(projects::get_project))
        .route("/api/analyses/version/:id", get(projects::get_analysis_by_version))
        .route("/api/versions/:id", delete(projects::delete_version))
        .route("/api/versions/:id/files", get(projects::get_version_files))
        .route("/api/versions/:id/reanalyze", post(reanalyze_version))
        .route("/api/versions/:id/reanalyze-stems", post(reanalyze_stems_only))
        // Serve static files from uploads directory (includes stems)
        .nest_service("/uploads", tower_http::services::ServeDir::new(&upload_dir_for_serve))
        .layer(CorsLayer::permissive())
        .layer(DefaultBodyLimit::max(500 * 1024 * 1024)) // 500MB limit
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([127, 0, 0, 1], 4000));
    println!("Server running on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root_handler() -> Html<&'static str> {
    Html("<h1>Mix Analyzer API</h1><p>Use POST /api/analyze to start a job.</p>")
}

// --- Handlers ---

async fn start_analysis_job(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let job_id = Uuid::new_v4().to_string();
    let stem_job_id = Uuid::new_v4().to_string();
    
    // Initialize both job statuses
    {
        let mut jobs = state.jobs.lock().unwrap();
        jobs.insert(job_id.clone(), JobStatus::Queued);
    }
    {
        let mut stem_jobs = state.stem_jobs.lock().unwrap();
        stem_jobs.insert(stem_job_id.clone(), StemJobStatus::Queued);
    }

    // Handle file uploads and fields
    let mut mix_path = None;
    let mut ref_path = None;
    let mut project_id: Option<Uuid> = None;
    let mut version_name: Option<String> = None;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        
        if name == "project_id" {
            if let Ok(val) = field.text().await {
                if let Ok(uuid) = Uuid::parse_str(&val) {
                    project_id = Some(uuid);
                }
            }
            continue;
        }
        
        if name == "version_name" {
            if let Ok(val) = field.text().await {
                version_name = Some(val);
            }
            continue;
        }

        let file_name = field.file_name().map(|f| f.to_string());

        if let Some(file_name) = file_name {
            if let Ok(data) = field.bytes().await {
                let dest_path = PathBuf::from(&state.upload_dir).join(format!("{}_{}", Uuid::new_v4(), file_name));
                if let Ok(_) = fs::write(&dest_path, data).await {
                    if name == "mix" {
                        mix_path = Some(dest_path);
                    } else if name == "reference" {
                        ref_path = Some(dest_path);
                    }
                }
            }
        }
    }

    if mix_path.is_none() || ref_path.is_none() {
        let mut jobs = state.jobs.lock().unwrap();
        jobs.insert(job_id.clone(), JobStatus::Failed("Missing mix or reference file".to_string()));
        let mut stem_jobs = state.stem_jobs.lock().unwrap();
        stem_jobs.insert(stem_job_id.clone(), StemJobStatus::Failed("Missing files".to_string()));
        return Json(FullJobResponse { job_id, stem_job_id });
    }

    let mix_path = mix_path.unwrap();
    let ref_path = ref_path.unwrap();

    // Spawn background task for main analysis
    let state_clone = state.clone();
    let job_id_clone = job_id.clone();
    let mix_path_clone = mix_path.clone();
    let ref_path_clone = ref_path.clone();
    let stem_job_id_clone = stem_job_id.clone();

    tokio::spawn(async move {
        process_analysis(state_clone, job_id_clone, mix_path_clone, ref_path_clone, project_id, version_name, Some(stem_job_id_clone)).await;
    });

    // Spawn background task for stem separation (runs in parallel!)
    let state_clone2 = state.clone();
    let stem_job_id_clone = stem_job_id.clone();
    let mix_path_for_stems = mix_path.clone();
    let ref_path_for_stems = ref_path.clone();

    tokio::spawn(async move {
        process_stem_separation(state_clone2, stem_job_id_clone, mix_path_for_stems, ref_path_for_stems).await;
    });

    Json(FullJobResponse { job_id, stem_job_id })
}

/// Re-analyze a version using stored file paths
async fn reanalyze_version(
    State(state): State<AppState>,
    Path(version_id): Path<Uuid>,
) -> Json<serde_json::Value> {
    // Get file paths from database
    let version = sqlx::query!(
        "SELECT mv.file_path as mix_path, mv.project_id, rt.file_path as ref_path 
         FROM mix_versions mv
         JOIN reference_tracks rt ON rt.project_id = mv.project_id
         WHERE mv.id = $1
         ORDER BY rt.created_at DESC
         LIMIT 1",
        version_id
    )
    .fetch_optional(&state.db)
    .await;

    let version = match version {
        Ok(Some(v)) => v,
        Ok(None) => return Json(json!({ "error": "Version not found" })),
        Err(e) => return Json(json!({ "error": format!("Database error: {}", e) })),
    };

    let mix_path = PathBuf::from(&version.mix_path);
    let ref_path = PathBuf::from(&version.ref_path);

    // Verify files exist
    if !mix_path.exists() {
        return Json(json!({ "error": "Mix file not found on disk" }));
    }
    if !ref_path.exists() {
        return Json(json!({ "error": "Reference file not found on disk" }));
    }

    // Create new job IDs
    let job_id = Uuid::new_v4().to_string();
    let stem_job_id = Uuid::new_v4().to_string();

    // Initialize job statuses
    {
        let mut jobs = state.jobs.lock().unwrap();
        jobs.insert(job_id.clone(), JobStatus::Queued);
    }
    {
        let mut stem_jobs = state.stem_jobs.lock().unwrap();
        stem_jobs.insert(stem_job_id.clone(), StemJobStatus::Queued);
    }

    // Spawn background task for main analysis (no project_id/version_name - we're re-analyzing existing version)
    let state_clone = state.clone();
    let job_id_clone = job_id.clone();
    let mix_path_clone = mix_path.clone();
    let ref_path_clone = ref_path.clone();

    tokio::spawn(async move {
        process_analysis(state_clone, job_id_clone, mix_path_clone, ref_path_clone, None, None, None).await;
    });

    // Spawn background task for stem separation
    let state_clone2 = state.clone();
    let stem_job_id_clone = stem_job_id.clone();

    tokio::spawn(async move {
        process_stem_separation(state_clone2, stem_job_id_clone, mix_path, ref_path).await;
    });

    Json(json!({
        "job_id": job_id,
        "stem_job_id": stem_job_id
    }))
}

/// Re-analyze stems only (without full analysis) for a version
async fn reanalyze_stems_only(
    State(state): State<AppState>,
    Path(version_id): Path<Uuid>,
) -> Json<serde_json::Value> {
    // Get file paths from database
    let version = sqlx::query!(
        "SELECT mv.file_path as mix_path, mv.project_id, rt.file_path as ref_path 
         FROM mix_versions mv
         JOIN reference_tracks rt ON rt.project_id = mv.project_id
         WHERE mv.id = $1
         ORDER BY rt.created_at DESC
         LIMIT 1",
        version_id
    )
    .fetch_optional(&state.db)
    .await;

    let version = match version {
        Ok(Some(v)) => v,
        Ok(None) => return Json(json!({ "error": "Version not found" })),
        Err(e) => return Json(json!({ "error": format!("Database error: {}", e) })),
    };

    let mix_path = PathBuf::from(&version.mix_path);
    let ref_path = PathBuf::from(&version.ref_path);

    // Verify files exist
    if !mix_path.exists() {
        return Json(json!({ "error": "Mix file not found on disk" }));
    }
    if !ref_path.exists() {
        return Json(json!({ "error": "Reference file not found on disk" }));
    }

    // Create new stem job ID only
    let stem_job_id = Uuid::new_v4().to_string();

    // Initialize stem job status
    {
        let mut stem_jobs = state.stem_jobs.lock().unwrap();
        stem_jobs.insert(stem_job_id.clone(), StemJobStatus::Queued);
    }

    // Save stem_job_id to database
    let _ = sqlx::query!(
        "UPDATE mix_versions SET stem_job_id = $1 WHERE id = $2",
        stem_job_id,
        version_id
    )
    .execute(&state.db)
    .await;

    // Spawn background task for stem separation only
    let state_clone = state.clone();
    let stem_job_id_clone = stem_job_id.clone();

    tokio::spawn(async move {
        process_stem_separation(state_clone, stem_job_id_clone, mix_path, ref_path).await;
    });

    Json(json!({
        "stem_job_id": stem_job_id
    }))
}

async fn process_analysis(
    state: AppState,
    job_id: String,
    mix_path: PathBuf,
    ref_path: PathBuf,
    project_id: Option<Uuid>,
    version_name: Option<String>,
    stem_job_id: Option<String>,
) {
    // Update: Running Essentia
    update_job_status(&state, &job_id, JobStatus::Processing("Running Essentia Analysis...".to_string()));

    // Run Analysis
    let analysis_result = tokio::task::spawn_blocking({
        let mix = mix_path.clone();
        let ref_p = ref_path.clone();
        move || analyze_pair(&mix, &ref_p)
    }).await.unwrap();

    match analysis_result {
        Ok(metrics) => {
            // Update: Generating AI Report
            update_job_status(&state, &job_id, JobStatus::Processing("Consulting AI Expert...".to_string()));

            // Call OpenAI
            match request_ai_completion(&state.openai_api_key, &metrics).await {
                Ok(ai_text) => {
                    // Persist if project_id is present
                    if let Some(pid) = project_id {
                        let v_name = version_name.unwrap_or_else(|| "New Version".to_string());
                        
                        // 1. Save Mix Version
                        let mix_version_id = sqlx::query!(
                            "INSERT INTO mix_versions (project_id, version_name, file_path, stem_job_id) VALUES ($1, $2, $3, $4) RETURNING id",
                            pid,
                            v_name,
                            mix_path.to_string_lossy().to_string(),
                            stem_job_id
                        )
                        .fetch_one(&state.db)
                        .await;

                        // 2. Save Reference Track (Simplified: always create new for now)
                        let ref_track_id = sqlx::query!(
                            "INSERT INTO reference_tracks (project_id, name, file_path) VALUES ($1, $2, $3) RETURNING id",
                            pid,
                            "Reference Track", // Could extract filename if passed
                            ref_path.to_string_lossy().to_string()
                        )
                        .fetch_one(&state.db)
                        .await;

                        if let (Ok(mv), Ok(rt)) = (mix_version_id, ref_track_id) {
                            // 3. Save Analysis
                            let _ = sqlx::query!(
                                "INSERT INTO analyses (mix_version_id, reference_track_id, metrics, ai_report) VALUES ($1, $2, $3, $4)",
                                mv.id,
                                rt.id,
                                sqlx::types::Json(&metrics) as _,
                                ai_text
                            )
                            .execute(&state.db)
                            .await;
                        }
                    }

                    update_job_status(&state, &job_id, JobStatus::Completed(metrics, ai_text));
                }
                Err(e) => {
                    update_job_status(&state, &job_id, JobStatus::Failed(format!("AI Error: {}", e)));
                }
            }
        }
        Err(e) => {
            update_job_status(&state, &job_id, JobStatus::Failed(format!("Analysis Error: {}", e)));
        }
    }
}

fn update_job_status(state: &AppState, job_id: &str, status: JobStatus) {
    let mut jobs = state.jobs.lock().unwrap();
    jobs.insert(job_id.to_string(), status);
}

async fn job_status_stream(
    Path(job_id): Path<String>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let stream = async_stream::stream! {
        let mut last_status_json = String::new();

        loop {
            let status = {
                let jobs = state.jobs.lock().unwrap();
                jobs.get(&job_id).cloned()
            };

            match status {
                Some(status) => {
                    let json = serde_json::to_string(&status).unwrap();
                    
                    // Only send if status changed
                    if json != last_status_json {
                        yield Ok(Event::default().data(&json));
                        last_status_json = json;
                    }

                    match status {
                        JobStatus::Completed(_, _) | JobStatus::Failed(_) => {
                            break;
                        }
                        _ => {}
                    }
                }
                None => {
                    yield Ok(Event::default().data(json!({ "status": "Failed", "data": "Job not found" }).to_string()));
                    break;
                }
            }

            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

// --- Stem Separation SSE Stream ---

async fn stem_job_status_stream(
    Path(stem_job_id): Path<String>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let stream = async_stream::stream! {
        let mut last_status_json = String::new();

        loop {
            let status = {
                let stem_jobs = state.stem_jobs.lock().unwrap();
                stem_jobs.get(&stem_job_id).cloned()
            };

            match status {
                Some(status) => {
                    let json = serde_json::to_string(&status).unwrap();
                    
                    // Only send if status changed
                    if json != last_status_json {
                        yield Ok(Event::default().data(&json));
                        last_status_json = json;
                    }

                    match status {
                        StemJobStatus::Completed(_) | StemJobStatus::Failed(_) => {
                            break;
                        }
                        _ => {}
                    }
                }
                None => {
                    yield Ok(Event::default().data(json!({ "status": "Failed", "data": "Stem job not found" }).to_string()));
                    break;
                }
            }

            tokio::time::sleep(Duration::from_millis(300)).await; // Faster polling for progress
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn update_stem_job_status(state: &AppState, job_id: &str, status: StemJobStatus) {
    let mut stem_jobs = state.stem_jobs.lock().unwrap();
    stem_jobs.insert(job_id.to_string(), status);
}

// --- Stem Separation Processing ---

async fn process_stem_separation(
    state: AppState,
    stem_job_id: String,
    mix_path: PathBuf,
    ref_path: PathBuf,
) {
    use std::collections::HashMap;
    
    // Update: Starting separation
    update_stem_job_status(
        &state,
        &stem_job_id,
        StemJobStatus::Separating {
            progress: 0,
            stage: "Initializing Demucs...".to_string(),
        },
    );

    // Create output directories
    let mix_stems_dir = PathBuf::from(&state.upload_dir)
        .join("stems")
        .join(&stem_job_id)
        .join("mix");
    let ref_stems_dir = PathBuf::from(&state.upload_dir)
        .join("stems")
        .join(&stem_job_id)
        .join("reference");

    if let Err(e) = fs::create_dir_all(&mix_stems_dir).await {
        update_stem_job_status(
            &state,
            &stem_job_id,
            StemJobStatus::Failed(format!("Failed to create output dir: {}", e)),
        );
        return;
    }
    if let Err(e) = fs::create_dir_all(&ref_stems_dir).await {
        update_stem_job_status(
            &state,
            &stem_job_id,
            StemJobStatus::Failed(format!("Failed to create ref output dir: {}", e)),
        );
        return;
    }

    // Separate mix stems with real-time progress
    update_stem_job_status(
        &state,
        &stem_job_id,
        StemJobStatus::Separating {
            progress: 2,
            stage: "Starting mix stem separation...".to_string(),
        },
    );

    // Use channel-based progress for mix separation
    let mix_result = tokio::task::spawn_blocking({
        let mix = mix_path.clone();
        let out_dir = mix_stems_dir.clone();
        let state_clone = state.clone();
        let job_id = stem_job_id.clone();
        
        move || {
            let (rx, handle) = stem_separation::separate_stems_with_progress(&mix, &out_dir);
            
            // Poll for progress updates
            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(progress) => {
                        // Scale mix progress from 0-100 to 5-45
                        let scaled = 5 + (progress.progress as u32 * 40 / 100) as u8;
                        update_stem_job_status(
                            &state_clone,
                            &job_id,
                            StemJobStatus::Separating {
                                progress: scaled,
                                stage: format!("Mix: {}", progress.stage),
                            },
                        );
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Check if the thread is done
                        if handle.is_finished() {
                            break;
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
            
            handle.join().unwrap_or_else(|_| Err("Thread panicked".to_string()))
        }
    })
    .await;

    let mix_stems = match mix_result {
        Ok(Ok(result)) => result.stems.unwrap_or_default(),
        Ok(Err(e)) => {
            update_stem_job_status(
                &state,
                &stem_job_id,
                StemJobStatus::Failed(format!("Mix separation failed: {}", e)),
            );
            return;
        }
        Err(e) => {
            update_stem_job_status(
                &state,
                &stem_job_id,
                StemJobStatus::Failed(format!("Task panic: {}", e)),
            );
            return;
        }
    };

    // Separate reference stems with real-time progress
    update_stem_job_status(
        &state,
        &stem_job_id,
        StemJobStatus::Separating {
            progress: 50,
            stage: "Starting reference stem separation...".to_string(),
        },
    );

    let ref_result = tokio::task::spawn_blocking({
        let ref_p = ref_path.clone();
        let out_dir = ref_stems_dir.clone();
        let state_clone = state.clone();
        let job_id = stem_job_id.clone();
        
        move || {
            let (rx, handle) = stem_separation::separate_stems_with_progress(&ref_p, &out_dir);
            
            // Poll for progress updates
            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(progress) => {
                        // Scale ref progress from 0-100 to 50-90
                        let scaled = 50 + (progress.progress as u32 * 40 / 100) as u8;
                        update_stem_job_status(
                            &state_clone,
                            &job_id,
                            StemJobStatus::Separating {
                                progress: scaled,
                                stage: format!("Reference: {}", progress.stage),
                            },
                        );
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        if handle.is_finished() {
                            break;
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
            
            handle.join().unwrap_or_else(|_| Err("Thread panicked".to_string()))
        }
    })
    .await;

    let _ref_stems = match ref_result {
        Ok(Ok(result)) => result.stems.unwrap_or_default(),
        Ok(Err(e)) => {
            update_stem_job_status(
                &state,
                &stem_job_id,
                StemJobStatus::Failed(format!("Reference separation failed: {}", e)),
            );
            return;
        }
        Err(e) => {
            update_stem_job_status(
                &state,
                &stem_job_id,
                StemJobStatus::Failed(format!("Task panic: {}", e)),
            );
            return;
        }
    };

    // Analyze each stem
    update_stem_job_status(
        &state,
        &stem_job_id,
        StemJobStatus::Analyzing {
            stem: "all stems".to_string(),
        },
    );

    // Build result with stem metrics (simplified for now - just paths)
    let mut stem_metrics: HashMap<String, StemMetrics> = HashMap::new();
    for (stem_name, stem_path) in &mix_stems {
        stem_metrics.insert(
            stem_name.clone(),
            StemMetrics {
                file_path: stem_path.clone(),
                integrated_lufs: -14.0, // TODO: Run actual analysis
                spectral_centroid: 2000.0,
                spectral_rolloff: 8000.0,
            },
        );
    }

    // Complete!
    update_stem_job_status(
        &state,
        &stem_job_id,
        StemJobStatus::Completed(StemAnalysisResult {
            stems: stem_metrics,
        }),
    );
}

// --- AI Helper ---

#[derive(Serialize)]
struct ChatMessagePayload {
    role: String,
    content: String,
}

async fn request_ai_completion(api_key: &str, metrics: &ComparisonResult) -> Result<String, String> {
    let client = reqwest::Client::new();
    let model_id = "gpt-5"; // Or "gpt-4o"

    // Prepare LLM Prompt
    let prompt = format!(
        "Analyze these audio metrics for a mix vs reference.
        Be extremely concise. Bullet points only. No fluff.
        
        METRICS:
        1. LOUDNESS: {:.1} LUFS (Ref: {:.1})
        2. DYNAMICS: {:.1} LU (Ref: {:.1})
        3. WIDTH: {:.1} (Ref: {:.1})
        4. BPM: {:.1} (Ref: {:.1})
        
        Provide 3 short, actionable mastering steps.",
        
        metrics.mix.integrated_lufs, metrics.reference.integrated_lufs,
        metrics.mix.loudness_range, metrics.reference.loudness_range,
        metrics.mix.dynamic_complexity, metrics.reference.dynamic_complexity, // Using dynamic_complexity as proxy for width/punch in this simplified prompt
        metrics.mix.bpm, metrics.reference.bpm
    );

    let messages = vec![ChatMessagePayload {
        role: "system".to_string(),
        content: "You are a concise Audio Engineer. Output JSON-like or very short text.".to_string(),
    }, ChatMessagePayload {
        role: "user".to_string(),
        content: prompt,
    }];

    let request_body = json!({
        "model": model_id,
        "messages": messages,
        "reasoning_effort": "low", 
        "stream": false
    });

    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI error: {}", error_text));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| format!("Parse error: {}", e))?;
    
    // Extract content
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No content")
        .to_string();

    Ok(content)
}
