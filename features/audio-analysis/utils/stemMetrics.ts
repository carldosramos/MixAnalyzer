/**
 * Stem Frequency Metrics Utility
 * Computes comprehensive audio metrics from frequency spectrum data
 */

export interface FrequencyMetrics {
  // Energy distribution by band (0-1 normalized)
  bands: {
    subBass: number; // 20-60Hz
    bass: number; // 60-250Hz
    lowMids: number; // 250-500Hz
    mids: number; // 500Hz-2kHz
    highMids: number; // 2-6kHz
    highs: number; // 6-20kHz
  };

  // Spectral characteristics
  spectralCentroid: number; // Hz - brightness center of mass
  spectralRolloff: number; // Hz - 85% energy cutoff
  peakFrequency: number; // Hz - dominant frequency
  bandwidth: number; // Hz - effective frequency range

  // Energy metrics
  totalEnergy: number; // Overall energy (RMS-like)
  dynamicRange: number; // Ratio of peak to average energy

  // Balance metrics
  lowHighRatio: number; // Ratio of low to high frequencies
  bassPresence: number; // 0-1 score for bass content
  brightnessScore: number; // 0-1 score for brightness
}

// Frequency band definitions
const BANDS = {
  subBass: { min: 20, max: 60 },
  bass: { min: 60, max: 250 },
  lowMids: { min: 250, max: 500 },
  mids: { min: 500, max: 2000 },
  highMids: { min: 2000, max: 6000 },
  highs: { min: 6000, max: 20000 },
};

/**
 * Converts a band index (0 to numBands-1) to corresponding frequency
 * Assumes log-spacing from 20Hz to 20kHz
 */
function indexToFreq(index: number, numBands: number): number {
  return 20 * Math.pow(1000, index / numBands);
}

/**
 * Find the band index range for a given frequency range
 */
function getIndexRange(
  minFreq: number,
  maxFreq: number,
  numBands: number
): { start: number; end: number } {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);

  const startIdx = Math.floor(
    ((Math.log10(minFreq) - minLog) / (maxLog - minLog)) * numBands
  );
  const endIdx = Math.ceil(
    ((Math.log10(maxFreq) - minLog) / (maxLog - minLog)) * numBands
  );

  return {
    start: Math.max(0, startIdx),
    end: Math.min(numBands - 1, endIdx),
  };
}

/**
 * Compute average energy in a frequency band
 */
