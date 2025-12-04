"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { AudioAnalysisUpload } from "../../audio-analysis/components/AudioAnalysisUpload";
import { MixComparisonReport } from "../../audio-analysis/components/MixComparisonReport";
import { LoadingAnalysis } from "../../audio-analysis/components/LoadingAnalysis";
import { ThemeToggle } from "../../theme/components/ThemeToggle";
import { FaWaveSquare, FaFolder } from "react-icons/fa";

export default function MixAnalyzerPage() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stemJobId, setStemJobId] = useState<string | null>(null);

  // Use ref to track stemJobId synchronously (avoids closure issues)
  const stemJobIdRef = useRef<string | null>(null);

  const handleAnalysisStart = (id: string, stemId?: string) => {
    console.log("Analysis started:", { jobId: id, stemJobId: stemId });
    setJobId(id);
    if (stemId) {
      stemJobIdRef.current = stemId; // Set ref immediately
      setStemJobId(stemId);
    }
  };

  const handleAnalysisComplete = (data: any) => {
    console.log("Analysis complete, stemJobId (ref):", stemJobIdRef.current);
    setAnalysisData(data);
    setJobId(null);
    // Ensure state reflects ref value
    if (stemJobIdRef.current) {
      setStemJobId(stemJobIdRef.current);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-surface-muted)] text-[var(--color-text)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl shadow-md">
            <FaWaveSquare />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Mix Analyzer Pro</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
          >
            <FaFolder /> Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {jobId ? (
          <LoadingAnalysis
            jobId={jobId}
            stemJobId={stemJobId || undefined}
            onComplete={handleAnalysisComplete}
          />
        ) : !analysisData ? (
          <div className="flex-1 flex items-center justify-center p-6 animate-in fade-in duration-500">
            <AudioAnalysisUpload
              onAnalysisStart={handleAnalysisStart}
              onAnalysisComplete={handleAnalysisComplete}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <MixComparisonReport
              data={analysisData}
              stemJobId={stemJobId || undefined}
              onBack={() => {
                setAnalysisData(null);
                setStemJobId(null);
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
