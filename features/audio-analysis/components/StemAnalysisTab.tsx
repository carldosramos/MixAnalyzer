"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FaDrum,
  FaGuitar,
  FaMicrophone,
  FaMusic,
  FaSpinner,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSync,
} from "react-icons/fa";
import { WaveformPlayer } from "./WaveformPlayer";
import { FrequencyAnalyzer } from "./FrequencyAnalyzer";
import { StemMetricsDisplay } from "./StemMetricsDisplay";
import {
  FrequencyMetrics,
  formatFrequency,
  getDiffColor,
  getDiffIndicator,
} from "../utils/stemMetrics";

interface StemMetrics {
  file_path: string;
  integrated_lufs: number;
  spectral_centroid: number;
  spectral_rolloff: number;
}

interface StemAnalysisResult {
  stems: Record<string, StemMetrics>;
}

interface StemAnalysisTabProps {
  stemJobId: string;
  onComplete?: (data: StemAnalysisResult) => void;
  onRefresh?: () => void;
}

type StemName = "drums" | "bass" | "vocals" | "other";

// Icon mapping for stems
const stemIcons: Record<string, React.ReactNode> = {
  drums: <FaDrum />,
  bass: <FaGuitar />,
  vocals: <FaMicrophone />,
  other: <FaMusic />,
};

// Color mapping for stems
const stemColors: Record<
  string,
  { text: string; bg: string; border: string; hex: string }
> = {
  drums: {
    text: "text-orange-400",
    bg: "bg-orange-500/20",
    border: "border-orange-500/50",
    hex: "#fb923c",
  },
  bass: {
    text: "text-purple-400",
    bg: "bg-purple-500/20",
    border: "border-purple-500/50",
    hex: "#a855f7",
  },
  vocals: {
    text: "text-pink-400",
    bg: "bg-pink-500/20",
    border: "border-pink-500/50",
    hex: "#ec4899",
  },
  other: {
    text: "text-cyan-400",
    bg: "bg-cyan-500/20",
    border: "border-cyan-500/50",
    hex: "#22d3ee",
  },
};

const STEM_ORDER: StemName[] = ["vocals", "drums", "bass", "other"];

