"use client";

import { useEffect, useRef, useState } from "react";
import { FaExpandArrowsAlt } from "react-icons/fa";

interface StereoImagerProps {
  leftAnalyser: AnalyserNode | null;
  rightAnalyser: AnalyserNode | null;
  isPlaying: boolean;
  color?: string;
  height?: number;
}

export function StereoImager({
  leftAnalyser,
  rightAnalyser,
  isPlaying,
  color = "#10b981",
  height = 200,
}: StereoImagerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  // Buffers for audio data
  const leftDataRef = useRef<Float32Array | null>(null);
  const rightDataRef = useRef<Float32Array | null>(null);

  // Metrics
  const [correlation, setCorrelation] = useState(0);
  const [width, setWidth] = useState(0);

  // Initialize buffers
  useEffect(() => {
    if (leftAnalyser && rightAnalyser) {
      leftDataRef.current = new Float32Array(leftAnalyser.frequencyBinCount);
      rightDataRef.current = new Float32Array(rightAnalyser.frequencyBinCount);
    }
  }, [leftAnalyser, rightAnalyser]);

  // Animation loop
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (!canvas || !container) return;

      // Handle resizing
      if (canvas.width !== container.clientWidth || canvas.height !== height) {
        canvas.width = container.clientWidth;
        canvas.height = height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas with fade effect
      ctx.fillStyle = "rgba(17, 24, 39, 0.2)"; // Dark background with trail
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (
        isPlaying &&
        leftAnalyser &&
        rightAnalyser &&
        leftDataRef.current &&
        rightDataRef.current
      ) {
        // Get time domain data
        leftAnalyser.getFloatTimeDomainData(leftDataRef.current);
        rightAnalyser.getFloatTimeDomainData(rightDataRef.current);

        const left = leftDataRef.current;
        const right = rightDataRef.current;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = Math.min(centerX, centerY) * 0.8;

        // Draw Vectorscope (Lissajous)
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Rotate 45 degrees:
        // X = (L - R) * 0.707 (Side)
        // Y = (L + R) * 0.707 (Mid)
        // We flip Y for screen coordinates (up is negative)

        // Metrics calculation vars
        let sumMid = 0;
        let sumSide = 0;
        let sumL = 0;
        let sumR = 0;
        let sumLR = 0;
        let sumL2 = 0;
        let sumR2 = 0;

        // Draw points
        // We skip some samples for performance if needed, but 1:1 is best for detail
        for (let i = 0; i < left.length; i += 2) {
          const l = left[i];
          const r = right[i];

          // Math for metrics
          const mid = l + r;
          const side = l - r;
          sumMid += Math.abs(mid);
          sumSide += Math.abs(side);

          sumL += l;
          sumR += r;
          sumLR += l * r;
          sumL2 += l * l;
          sumR2 += r * r;

          // Math for visualization
          // Side is X axis (Width)
          // Mid is Y axis (Mono)
          const x = centerX + (l - r) * scale;
          const y = centerY - (l + r) * scale; // Negative because Y goes down

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Add glow
        ctx.shadowBlur = 4;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Update metrics occasionally (every frame is fine for React state? maybe throttle)
        // Correlation = sum(L*R) / sqrt(sum(L^2) * sum(R^2))
        const denom = Math.sqrt(sumL2 * sumR2);
        const corr = denom > 0.0001 ? sumLR / denom : 0;

        // Width = Side Energy / Mid Energy (approx)
        // Or just Side / (Mid + Side)
        const total = sumMid + sumSide;
        const widthVal = total > 0.0001 ? sumSide / total : 0;

        // Throttle state updates to avoid React render lag
        if (animationRef.current % 10 === 0) {
          setCorrelation(corr);
          setWidth(widthVal);
        }
      } else {
        // Draw grid when idle
        drawGrid(ctx, canvas.width, canvas.height);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, leftAnalyser, rightAnalyser, color, height]);

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(cx, cy) * 0.8;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Diagonal axes (L/R)
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx - size, cy + size);

    // Vertical (Mid) and Horizontal (Side)
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy + size);
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx + size, cy);

    ctx.stroke();
  };

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden border border-[var(--color-border)]">
      <div className="absolute top-2 left-3 z-10 flex items-center gap-2">
        <span className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1">
          <FaExpandArrowsAlt /> STEREO IMAGE
        </span>
      </div>

      {/* Metrics Overlay */}
      <div className="absolute top-2 right-3 z-10 flex flex-col items-end gap-1">
        <div className="text-xs font-mono">
          <span className="text-[var(--color-text-muted)]">CORR: </span>
          <span
            className={correlation < 0 ? "text-red-400" : "text-emerald-400"}
          >
            {correlation.toFixed(2)}
          </span>
        </div>
        <div className="text-xs font-mono">
          <span className="text-[var(--color-text-muted)]">WIDTH: </span>
          <span className="text-blue-400">{(width * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div ref={containerRef} className="w-full" style={{ height }}>
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Labels */}
      <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] text-[var(--color-text-muted)]">
        MID
      </div>
      <div className="absolute top-1/2 left-1 transform -translate-y-1/2 text-[10px] text-[var(--color-text-muted)]">
        SIDE
      </div>
    </div>
  );
}
