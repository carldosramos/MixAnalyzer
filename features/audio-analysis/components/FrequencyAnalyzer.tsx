"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FrequencyMetrics,
  computeFrequencyMetrics,
} from "../utils/stemMetrics";

interface FrequencyAnalyzerProps {
  audioUrl: string;
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
  color?: string;
  height?: number;
  onMetricsComputed?: (metrics: FrequencyMetrics) => void;
}

// Frequency labels for log-scale display
const FREQ_LABELS = [
  { freq: 20, label: "20" },
  { freq: 50, label: "50" },
  { freq: 100, label: "100" },
  { freq: 200, label: "200" },
  { freq: 500, label: "500" },
  { freq: 1000, label: "1k" },
  { freq: 2000, label: "2k" },
  { freq: 5000, label: "5k" },
  { freq: 10000, label: "10k" },
  { freq: 20000, label: "20k" },
];

export function FrequencyAnalyzer({
  audioUrl,
  analyser,
  isPlaying = false,
  color = "#10b981",
  height = 200,
  onMetricsComputed,
}: FrequencyAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const [averageSpectrum, setAverageSpectrum] = useState<number[]>([]);
  const [isLoadingAverage, setIsLoadingAverage] = useState(true);

  // Number of frequency bands for display
  const NUM_BANDS = 64;

  // Log scale conversion: frequency to x position
  const freqToX = useCallback(
    (freq: number, graphWidth: number, leftPad: number) => {
      const minLog = Math.log10(20);
      const maxLog = Math.log10(20000);
      const logFreq = Math.log10(Math.max(20, Math.min(20000, freq)));
      return leftPad + ((logFreq - minLog) / (maxLog - minLog)) * graphWidth;
    },
    []
  );

  // Pre-compute average spectrum from audio file
  const computeAverageSpectrum = useCallback(async () => {
    if (!audioUrl) return;

    setIsLoadingAverage(true);

    try {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error("Failed to fetch audio");

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const fftSize = 2048;
      const sampleRate = audioBuffer.sampleRate;
      const hopSize = fftSize;

      // Mix to mono
      const numChannels = audioBuffer.numberOfChannels;
      let audioData: Float32Array;
      if (numChannels === 1) {
        audioData = new Float32Array(audioBuffer.getChannelData(0));
      } else {
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        audioData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          audioData[i] = (left[i] + right[i]) / 2;
        }
      }

      const avgSpectrum = new Array(NUM_BANDS).fill(0);
      const totalFrames = Math.floor(audioData.length / hopSize);
      const framesToAnalyze = Math.min(50, totalFrames);
      const frameStep = Math.max(1, Math.floor(totalFrames / framesToAnalyze));

      let validFrameCount = 0;

      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx += frameStep) {
        const frameStart = frameIdx * hopSize;
        if (frameStart + fftSize > audioData.length) break;

        const frame = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
          const window =
            0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
          frame[i] = audioData[frameStart + i] * window;
        }

        // Compute energy in log-spaced frequency bands
        for (let band = 0; band < NUM_BANDS; band++) {
          const minFreq = 20;
          const maxFreq = Math.min(20000, sampleRate / 2);
          const freqLow =
            minFreq * Math.pow(maxFreq / minFreq, band / NUM_BANDS);
          const freqHigh =
            minFreq * Math.pow(maxFreq / minFreq, (band + 1) / NUM_BANDS);

          const binLow = Math.max(
            1,
            Math.floor((freqLow * fftSize) / sampleRate)
          );
          const binHigh = Math.min(
            fftSize / 2 - 1,
            Math.ceil((freqHigh * fftSize) / sampleRate)
          );

          let bandEnergy = 0;
          for (let bin = binLow; bin <= binHigh; bin++) {
            const k = bin;
            const w = (2 * Math.PI * k) / fftSize;
            const coeff = 2 * Math.cos(w);
            let s0 = 0,
              s1 = 0,
              s2 = 0;

            for (let n = 0; n < fftSize; n++) {
              s0 = frame[n] + coeff * s1 - s2;
              s2 = s1;
              s1 = s0;
            }

            const real = s1 - s2 * Math.cos(w);
            const imag = s2 * Math.sin(w);
            bandEnergy += Math.sqrt(real * real + imag * imag);
          }

          avgSpectrum[band] += bandEnergy / Math.max(1, binHigh - binLow + 1);
        }

        validFrameCount++;
      }

      if (validFrameCount > 0) {
        for (let i = 0; i < NUM_BANDS; i++) {
          avgSpectrum[i] /= validFrameCount;
        }
      }

      // Convert to dB and normalize
      const maxDb = 0;
      const minDb = -60;
      const dbSpectrum = avgSpectrum.map((val) => {
        const db = val > 0 ? 20 * Math.log10(val) : minDb;
        const normalized =
          (Math.max(minDb, Math.min(maxDb, db)) - minDb) / (maxDb - minDb);
        return normalized * 255;
      });

      setAverageSpectrum(dbSpectrum);

      // Compute and export metrics
      if (onMetricsComputed) {
        const metrics = computeFrequencyMetrics(dbSpectrum);
        onMetricsComputed(metrics);
      }

      await audioContext.close();
    } catch (e) {
      console.error("Failed to compute average spectrum:", e);
      setAverageSpectrum(Array(NUM_BANDS).fill(50));
    } finally {
      setIsLoadingAverage(false);
    }
  }, [audioUrl]);

  // Compute average when URL changes
  useEffect(() => {
    computeAverageSpectrum();
  }, [computeAverageSpectrum]);

  // Initialize data array when analyser is available
  useEffect(() => {
    if (analyser) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (
      canvas.width !== rect.width * dpr ||
      canvas.height !== rect.height * dpr
    ) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const canvasHeight = rect.height;
    const padding = { top: 15, right: 15, bottom: 35, left: 45 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = canvasHeight - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, canvasHeight);

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;

    const dbLevels = [0, -12, -24, -36, -48, -60];
    ctx.font = "10px monospace";
    ctx.textAlign = "right";

    dbLevels.forEach((db) => {
      const y = padding.top + (-db / 60) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(`${db}`, padding.left - 8, y + 4);
    });

    ctx.textAlign = "center";
    FREQ_LABELS.forEach(({ freq, label }) => {
      const x = freqToX(freq, graphWidth, padding.left);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, canvasHeight - padding.bottom);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillText(label, x, canvasHeight - padding.bottom + 15);
    });

    // Axis labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Frequency (Hz)", width / 2, canvasHeight - 5);
    ctx.save();
    ctx.translate(12, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Level (dB)", 0, 0);
    ctx.restore();

    // Loading state
    if (isLoadingAverage) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Analyzing...", width / 2, canvasHeight / 2);
      return;
    }

    // ==== LAYER 1: AVERAGE SPECTRUM (BACKGROUND - FADED) ====
    if (averageSpectrum.length > 0) {
      // Filled area - very faded
      ctx.beginPath();
      ctx.fillStyle = `${color}15`;

      let started = false;
      for (let i = 0; i < averageSpectrum.length; i++) {
        const freq = 20 * Math.pow(1000, i / averageSpectrum.length);
        const x = freqToX(freq, graphWidth, padding.left);
        const normalized = averageSpectrum[i] / 255;
        const y = padding.top + graphHeight * (1 - normalized);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(width - padding.right, padding.top + graphHeight);
      ctx.lineTo(padding.left, padding.top + graphHeight);
      ctx.closePath();
      ctx.fill();

      // Outline - faded
      ctx.beginPath();
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1.5;
      started = false;
      for (let i = 0; i < averageSpectrum.length; i++) {
        const freq = 20 * Math.pow(1000, i / averageSpectrum.length);
        const x = freqToX(freq, graphWidth, padding.left);
        const normalized = averageSpectrum[i] / 255;
        const y = padding.top + graphHeight * (1 - normalized);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // ==== LAYER 2: REAL-TIME SPECTRUM (FOREGROUND - BRIGHT) ====
    if (analyser && dataArrayRef.current && isPlaying) {
      analyser.getByteFrequencyData(
        dataArrayRef.current as Uint8Array<ArrayBuffer>
      );
      const dataArray = dataArrayRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const sampleRate = analyser.context.sampleRate;

      // Filled area - semi-transparent
      ctx.beginPath();
      ctx.fillStyle = `${color}50`;

      let started = false;
      let lastX = padding.left;
      let lastY = padding.top + graphHeight;

      for (let i = 0; i < bufferLength; i++) {
        const freq = (i * sampleRate) / (bufferLength * 2);
        if (freq < 20 || freq > 20000) continue;

        const x = freqToX(freq, graphWidth, padding.left);
        const normalized = dataArray[i] / 255;
        const y = padding.top + graphHeight * (1 - normalized * 0.9);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          const cpx = (lastX + x) / 2;
          const cpy = (lastY + y) / 2;
          ctx.quadraticCurveTo(lastX, lastY, cpx, cpy);
        }
        lastX = x;
        lastY = y;
      }

      ctx.lineTo(width - padding.right, padding.top + graphHeight);
      ctx.lineTo(padding.left, padding.top + graphHeight);
      ctx.closePath();
      ctx.fill();

      // Bright line on top with glow
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      started = false;
      lastX = padding.left;
      lastY = padding.top + graphHeight;

      for (let i = 0; i < bufferLength; i++) {
        const freq = (i * sampleRate) / (bufferLength * 2);
        if (freq < 20 || freq > 20000) continue;

        const x = freqToX(freq, graphWidth, padding.left);
        const normalized = dataArray[i] / 255;
        const y = padding.top + graphHeight * (1 - normalized * 0.9);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          const cpx = (lastX + x) / 2;
          const cpy = (lastY + y) / 2;
          ctx.quadraticCurveTo(lastX, lastY, cpx, cpy);
        }
        lastX = x;
        lastY = y;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Continue animation if playing
    if (isPlaying && analyser) {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [averageSpectrum, analyser, isPlaying, color, freqToX, isLoadingAverage]);

  // Start/stop animation
  useEffect(() => {
    if (isPlaying && analyser) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(animationRef.current);
      draw(); // Draw static
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, analyser, draw]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[var(--color-border)] overflow-hidden"
      style={{ height, background: "#0f172a" }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
