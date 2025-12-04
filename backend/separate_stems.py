#!/usr/bin/env python3
"""
Stem Separation using Demucs v4.

Separates an audio file into 4 stems: drums, bass, vocals, other.
Outputs progress to stderr and results to stdout as JSON.

Usage: python separate_stems.py <audio_path> <output_dir>
"""

import sys
import os
import json
import logging
import ssl
import certifi
from pathlib import Path

# Fix SSL certificate issue on macOS
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Also patch urllib for torch.hub downloads
import urllib.request
ssl_context = ssl.create_default_context(cafile=certifi.where())
urllib.request.install_opener(urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=ssl_context)
))

# Configure logging to stderr
logging.basicConfig(level=logging.INFO, stream=sys.stderr, format='%(message)s')
logger = logging.getLogger(__name__)

def print_progress(stage: str, progress: int):
    """Print progress updates to stderr in a parseable format."""
    print(f"PROGRESS:{progress}:{stage}", file=sys.stderr, flush=True)

def separate_stems(audio_path: str, output_dir: str) -> dict:
    """
    Separate audio into stems using Demucs.
    
    Args:
        audio_path: Path to input audio file
        output_dir: Directory to save stem files
        
    Returns:
        Dictionary with paths to separated stems
    """
    try:
        import torch
        import torchaudio
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        
        # Check for GPU
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        print_progress("Loading Demucs model", 5)
        
        # Load the model (htdemucs is the latest, best quality)
        model = get_model("htdemucs")
        model.to(device)
        model.eval()
        
        print_progress("Loading audio file", 10)
        
        # Load audio using soundfile backend (avoids TorchCodec dependency)
        wav, sr = torchaudio.load(audio_path, backend="soundfile")
        
        # Resample to model's sample rate if needed
        if sr != model.samplerate:
            print_progress("Resampling audio", 15)
            resampler = torchaudio.transforms.Resample(sr, model.samplerate)
            wav = resampler(wav)
            sr = model.samplerate
        
        # Ensure stereo
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        elif wav.shape[0] > 2:
            wav = wav[:2, :]
        
        # Add batch dimension: (channels, samples) -> (1, channels, samples)
        wav = wav.unsqueeze(0).to(device)
        
        print_progress("Separating stems (this may take a moment)", 20)
        
        # Calculate audio duration for progress estimation
        duration_secs = wav.shape[2] / model.samplerate
        logger.info(f"Audio duration: {duration_secs:.1f}s")
        
        # Apply model with progress tracking
        # Demucs processes in chunks, we'll estimate progress based on time
        import time
        start_time = time.time()
        
        # Use a thread to periodically report progress during separation
        import threading
        separation_done = threading.Event()
        
        def report_progress():
            while not separation_done.is_set():
                elapsed = time.time() - start_time
                # Rough estimate: ~10s per minute of audio on CPU
                estimated_total = duration_secs * 10 if device == "cpu" else duration_secs * 2
                progress = min(75, 20 + int(55 * (elapsed / max(1, estimated_total))))
                print_progress(f"Separating stems... ({int(elapsed)}s elapsed)", progress)
                separation_done.wait(2)  # Update every 2 seconds
        
        progress_thread = threading.Thread(target=report_progress, daemon=True)
        progress_thread.start()
        
        with torch.no_grad():
            sources = apply_model(
                model, 
                wav, 
                device=device,
                progress=False,  # We handle progress ourselves
                num_workers=0
            )
        
        separation_done.set()
        print_progress("Separation complete, saving files", 78)
        
        print_progress("Saving stem files", 80)
        
        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Model sources are in order: drums, bass, other, vocals
        # Note: htdemucs order might differ, check model.sources
        stem_names = model.sources  # e.g., ['drums', 'bass', 'other', 'vocals']
        
        result_paths = {}
        
        for i, stem_name in enumerate(stem_names):
            stem_audio = sources[0, i].cpu()  # Remove batch dim, move to CPU
            stem_file = output_path / f"{stem_name}.wav"
            
            torchaudio.save(str(stem_file), stem_audio, sr)
            result_paths[stem_name] = str(stem_file)
            
            progress = 80 + (i + 1) * (15 // len(stem_names))
            print_progress(f"Saved {stem_name}", progress)
        
        print_progress("Stem separation complete", 100)
        
        return {
            "success": True,
            "stems": result_paths,
            "sample_rate": sr
        }
        
    except ImportError as e:
        return {
            "success": False,
            "error": f"Missing dependency: {e}. Run: pip install demucs torch torchaudio"
        }
    except Exception as e:
        logger.error(f"Error during separation: {e}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            "success": False,
            "error": str(e)
        }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python separate_stems.py <audio_path> <output_dir>"
        }))
        sys.exit(1)

    audio_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.exists(audio_path):
        print(json.dumps({
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }))
        sys.exit(1)

    result = separate_stems(audio_path, output_dir)
    print(json.dumps(result))
    
    sys.exit(0 if result["success"] else 1)

if __name__ == "__main__":
    main()
