"use client";

import { useEffect, useState } from "react";
import {
  FaCog,
  FaMicrochip,
  FaMusic,
  FaRobot,
  FaWaveSquare,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";

interface LoadingAnalysisProps {
  jobId: string;
  stemJobId?: string;
  onComplete: (data: any) => void;
}

export function LoadingAnalysis({
  jobId,
  stemJobId,
  onComplete,
}: LoadingAnalysisProps) {
  const [status, setStatus] = useState<string>("Initializing...");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const eventSource = new EventSource(
      `http://127.0.0.1:4000/api/jobs/${jobId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "Processing") {
          setStatus(data.data);
          setLogs((prev) => [...prev, data.data]);
        } else if (data.status === "Completed") {
          eventSource.close();
          // data.data is [metrics, ai_text] tuple in Rust, but here it might be serialized differently?
          // Wait, in Rust: JobStatus::Completed(ComparisonResult, String)
          // serde serialization for enum with content:
          // "data": [ {metrics object}, "ai text" ]
          // So we need to reconstruct the expected object format: { metrics: ..., analysis_text: ... }
          const [metrics, analysis_text] = data.data;
          onComplete({ metrics, analysis_text });
        } else if (data.status === "Failed") {
          eventSource.close();
          setError(data.data);
        }
      } catch (e) {
        console.error("Error parsing SSE event:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      // Don't close immediately on error, browser might retry, but if it persists...
      // eventSource.close();
      // setError("Connection lost. Retrying...");
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, onComplete]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-500">
        <div className="text-red-500 text-5xl mb-4">
          <FaExclamationTriangle />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-red-400">
          Analysis Failed
        </h2>
        <p className="text-[var(--color-text-muted)]">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)]"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-500 w-full max-w-2xl mx-auto">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
        <div className="relative w-24 h-24 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] flex items-center justify-center text-4xl text-emerald-400 shadow-2xl">
          <FaWaveSquare className="animate-bounce" />
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-2 text-[var(--color-text-highlight)]">
        {status}
      </h2>
      <p className="text-[var(--color-text-muted)] mb-8 max-w-md">
        Processing your audio with high-precision algorithms...
      </p>

      {/* Real-time Logs */}
      <div className="w-full bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4 h-48 overflow-y-auto font-mono text-xs text-left shadow-inner">
        {logs.length === 0 && (
          <span className="text-gray-600 italic">Waiting for updates...</span>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className="mb-1 text-emerald-500/80 flex items-center gap-2"
          >
            <span className="text-[10px] opacity-50">
              {new Date().toLocaleTimeString()}
            </span>
            <span>{log}</span>
          </div>
        ))}
        <div className="animate-pulse text-emerald-500">_</div>
      </div>
    </div>
  );
}
