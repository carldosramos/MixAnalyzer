"use client";

import {
  FaChartBar,
  FaWaveSquare,
  FaBolt,
  FaBalanceScale,
  FaArrowUp,
  FaArrowDown,
  FaEquals,
  FaInfoCircle,
} from "react-icons/fa";
import {
  FrequencyMetrics,
  formatFrequency,
  getDiffColor,
} from "../utils/stemMetrics";
import { Tooltip } from "../../shared/components/Tooltip";

interface StemMetricsDisplayProps {
  mixMetrics: FrequencyMetrics | null;
  refMetrics: FrequencyMetrics | null;
  color: string;
}

export function StemMetricsDisplay({
  mixMetrics,
  refMetrics,
  color,
}: StemMetricsDisplayProps) {
  if (!mixMetrics) return null;

  const renderMetricRow = (
    label: string,
    mixVal: number,
    refVal: number | undefined,
    format: (v: number) => string,
    inverse = false // true if lower is better/different logic
  ) => {
    const hasRef = refVal !== undefined;
    const diff = hasRef ? mixVal - refVal : 0;
    const diffColor = hasRef ? getDiffColor(diff) : "";

    // Calculate percentage difference
    const percentDiff =
      hasRef && refVal !== 0 ? ((mixVal - refVal) / refVal) * 100 : 0;

    return (
      <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
        <span className="text-xs font-medium text-[var(--color-text-muted)] w-24">
          {label}
        </span>

        <div className="flex items-center gap-3 flex-1 justify-end">
          {/* Mix Value */}
          <span
            className={`font-mono font-bold text-sm ${
              color ? "" : "text-[var(--color-text)]"
            }`}
            style={{ color: color }}
          >
            {format(mixVal)}
          </span>

          {/* Comparison */}
          {hasRef && (
            <>
              <span className="text-[var(--color-text-muted)] text-xs">vs</span>
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {format(refVal)}
              </span>

              <div
                className={`flex items-center gap-1 min-w-[3rem] justify-end ${diffColor}`}
              >
                {Math.abs(percentDiff) < 5 ? (
                  <FaEquals className="text-[10px]" />
                ) : diff > 0 ? (
                  <FaArrowUp className="text-[10px]" />
                ) : (
                  <FaArrowDown className="text-[10px]" />
                )}
                <span className="text-xs font-bold">
                  {Math.abs(percentDiff).toFixed(0)}%
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderBandRow = (
    label: string,
    bandKey: keyof FrequencyMetrics["bands"]
  ) => {
    const mixVal = mixMetrics.bands[bandKey] * 100; // Convert to 0-100 scale
    const refVal = refMetrics ? refMetrics.bands[bandKey] * 100 : undefined;

    return renderMetricRow(label, mixVal, refVal, (v) => v.toFixed(1));
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Energy Distribution */}
      <div className="bg-[var(--color-surface-hover)] rounded-lg p-4 border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text-highlight)]">
            <FaChartBar /> Energy Distribution
          </h4>
          <Tooltip content="Shows how energy is distributed across the frequency spectrum. Balanced mixes typically have even distribution.">
            <FaInfoCircle className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-help text-xs" />
          </Tooltip>
        </div>
        <div className="space-y-1">
          {renderBandRow("Sub Bass", "subBass")}
          {renderBandRow("Bass", "bass")}
          {renderBandRow("Low Mids", "lowMids")}
          {renderBandRow("Mids", "mids")}
          {renderBandRow("High Mids", "highMids")}
          {renderBandRow("Highs", "highs")}
        </div>
      </div>

      {/* Spectral Characteristics */}
      <div className="bg-[var(--color-surface-hover)] rounded-lg p-4 border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text-highlight)]">
            <FaWaveSquare /> Spectral Characteristics
          </h4>
          <Tooltip content="Technical measurements of the sound's texture. Brightness = center of mass. High-End = where highs roll off. Peak Freq = dominant tone.">
            <FaInfoCircle className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-help text-xs" />
          </Tooltip>
        </div>
        <div className="space-y-1">
          {renderMetricRow(
            "Brightness",
            mixMetrics.spectralCentroid,
            refMetrics?.spectralCentroid,
            formatFrequency
          )}
          {renderMetricRow(
            "High-End",
            mixMetrics.spectralRolloff,
            refMetrics?.spectralRolloff,
            formatFrequency
          )}
          {renderMetricRow(
            "Peak Freq",
            mixMetrics.peakFrequency,
            refMetrics?.peakFrequency,
            formatFrequency
          )}
          {renderMetricRow(
            "Bandwidth",
            mixMetrics.bandwidth,
            refMetrics?.bandwidth,
            formatFrequency
          )}
        </div>
      </div>

      {/* Dynamics & Balance */}
      <div className="bg-[var(--color-surface-hover)] rounded-lg p-4 border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text-highlight)]">
            <FaBalanceScale /> Dynamics & Balance
          </h4>
          <Tooltip content="Dynamic Range = punchiness (peak vs average). Low/High Ratio = tonal balance. Bass Presence = low-end power.">
            <FaInfoCircle className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-help text-xs" />
          </Tooltip>
        </div>
        <div className="space-y-1">
          {renderMetricRow(
            "Dynamic Range",
            mixMetrics.dynamicRange,
            refMetrics?.dynamicRange,
            (v) => v.toFixed(2)
          )}
          {renderMetricRow(
            "Low/High Ratio",
            mixMetrics.lowHighRatio,
            refMetrics?.lowHighRatio,
            (v) => v.toFixed(2)
          )}
          {renderMetricRow(
            "Bass Presence",
            mixMetrics.bassPresence * 100,
            refMetrics ? refMetrics.bassPresence * 100 : undefined,
            (v) => v.toFixed(1) + "%"
          )}
          {renderMetricRow(
            "Brightness",
            mixMetrics.brightnessScore * 100,
            refMetrics ? refMetrics.brightnessScore * 100 : undefined,
            (v) => v.toFixed(1) + "%"
          )}
        </div>
      </div>
    </div>
  );
}
