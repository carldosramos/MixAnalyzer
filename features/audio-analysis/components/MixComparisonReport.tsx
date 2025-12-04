"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FaArrowLeft,
  FaChartBar,
  FaRobot,
  FaMusic,
  FaWaveSquare,
  FaBolt,
  FaLayerGroup,
} from "react-icons/fa";
import { StemAnalysisTab } from "./StemAnalysisTab";

interface AudioMetrics {
  integrated_lufs: number;
  loudness_range: number;
  true_peak: number;
  dynamic_complexity: number;
  bpm: number;
  beat_confidence: number;
  danceability: number;
  key: string;
  scale: string;
  tuning_frequency: number;
  spectral_centroid: number;
  spectral_rolloff: number;
  spectral_flux: number;
}

interface ComparisonResult {
  mix: AudioMetrics;
  reference: AudioMetrics;
}

interface AnalysisResponse {
  metrics: ComparisonResult;
  analysis_text: string;
}

interface MixComparisonReportProps {
  data: AnalysisResponse;
  stemJobId?: string;
  onBack: () => void;
  onRefreshStems?: () => void;
}

export function MixComparisonReport({
  data,
  stemJobId,
  onBack,
  onRefreshStems,
}: MixComparisonReportProps) {
  const { metrics, analysis_text } = data;
  const [activeTab, setActiveTab] = useState<"overview" | "stems">("overview");

  console.log("MixComparisonReport rendered with stemJobId:", stemJobId);

  const renderMetricBar = (
    label: string,
    mixVal: number,
    refVal: number,
    unit: string = "",
    min: number = 0,
    max: number = 1,
    inverse: boolean = false // If true, lower is "better" or just different visualization
  ) => {
    // Normalize to 0-100%
    const range = max - min;
    const mixPercent = Math.min(
      100,
      Math.max(0, ((mixVal - min) / range) * 100)
    );
    const refPercent = Math.min(
      100,
      Math.max(0, ((refVal - min) / range) * 100)
    );

    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium text-[var(--color-text-muted)]">
            {label}
          </span>
          <div className="flex gap-4 text-xs font-mono">
            <span className="text-emerald-500">
              Mix: {mixVal.toFixed(1)}
              {unit}
            </span>
            <span className="text-blue-500">
              Ref: {refVal.toFixed(1)}
              {unit}
            </span>
          </div>
        </div>
        <div className="h-3 bg-[var(--color-surface-hover)] rounded-full relative overflow-hidden">
          {/* Reference Marker */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-blue-500 z-10 opacity-70"
            style={{ left: `${refPercent}%` }}
          />
          {/* Mix Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-emerald-500 opacity-80 transition-all duration-500"
            style={{ width: `${mixPercent}%` }}
          />
        </div>
      </div>
    );
  };

  const renderValueComparison = (
    label: string,
    mixVal: string | number,
    refVal: string | number,
    unit: string = ""
  ) => (
    <div className="flex justify-between items-center py-3 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm font-medium text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="flex gap-4 text-sm">
        <span className="font-bold text-emerald-400">
          {mixVal}
          {unit}
        </span>
        <span className="text-[var(--color-text-muted)]">vs</span>
        <span className="font-bold text-blue-400">
          {refVal}
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 max-w-6xl mx-auto w-full">
      {/* Header with Back Button and Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <button
          onClick={onBack}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm font-medium"
        >
          <FaArrowLeft /> Analyze Another Mix
        </button>

        {/* Tabs */}
        <div className="flex gap-2 bg-[var(--color-surface)] p-1 rounded-lg border border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "overview"
                ? "bg-emerald-500 text-white shadow-md"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <FaChartBar /> Overview
          </button>
          <button
            onClick={() => setActiveTab("stems")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "stems"
                ? "bg-purple-500 text-white shadow-md"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <FaLayerGroup /> Stems
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "stems" ? (
        stemJobId ? (
          <StemAnalysisTab stemJobId={stemJobId} onRefresh={onRefreshStems} />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 gap-6">
            <div className="text-[var(--color-text-muted)] text-center">
              <p className="mb-2">Stem analysis not loaded for this session.</p>
              <p className="text-sm">
                Click below to separate and analyze individual stems (vocals,
                drums, bass, other).
              </p>
            </div>
            {onRefreshStems && (
              <button
                onClick={onRefreshStems}
                className="flex items-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors shadow-lg text-lg"
              >
                <FaLayerGroup /> Load Stem Analysis
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-8 text-[var(--color-text-highlight)]">
            Mix Comparison Report
          </h1>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
            {/* Metrics Panel */}
            <div className="space-y-6">
              {/* Loudness & Dynamics */}
              <div className="bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400">
                  <FaWaveSquare /> Loudness & Dynamics
                </h2>
                {renderMetricBar(
                  "Integrated Loudness",
                  metrics.mix.integrated_lufs,
                  metrics.reference.integrated_lufs,
                  " LUFS",
                  -30,
                  -5
                )}
                {renderMetricBar(
                  "Loudness Range (LRA)",
                  metrics.mix.loudness_range,
                  metrics.reference.loudness_range,
                  " LU",
                  0,
                  20
                )}
                {renderMetricBar(
                  "True Peak",
                  metrics.mix.true_peak,
                  metrics.reference.true_peak,
                  " dBTP",
                  -10,
                  2
                )}
                {renderMetricBar(
                  "Dynamic Complexity",
                  metrics.mix.dynamic_complexity,
                  metrics.reference.dynamic_complexity,
                  "",
                  0,
                  10
                )}
              </div>

              {/* Rhythm & Groove */}
              <div className="bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-400">
                  <FaBolt /> Rhythm & Groove
                </h2>
                {renderValueComparison(
                  "BPM",
                  metrics.mix.bpm.toFixed(1),
                  metrics.reference.bpm.toFixed(1)
                )}
                {renderMetricBar(
                  "Danceability",
                  metrics.mix.danceability,
                  metrics.reference.danceability,
                  "",
                  0,
                  3
                )}
                {renderMetricBar(
                  "Beat Confidence",
                  metrics.mix.beat_confidence,
                  metrics.reference.beat_confidence,
                  "",
                  0,
                  5
                )}
              </div>

              {/* Tonal & Spectral */}
              <div className="bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-400">
                  <FaMusic /> Tonal & Spectral
                </h2>
                {renderValueComparison(
                  "Key",
                  `${metrics.mix.key} ${metrics.mix.scale}`,
                  `${metrics.reference.key} ${metrics.reference.scale}`
                )}
                {renderValueComparison(
                  "Tuning",
                  metrics.mix.tuning_frequency.toFixed(1),
                  metrics.reference.tuning_frequency.toFixed(1),
                  " Hz"
                )}

                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                  {renderMetricBar(
                    "Brightness (Centroid)",
                    metrics.mix.spectral_centroid,
                    metrics.reference.spectral_centroid,
                    " Hz",
                    0,
                    5000
                  )}
                  {renderMetricBar(
                    "High-End (Rolloff)",
                    metrics.mix.spectral_rolloff,
                    metrics.reference.spectral_rolloff,
                    " Hz",
                    0,
                    20000
                  )}
                  {renderMetricBar(
                    "Spectral Flux",
                    metrics.mix.spectral_flux,
                    metrics.reference.spectral_flux,
                    "",
                    0,
                    5
                  )}
                </div>
              </div>
            </div>

            {/* AI Analysis Panel */}
            <div className="bg-[var(--color-surface)] p-8 rounded-xl border border-[var(--color-border)] h-fit sticky top-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-blue-400">
                <FaRobot /> AI Mastering Engineer
              </h2>
              <div className="prose prose-invert max-w-none text-base leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {analysis_text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
