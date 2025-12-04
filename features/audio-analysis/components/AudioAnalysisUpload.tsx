"use client";

import { useState } from "react";
import {
  FaCloudUploadAlt,
  FaMusic,
  FaSpinner,
  FaUpload,
  FaMagic,
  FaExclamationTriangle,
} from "react-icons/fa";

interface AudioAnalysisUploadProps {
  onAnalysisStart?: (jobId: string, stemJobId?: string) => void;
  onAnalysisComplete: (data: any) => void;
  projectId?: string; // New prop
}

export function AudioAnalysisUpload({
  onAnalysisStart,
  onAnalysisComplete,
  projectId,
}: AudioAnalysisUploadProps) {
  const [mixFile, setMixFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!mixFile || !referenceFile) return;
    if (projectId && !versionName.trim()) {
      setError("Please provide a version name (e.g., 'v1.0')");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("mix", mixFile);
      formData.append("reference", referenceFile);
      if (projectId) {
        formData.append("project_id", projectId);
        formData.append("version_name", versionName);
      }

      const res = await fetch("http://127.0.0.1:4000/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${text}`);
      }

      const data = await res.json();
      console.log("API Response:", data); // Debug log
      // New response format: { job_id: "...", stem_job_id: "..." }
      if (data.job_id && onAnalysisStart) {
        onAnalysisStart(data.job_id, data.stem_job_id);
      } else if (data.error) {
        throw new Error(data.error);
      }

      // We don't call onAnalysisComplete here anymore, the parent handles it via SSE
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during upload");
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 shadow-lg">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2 text-[var(--color-text-highlight)]">
          {projectId ? "Upload New Version" : "Upload Your Mix"}
        </h2>
        <p className="text-[var(--color-text-muted)]">
          Upload your mix and a reference track to get professional AI mastering
          feedback.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Mix Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Your Mix
          </label>
          <div className="relative group">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setMixFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className={`h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
                mixFile
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-[var(--color-border)] group-hover:border-[var(--color-primary)] bg-[var(--color-surface-hover)]"
              }`}
            >
              <FaUpload
                className={`text-2xl mb-2 ${
                  mixFile
                    ? "text-emerald-500"
                    : "text-[var(--color-text-muted)]"
                }`}
              />
              <span className="text-sm text-[var(--color-text-muted)] px-2 text-center truncate w-full">
                {mixFile ? mixFile.name : "Click to upload mix"}
              </span>
            </div>
          </div>
        </div>

        {/* Reference Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Reference Track
          </label>
          <div className="relative group">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className={`h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
                referenceFile
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-[var(--color-border)] group-hover:border-[var(--color-primary)] bg-[var(--color-surface-hover)]"
              }`}
            >
              <FaUpload
                className={`text-2xl mb-2 ${
                  referenceFile
                    ? "text-blue-500"
                    : "text-[var(--color-text-muted)]"
                }`}
              />
              <span className="text-sm text-[var(--color-text-muted)] px-2 text-center truncate w-full">
                {referenceFile
                  ? referenceFile.name
                  : "Click to upload reference"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {projectId && (
        <div className="mb-8">
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
            Version Name
          </label>
          <input
            type="text"
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder="e.g., 'Bass Boosted', 'V2 Final'"
            className="w-full px-4 py-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-[var(--color-text)]"
          />
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400 text-sm">
          <FaExclamationTriangle />
          {error}
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={!mixFile || !referenceFile || isAnalyzing}
        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
          !mixFile || !referenceFile || isAnalyzing
            ? "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] cursor-not-allowed"
            : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg hover:scale-[1.02]"
        }`}
      >
        {isAnalyzing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Uploading...
          </>
        ) : (
          <>
            <FaMagic /> Start Analysis
          </>
        )}
      </button>
    </div>
  );
}
