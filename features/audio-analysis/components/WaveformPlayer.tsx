"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from "react-icons/fa";

interface WaveformPlayerProps {
  audioUrl: string;
  label?: string;
  color?: string;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onAnalyser?: (analyser: AnalyserNode) => void;
}

export function WaveformPlayer({
  audioUrl,
  label,
  color = "#10b981",
  onReady,
  onPlay,
  onPause,
  onTimeUpdate,
  onAnalyser,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(true);

  // Pre-compute waveform peaks from audio file
  const computeWaveform = useCallback(async (url: string) => {
    setIsLoadingWaveform(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch audio");

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get audio data (mix to mono)
      const numChannels = audioBuffer.numberOfChannels;
      let audioData: Float32Array;
      if (numChannels === 1) {
        audioData = audioBuffer.getChannelData(0);
      } else {
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        audioData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          audioData[i] = (left[i] + right[i]) / 2;
        }
      }

      // Downsample to ~200 bars for display
      const numBars = 200;
      const samplesPerBar = Math.floor(audioData.length / numBars);
      const peaks: number[] = [];

      for (let i = 0; i < numBars; i++) {
        let max = 0;
        const start = i * samplesPerBar;
        const end = Math.min(start + samplesPerBar, audioData.length);

        for (let j = start; j < end; j++) {
          const abs = Math.abs(audioData[j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }

      // Normalize peaks
      const maxPeak = Math.max(...peaks, 0.01);
      const normalized = peaks.map((p) => p / maxPeak);

      setWaveformData(normalized);
      await audioContext.close();
    } catch (e) {
      console.error("Failed to compute waveform:", e);
      // Generate placeholder waveform
      setWaveformData(Array(200).fill(0.3));
    } finally {
      setIsLoadingWaveform(false);
    }
  }, []);

  // Load waveform when URL changes
  useEffect(() => {
    if (audioUrl) {
      computeWaveform(audioUrl);
    }

    // Reset audio state
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setWaveformData([]); // Clear waveform immediately

    // Don't reset source - let it be recreated fresh
    sourceRef.current = null;
  }, [audioUrl, computeWaveform]);

  // Initialize audio context when audio is ready to play
  const initAudioContext = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Create new context if needed
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === "closed"
      ) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;

      // Create analyser
      if (!analyserRef.current) {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
      }

      // Connect source only once per audio element
      if (!sourceRef.current) {
        try {
          const source = audioContext.createMediaElementSource(audio);
          source.connect(analyserRef.current);
          analyserRef.current.connect(audioContext.destination);
          sourceRef.current = source;
        } catch (e) {
          // Already connected - that's fine
          console.log("Audio already connected");
        }
      }

      // Notify parent of analyser
      if (onAnalyser && analyserRef.current) {
        onAnalyser(analyserRef.current);
      }
    } catch (e) {
      console.error("Failed to init audio context:", e);
    }
  }, [onAnalyser]);

  // Draw static waveform with playback position
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || waveformData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    if (
      canvas.width !== rect.width * dpr ||
      canvas.height !== rect.height * dpr
    ) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;

    // Clear canvas
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Calculate playback progress
    const progress = duration > 0 ? currentTime / duration : 0;
    const progressX = progress * width;

    // Draw waveform bars
    const barWidth = width / waveformData.length;
    const barGap = 1;
    const maxBarHeight = height * 0.8;

    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const barHeight = waveformData[i] * maxBarHeight;
      const y = centerY - barHeight / 2;

      // Color: played part is bright, unplayed is dim
      if (x < progressX) {
        ctx.fillStyle = color;
      } else {
        ctx.fillStyle = `${color}40`;
      }

      ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);
    }

    // Draw playhead cursor
    if (progress > 0 && progress < 1) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(progressX - 1, 0, 2, height);
    }

    // Continue animation if playing
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [waveformData, currentTime, duration, color, isPlaying]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleCanPlay = () => {
      setIsReady(true);
      setDuration(audio.duration);
      initAudioContext();
      drawWaveform();
      if (onReady) onReady();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (onTimeUpdate) onTimeUpdate(audio.currentTime);
    };

    const handleError = () => {
      setError("Failed to load audio");
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
      animationRef.current = requestAnimationFrame(drawWaveform);
      if (onPlay) onPlay();
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
      drawWaveform();
      if (onPause) onPause();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
      drawWaveform();
      if (onPause) onPause();
    };

    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [initAudioContext, onReady, onTimeUpdate, onPlay, onPause, drawWaveform]);

  // Redraw on waveform data change
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform, waveformData]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => drawWaveform();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawWaveform]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, [isPlaying, isReady]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audio.muted = newMuted;
  }, [isMuted]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;

      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
      audio.volume = newVolume;
    },
    []
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const audio = audioRef.current;
      const canvas = canvasRef.current;
      if (!audio || !canvas || !isReady) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      audio.currentTime = percentage * audio.duration;
    },
    [isReady]
  );

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
      {label && (
        <div className="text-sm font-medium text-[var(--color-text-muted)] mb-3">
          {label}
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Waveform Canvas */}
      <div ref={containerRef} className="relative mb-3">
        <canvas
          ref={canvasRef}
          onClick={handleSeek}
          className="w-full h-16 rounded-lg cursor-pointer"
          style={{ background: "#0f172a" }}
        />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 rounded-lg">
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        {isLoadingWaveform && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--color-text-muted)] text-xs">
              Loading waveform...
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          disabled={!isReady}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-surface-hover)] hover:bg-emerald-500 text-[var(--color-text)] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlaying ? <FaPause /> : <FaPlay className="ml-0.5" />}
        </button>

        <div className="text-sm font-mono text-[var(--color-text-muted)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {isMuted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-[var(--color-surface-hover)] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