function computeBandEnergy(
  spectrum: number[],
  minFreq: number,
  maxFreq: number
): number {
  const range = getIndexRange(minFreq, maxFreq, spectrum.length);
  let sum = 0;
  let count = 0;

  for (let i = range.start; i <= range.end; i++) {
    sum += spectrum[i];
    count++;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Compute spectral centroid (brightness center of mass)
 */
function computeSpectralCentroid(spectrum: number[]): number {
  let weightedSum = 0;
  let totalEnergy = 0;

  for (let i = 0; i < spectrum.length; i++) {
    const freq = indexToFreq(i, spectrum.length);
    const energy = spectrum[i];
    weightedSum += freq * energy;
    totalEnergy += energy;
  }

  return totalEnergy > 0 ? weightedSum / totalEnergy : 0;
}

/**
 * Compute spectral rolloff (frequency below which 85% of energy exists)
 */
function computeSpectralRolloff(spectrum: number[], threshold = 0.85): number {
  const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
  const targetEnergy = totalEnergy * threshold;

  let cumulativeEnergy = 0;
  for (let i = 0; i < spectrum.length; i++) {
    cumulativeEnergy += spectrum[i];
    if (cumulativeEnergy >= targetEnergy) {
      return indexToFreq(i, spectrum.length);
    }
  }

  return 20000;
}

/**
 * Find peak frequency (dominant frequency)
 */
function findPeakFrequency(spectrum: number[]): number {
  let maxIdx = 0;
  let maxVal = spectrum[0];

  for (let i = 1; i < spectrum.length; i++) {
    if (spectrum[i] > maxVal) {
      maxVal = spectrum[i];
      maxIdx = i;
    }
  }

  return indexToFreq(maxIdx, spectrum.length);
}

/**
 * Compute effective bandwidth (frequency range with significant energy)
 * Uses -10dB threshold from peak
 */
function computeBandwidth(spectrum: number[]): number {
  const maxVal = Math.max(...spectrum);
  const threshold = maxVal * 0.316; // -10dB

  let lowIdx = 0;
  let highIdx = spectrum.length - 1;

  // Find first significant bin
  for (let i = 0; i < spectrum.length; i++) {
    if (spectrum[i] >= threshold) {
      lowIdx = i;
      break;
    }
  }

  // Find last significant bin
  for (let i = spectrum.length - 1; i >= 0; i--) {
    if (spectrum[i] >= threshold) {
      highIdx = i;
      break;
    }
  }

  const lowFreq = indexToFreq(lowIdx, spectrum.length);
  const highFreq = indexToFreq(highIdx, spectrum.length);

  return highFreq - lowFreq;
}

/**
 * Compute all frequency metrics from a spectrum array
 * @param spectrum Array of frequency bin values (0-255 range from Web Audio API)
 * @returns Complete metrics object
 */
export function computeFrequencyMetrics(spectrum: number[]): FrequencyMetrics {
  if (!spectrum || spectrum.length === 0) {
    return getEmptyMetrics();
  }

  // Normalize spectrum to 0-1 range
  const normalized = spectrum.map((v) => v / 255);

  // Compute band energies
  const bands = {
    subBass: computeBandEnergy(
      normalized,
      BANDS.subBass.min,
      BANDS.subBass.max
    ),
    bass: computeBandEnergy(normalized, BANDS.bass.min, BANDS.bass.max),
    lowMids: computeBandEnergy(
      normalized,
      BANDS.lowMids.min,
      BANDS.lowMids.max
    ),
    mids: computeBandEnergy(normalized, BANDS.mids.min, BANDS.mids.max),
    highMids: computeBandEnergy(
      normalized,
      BANDS.highMids.min,
      BANDS.highMids.max
    ),
    highs: computeBandEnergy(normalized, BANDS.highs.min, BANDS.highs.max),
  };

  // Compute spectral characteristics
  const spectralCentroid = computeSpectralCentroid(normalized);
  const spectralRolloff = computeSpectralRolloff(normalized);
  const peakFrequency = findPeakFrequency(normalized);
  const bandwidth = computeBandwidth(normalized);

  // Energy metrics
  const totalEnergy =
    normalized.reduce((sum, val) => sum + val, 0) / normalized.length;
  const maxEnergy = Math.max(...normalized);
  const dynamicRange = totalEnergy > 0 ? maxEnergy / totalEnergy : 0;

  // Balance metrics
  const lowEnergy = bands.subBass + bands.bass + bands.lowMids;
  const highEnergy = bands.mids + bands.highMids + bands.highs;
  const lowHighRatio = highEnergy > 0 ? lowEnergy / highEnergy : 0;

  const bassPresence = Math.min(1, (bands.subBass + bands.bass) * 2);
  const brightnessScore = Math.min(1, spectralCentroid / 5000);

  return {
    bands,
    spectralCentroid,
    spectralRolloff,
    peakFrequency,
    bandwidth,
    totalEnergy,
    dynamicRange,
    lowHighRatio,
    bassPresence,
    brightnessScore,
  };
}

/**
 * Return empty metrics object
 */
function getEmptyMetrics(): FrequencyMetrics {
  return {
    bands: {
      subBass: 0,
      bass: 0,
      lowMids: 0,
      mids: 0,
      highMids: 0,
      highs: 0,
    },
    spectralCentroid: 0,
    spectralRolloff: 0,
    peakFrequency: 0,
    bandwidth: 0,
    totalEnergy: 0,
    dynamicRange: 0,
    lowHighRatio: 0,
    bassPresence: 0,
    brightnessScore: 0,
  };
}

/**
 * Format a frequency value for display
 */
export function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(1)}k`;
  }
  return `${Math.round(hz)}`;
}

/**
 * Calculate the difference between two metrics values
 * Returns: positive = mix is higher, negative = reference is higher
 */
export function getMetricDiff(mixValue: number, refValue: number): number {
  return mixValue - refValue;
}

/**
 * Get a color class based on how close two values are
 * Returns tailwind classes
 */
export function getDiffColor(diff: number, threshold = 0.1): string {
  const absDiff = Math.abs(diff);
  if (absDiff < threshold / 2) return "text-emerald-400"; // Very close
  if (absDiff < threshold) return "text-yellow-400"; // Slight difference
  return "text-red-400"; // Significant difference
}

/**
 * Get a visual indicator for difference direction
 */
export function getDiffIndicator(diff: number): string {
  if (Math.abs(diff) < 0.02) return "≈";
  return diff > 0 ? "↑" : "↓";
}
