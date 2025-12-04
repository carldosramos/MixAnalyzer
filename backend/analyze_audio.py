import sys
import json
import logging
import math

# Configure logging to stderr
logging.basicConfig(level=logging.ERROR)

try:
    import essentia.standard as es
    import numpy as np
except ImportError:
    print(json.dumps({"error": "Essentia library not found. Please install it with `pip install essentia`."}))
    sys.exit(1)

def analyze_track(file_path):
    try:
        # Load audio (Mono for most descriptors)
        loader = es.MonoLoader(filename=file_path)
        audio = loader()

        # --- 1. Loudness & Dynamics ---
        print("DEBUG: Starting Loudness", file=sys.stderr)
        # LoudnessEBUR128 expects stereo signal in some versions/configurations
        stereo_muxer = es.StereoMuxer()
        stereo_audio = stereo_muxer(audio, audio)
        
        loudness_algo = es.LoudnessEBUR128()
        integrated_lufs, lra, _, _ = loudness_algo(stereo_audio)
        print(f"DEBUG: Loudness done. LUFS type: {type(integrated_lufs)}", file=sys.stderr)
        
        # True Peak (approximate)
        true_peak = float(np.max(np.abs(audio)))
        true_peak_db = 20 * math.log10(true_peak) if true_peak > 0 else -100.0
        print("DEBUG: True Peak done", file=sys.stderr)

        # Dynamic Complexity (measures dynamic variation)
        # We need to frame the audio for this, or use the computed version
        # A simple proxy is RMS variability, but Essentia has DynamicComplexity
        dyn_complexity_algo = es.DynamicComplexity()
        dynamic_complexity, _ = dyn_complexity_algo(audio)
        print(f"DEBUG: Dyn Complexity done. Type: {type(dynamic_complexity)}", file=sys.stderr)

        # --- 2. Rhythm ---
        rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
        bpm, beat_confidence, _, _, _ = rhythm_extractor(audio)
        print(f"DEBUG: Rhythm done. BPM type: {type(bpm)}", file=sys.stderr)

        danceability_algo = es.Danceability()
        danceability, _ = danceability_algo(audio)
        print(f"DEBUG: Danceability done. Type: {type(danceability)}", file=sys.stderr)

        # --- 3. Tonal ---
        key_extractor = es.KeyExtractor()
        # KeyExtractor might return 4 values?
        key_results = key_extractor(audio)
        key = key_results[0]
        scale = key_results[1]
        # key_strength = key_results[2]
        print(f"DEBUG: Key done. Key: {key}, Scale: {scale}", file=sys.stderr)

        # Tuning Frequency (e.g. 440Hz)
        # Requires SpectralPeaks
        # We'll compute it on the whole track using a large frame or average?
        # Standard way: Frame -> Window -> Spectrum -> SpectralPeaks -> TuningFrequency
        # But doing it frame-by-frame and averaging is complex.
        # Let's try to run it on a representative segment or average spectrum.
        
        # Simplified approach: Use HPCP or KeyExtractor's internal tuning if available?
        # KeyExtractor doesn't return tuning.
        
        # Let's implement the chain for a middle segment
        middle_idx = len(audio) // 2
        segment_len = 4096 * 4
        if len(audio) > segment_len:
            segment = audio[middle_idx:middle_idx+segment_len]
        else:
            segment = audio
            
        # We need to process frames to get peaks
        tuning_freqs = []
        
        # Algorithms
        w_algo_tuning = es.Windowing(type="hann")
        spec_algo_tuning = es.Spectrum()
        peaks_algo = es.SpectralPeaks(orderBy="magnitude", magnitudeThreshold=0.00001, minFrequency=20, maxFrequency=5000, maxPeaks=100)
        tuning_algo = es.TuningFrequency()
        
        for frame in es.FrameGenerator(segment, frameSize=4096, hopSize=2048, startFromZero=True):
            w_frame = w_algo_tuning(frame)
            spec = spec_algo_tuning(w_frame)
            frequencies, magnitudes = peaks_algo(spec)
            if len(frequencies) > 0:
                tf_res = tuning_algo(frequencies, magnitudes)
                # TuningFrequency might return a single value or tuple depending on version?
                # If it returns just freq:
                if isinstance(tf_res, (list, tuple)):
                     tf = tf_res[0]
                else:
                     tf = tf_res
                tuning_freqs.append(tf)
                
        tuning_freq = float(np.mean(tuning_freqs)) if tuning_freqs else 440.0
        print(f"DEBUG: Tuning done. Freq: {tuning_freq}", file=sys.stderr)

        # --- 4. Spectral / Timbre ---
        # We process the spectrum in frames to get average values
        w_algo = es.Windowing(type="hann")
        spec_algo = es.Spectrum()
        centroid_algo = es.SpectralCentroidTime() # Time-domain centroid is faster/simpler for overall
        rolloff_algo = es.RollOff()
        flux_algo = es.Flux()
        
        # For frame-based features, we compute the mean over the track
        # Frame size 2048, hop 1024
        frame_cutter = es.FrameCutter(frameSize=4096, hopSize=2048)
        
        centroids = []
        rolloffs = []
        fluxes = []

        # Manual frame processing loop
        # Note: Essentia has streaming mode for this, but standard mode loop is fine for simplicity here
        for frame in es.FrameGenerator(audio, frameSize=4096, hopSize=2048, startFromZero=True):
            w_frame = w_algo(frame)
            spec = spec_algo(w_frame)
            
            # Centroid (using frequency domain here for consistency with other spectral features)
            # SpectralCentroidTime is time-domain, let's use Centroid (freq domain)
            c_algo = es.Centroid(range=22050) # range is sampleRate/2
            c = c_algo(spec)
            centroids.append(c)

            # Rolloff
            r = rolloff_algo(spec)
            rolloffs.append(r)

            # Flux (needs previous frame, but simple append is ok for mean)
            f = flux_algo(spec)
            fluxes.append(f)

        avg_centroid = float(np.mean(centroids)) if centroids else 0.0
        avg_rolloff = float(np.mean(rolloffs)) if rolloffs else 0.0
        avg_flux = float(np.mean(fluxes)) if fluxes else 0.0
        print("DEBUG: Spectral done", file=sys.stderr)

        # Helper to safely convert numpy types/arrays to float
        def to_float(val):
            if isinstance(val, (list, tuple, np.ndarray)):
                # If it's an array/list, try to get the first element or item
                val = np.array(val)
                if val.size == 1:
                    return float(val.item())
                elif val.size > 1:
                    # If multiple values, take mean? Or first?
                    # For LUFS, it should be one value. If stereo returns per-channel, we want global?
                    # EBU R128 is global. Let's assume index 0 is what we want or it's a 0-d array.
                    return float(val.flat[0])
            return float(val)

        return {
            "integrated_lufs": to_float(integrated_lufs),
            "loudness_range": to_float(lra),
            "true_peak": to_float(true_peak_db),
            "dynamic_complexity": to_float(dynamic_complexity),
            
            "bpm": to_float(bpm),
            "beat_confidence": to_float(beat_confidence),
            "danceability": to_float(danceability),
            
            "key": key,
            "scale": scale,
            "tuning_frequency": to_float(tuning_freq),
            
            "spectral_centroid": to_float(avg_centroid),
            "spectral_rolloff": to_float(avg_rolloff),
            "spectral_flux": to_float(avg_flux)
        }

    except Exception as e:
        logging.error(f"Error analyzing {file_path}: {str(e)}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Return a partial result or None? returning None triggers error in Rust
        return None

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python analyze_audio.py <mix_path> <ref_path>"}))
        sys.exit(1)

    mix_path = sys.argv[1]
    ref_path = sys.argv[2]

    mix_metrics = analyze_track(mix_path)
    ref_metrics = analyze_track(ref_path)

    if not mix_metrics or not ref_metrics:
        print(json.dumps({"error": "Failed to analyze one or both tracks."}))
        sys.exit(1)

    result = {
        "mix": mix_metrics,
        "reference": ref_metrics
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
