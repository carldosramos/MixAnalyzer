use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AudioMetrics {
    // Loudness & Dynamics
    pub integrated_lufs: f32,
    pub loudness_range: f32,
    pub true_peak: f32,
    pub dynamic_complexity: f32,

    // Rhythm
    pub bpm: f32,
    pub beat_confidence: f32,
    pub danceability: f32,

    // Tonal
    pub key: String,
    pub scale: String,
    pub tuning_frequency: f32,

    // Spectral
    pub spectral_centroid: f32, // Brightness
    pub spectral_rolloff: f32,
    pub spectral_flux: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ComparisonResult {
    pub mix: AudioMetrics,
    pub reference: AudioMetrics,
}

#[derive(Deserialize, Debug)]
struct ScriptOutput {
    mix: AudioMetrics,
    reference: AudioMetrics,
    #[serde(default)]
    error: Option<String>,
}

pub fn analyze_pair<P: AsRef<Path>>(mix_path: P, ref_path: P) -> Result<ComparisonResult, String> {
    let mix_str = mix_path.as_ref().to_str().ok_or("Invalid mix path")?;
    let ref_str = ref_path.as_ref().to_str().ok_or("Invalid reference path")?;

    // Call Python script using the project's virtual environment
    // Assuming the backend is running from `backend/` and .venv is in the project root `../.venv`
    // Or if running from root, it's `.venv`.
    // Safest is to try to resolve it or use a relative path from the backend dir.
    // Since `cargo run` is usually from `backend/`, the path to venv is `../.venv/bin/python`
    let output = Command::new("../.venv/bin/python")
        .arg("analyze_audio.py")
        .arg(mix_str)
        .arg(ref_str)
        .output()
        .map_err(|e| format!("Failed to execute python script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python script failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: ScriptOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON output: {} (Output: {})", e, stdout))?;

    if let Some(err) = result.error {
        return Err(format!("Analysis error: {}", err));
    }

    Ok(ComparisonResult {
        mix: result.mix,
        reference: result.reference,
    })
}
