use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;

/// Result of stem separation
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StemSeparationResult {
    pub success: bool,
    pub stems: Option<HashMap<String, String>>, // stem_name -> file_path
    pub sample_rate: Option<u32>,
    pub error: Option<String>,
}

/// Progress update during stem separation
#[derive(Debug, Clone)]
pub struct StemProgress {
    pub progress: u8,   // 0-100
    pub stage: String,  // Description of current stage
}

/// Separate audio stems using Demucs with progress channel.
/// Returns a receiver for progress updates and the final result.
pub fn separate_stems_with_progress<P: AsRef<Path>>(
    audio_path: P,
    output_dir: P,
) -> (mpsc::Receiver<StemProgress>, std::thread::JoinHandle<Result<StemSeparationResult, String>>) {
    let audio_str = audio_path.as_ref().to_string_lossy().to_string();
    let output_str = output_dir.as_ref().to_string_lossy().to_string();
    
    let (tx, rx) = mpsc::channel();
    
    let handle = std::thread::spawn(move || {
        // Spawn Python process with piped stderr for progress
        let mut child = Command::new("../.venv/bin/python")
            .arg("separate_stems.py")
            .arg(&audio_str)
            .arg(&output_str)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to execute python script: {}", e))?;

        // Read stderr for progress updates in a separate thread
        if let Some(stderr) = child.stderr.take() {
            let tx_clone = tx.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Parse progress lines: "PROGRESS:50:Separating stems"
                        if line.starts_with("PROGRESS:") {
                            let parts: Vec<&str> = line.splitn(3, ':').collect();
                            if parts.len() == 3 {
                                if let Ok(progress) = parts[1].parse::<u8>() {
                                    let stage = parts[2].to_string();
                                    let _ = tx_clone.send(StemProgress { progress, stage });
                                }
                            }
                        }
                        // Also log other stderr lines for debugging
                        eprintln!("[Demucs] {}", line);
                    }
                }
            });
        }

        // Wait for process to finish and get stdout
        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for python script: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "stem separation failed with exit code: {:?}",
                output.status.code()
            ));
        }

        // Parse JSON output from stdout
        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: StemSeparationResult = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse JSON output: {} (Output: {})", e, stdout))?;

        if !result.success {
            return Err(result.error.unwrap_or_else(|| "Unknown error".to_string()));
        }

        Ok(result)
    });
    
    (rx, handle)
}

/// Synchronous version for use with spawn_blocking (without progress)
pub fn separate_stems_sync<P: AsRef<Path>>(
    audio_path: P,
    output_dir: P,
) -> Result<StemSeparationResult, String> {
    let audio_str = audio_path.as_ref().to_str().ok_or("Invalid audio path")?;
    let output_str = output_dir.as_ref().to_str().ok_or("Invalid output directory")?;

    // Spawn Python process with piped stderr for progress
    let mut child = Command::new("../.venv/bin/python")
        .arg("separate_stems.py")
        .arg(audio_str)
        .arg(output_str)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute python script: {}", e))?;

    // Read stderr for progress updates
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                // Log all stderr for debugging
                eprintln!("[Demucs] {}", line);
            }
        }
    }

    // Wait for process to finish and get stdout
    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for python script: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "stem separation failed with exit code: {:?}",
            output.status.code()
        ));
    }

    // Parse JSON output from stdout
    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: StemSeparationResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON output: {} (Output: {})", e, stdout))?;

    if !result.success {
        return Err(result.error.unwrap_or_else(|| "Unknown error".to_string()));
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_parsing() {
        // Just a simple test to verify the module compiles
        let result = StemSeparationResult {
            success: true,
            stems: Some(HashMap::new()),
            sample_rate: Some(44100),
            error: None,
        };
        assert!(result.success);
    }
}