export function StemAnalysisTab({
  stemJobId,
  onComplete,
  onRefresh,
}: StemAnalysisTabProps) {
  const [status, setStatus] = useState<string>("Initializing...");
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>("");
  const [stemData, setStemData] = useState<StemAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // UI State
  const [selectedStem, setSelectedStem] = useState<StemName>("vocals");
  const [mixAnalyser, setMixAnalyser] = useState<AnalyserNode | null>(null);
  const [refAnalyser, setRefAnalyser] = useState<AnalyserNode | null>(null);
  const [mixPlaying, setMixPlaying] = useState(false);
  const [refPlaying, setRefPlaying] = useState(false);

  // Frequency metrics state
  const [mixMetrics, setMixMetrics] = useState<FrequencyMetrics | null>(null);
  const [refMetrics, setRefMetrics] = useState<FrequencyMetrics | null>(null);

  useEffect(() => {
    if (!stemJobId) return;

    const eventSource = new EventSource(
      `http://127.0.0.1:4000/api/stems/${stemJobId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "Separating") {
          setStatus("Separating stems...");
          setProgress(data.data.progress);
          setStage(data.data.stage);
        } else if (data.status === "Analyzing") {
          setStatus("Analyzing stems...");
          setProgress(90);
          setStage(`Analyzing ${data.data.stem}`);
        } else if (data.status === "Completed") {
          eventSource.close();
          setProgress(100);
          setIsComplete(true);
          setStemData(data.data);
          if (onComplete) {
            onComplete(data.data);
          }
        } else if (data.status === "Failed") {
          eventSource.close();
          setError(data.data);
        }
      } catch (e) {
        console.error("Error parsing stem SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      console.log("Stem SSE connection error, will retry...");
    };

    return () => {
      eventSource.close();
    };
  }, [stemJobId, onComplete]);

  // Reset audio states when switching stems
  useEffect(() => {
    // Reset playing states (the audio elements will be recreated by key changes)
    setMixPlaying(false);
    setRefPlaying(false);
    setMixAnalyser(null);
    setRefAnalyser(null);
    setMixMetrics(null);
    setRefMetrics(null);
  }, [selectedStem]);

  // Get audio URL for a stem
  const getStemUrl = useCallback(
    (type: "mix" | "reference", stemName: string) => {
      // Stems are stored in uploads/stems/{stemJobId}/{mix|reference}/{stemName}.wav
      return `http://127.0.0.1:4000/uploads/stems/${stemJobId}/${type}/${stemName}.wav`;
    },
    [stemJobId]
  );

  // Loading state
  if (!isComplete && !error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 animate-in fade-in duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
          <div className="relative w-20 h-20 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] flex items-center justify-center text-3xl text-purple-400 shadow-2xl">
            <FaMusic className="animate-bounce" />
          </div>
        </div>

        <h3 className="text-xl font-bold mb-2 text-[var(--color-text-highlight)]">
          {status}
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">{stage}</p>

        {/* Progress Bar */}
        <div className="w-full max-w-md">
          <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-2">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] mt-6 text-center max-w-sm">
          Using Demucs AI to separate your audio into individual stems...
          <br />
          This may take a moment depending on track length.
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500">
        <div className="text-red-500 text-4xl mb-4">
          <FaExclamationTriangle />
        </div>
        <h3 className="text-xl font-bold mb-2 text-red-400">
          Stem Separation Failed
        </h3>
        <p className="text-[var(--color-text-muted)] max-w-md mb-6">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
          >
            <FaSync /> Retry Stem Analysis
          </button>
        )}
      </div>
    );
  }

  // Success state - show stem analysis
  if (!stemData) {
    return null;
  }

  const selectedColor = stemColors[selectedStem] || stemColors.other;

  return (
    <div className="p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">
            <FaCheckCircle />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text-highlight)]">
            Stem Analysis
          </h2>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-bold transition-colors shadow-md"
          >
            <FaSync className="text-xs" /> Reload Stems
          </button>
        )}
      </div>

      {/* Stem Selector */}
      <div className="flex gap-2 mb-6 p-1 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        {STEM_ORDER.map((stem) => {
          const colors = stemColors[stem];
          const isSelected = selectedStem === stem;
          return (
            <button
              key={stem}
              onClick={() => setSelectedStem(stem)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                isSelected
                  ? `${colors.bg} ${colors.text} ${colors.border} border`
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              <span className="text-lg">{stemIcons[stem]}</span>
              <span className="capitalize">{stem}</span>
            </button>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Mix */}
        <div className="space-y-4">
          <div
            className={`text-center py-2 rounded-t-lg ${selectedColor.bg} ${selectedColor.text} font-bold`}
          >
            YOUR MIX
          </div>

          {/* Stem Waveform Player */}
          <WaveformPlayer
            audioUrl={getStemUrl("mix", selectedStem)}
            label={`${
              selectedStem.charAt(0).toUpperCase() + selectedStem.slice(1)
            } Stem`}
            color={selectedColor.hex}
            onAnalyser={setMixAnalyser}
            onPlay={() => setMixPlaying(true)}
            onPause={() => setMixPlaying(false)}
          />

          {/* Frequency Analyzer - Pro-Q3 style */}
          <FrequencyAnalyzer
            audioUrl={getStemUrl("mix", selectedStem)}
            analyser={mixAnalyser}
            isPlaying={mixPlaying}
            color={selectedColor.hex}
            height={180}
            onMetricsComputed={setMixMetrics}
          />
        </div>

        {/* Right Column - Reference */}
        <div className="space-y-4">
          <div
            className={`text-center py-2 rounded-t-lg bg-emerald-500/20 text-emerald-400 font-bold`}
          >
            REFERENCE
          </div>

          {/* Stem Waveform Player */}
          <WaveformPlayer
            audioUrl={getStemUrl("reference", selectedStem)}
            label={`${
              selectedStem.charAt(0).toUpperCase() + selectedStem.slice(1)
            } Stem`}
            color="#10b981"
            onAnalyser={setRefAnalyser}
            onPlay={() => setRefPlaying(true)}
            onPause={() => setRefPlaying(false)}
          />

          {/* Frequency Analyzer - Pro-Q3 style */}
          <FrequencyAnalyzer
            audioUrl={getStemUrl("reference", selectedStem)}
            analyser={refAnalyser}
            isPlaying={refPlaying}
            color="#10b981"
            height={180}
            onMetricsComputed={setRefMetrics}
          />
        </div>
      </div>

      {/* Comprehensive Metrics Comparison */}
      <StemMetricsDisplay
        mixMetrics={mixMetrics}
        refMetrics={refMetrics}
        color={selectedColor.hex}
      />

      {/* Comparison Tips */}
      <div className="mt-6 p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)]">💡 Tip:</strong> Play
          both tracks simultaneously to compare the {selectedStem} stems. Watch
          the frequency analyzers to identify tonal differences - areas where
          the reference is fuller indicate where your mix could use more energy.
        </p>
      </div>
    </div>
  );
}
