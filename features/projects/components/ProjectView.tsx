"use client";

import { useEffect, useState, useRef } from "react";
import {
  FaArrowLeft,
  FaHistory,
  FaPlay,
  FaFileAudio,
  FaTrash,
  FaRedo,
} from "react-icons/fa";
import Link from "next/link";
import { AudioAnalysisUpload } from "../../audio-analysis/components/AudioAnalysisUpload";
import { LoadingAnalysis } from "../../audio-analysis/components/LoadingAnalysis";
import { MixComparisonReport } from "../../audio-analysis/components/MixComparisonReport";

interface ProjectViewProps {
  projectId: string;
}

interface MixVersion {
  id: string;
  version_name: string;
  created_at: string;
  stem_job_id?: string;
}

interface ReferenceTrack {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectDetails {
  project: {
    id: string;
    name: string;
    created_at: string;
  };
  versions: MixVersion[];
  references: ReferenceTrack[];
}

export function ProjectView({ projectId }: ProjectViewProps) {
  const [projectData, setProjectData] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Analysis State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [stemJobId, setStemJobId] = useState<string | null>(null);
  const stemJobIdRef = useRef<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  const fetchProjectDetails = async () => {
    try {
      const res = await fetch(
        `http://127.0.0.1:4000/api/projects/${projectId}`
      );
      if (res.ok) {
        const data = await res.json();
        setProjectData(data);
      }
    } catch (error) {
      console.error("Failed to fetch project details", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysisStart = (jobId: string, stemId?: string) => {
    setActiveJobId(jobId);
    if (stemId) {
      stemJobIdRef.current = stemId;
      setStemJobId(stemId);
    }
  };

  const handleAnalysisComplete = (data: any) => {
    setAnalysisResult(data);
    setActiveJobId(null);
    // Ensure stemJobId state is set from ref
    if (stemJobIdRef.current) {
      setStemJobId(stemJobIdRef.current);
    }
    // Refresh project data to show new version in list
    fetchProjectDetails();
  };

  const handleVersionClick = async (versionId: string) => {
    // If we're confirming a delete, don't navigate
    if (confirmingDeleteId) {
      setConfirmingDeleteId(null);
      return;
    }

    // Find the version to get its stem_job_id
    const selectedVersion = projectData?.versions.find(
      (v: any) => v.id === versionId
    );
    const storedStemJobId = selectedVersion?.stem_job_id || null;

    // Set stemJobId from stored version data
    stemJobIdRef.current = storedStemJobId;
    setStemJobId(storedStemJobId);
    setCurrentVersionId(versionId);

    try {
      const res = await fetch(
        `http://127.0.0.1:4000/api/analyses/version/${versionId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setAnalysisResult({
            metrics: data.metrics,
            analysis_text: data.ai_report,
          });
        } else {
          alert("No analysis found for this version.");
        }
      }
    } catch (error) {
      console.error("Failed to fetch analysis", error);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, versionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmingDeleteId(versionId);
  };

  const handleConfirmDelete = async (
    e: React.MouseEvent,
    versionId: string
  ) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      const res = await fetch(
        `http://127.0.0.1:4000/api/versions/${versionId}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        fetchProjectDetails();
      }
    } catch (error) {
      console.error("Failed to delete version", error);
    }
    setConfirmingDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmingDeleteId(null);
  };

  const handleReAnalyze = async () => {
    if (!currentVersionId) return;

    try {
      const res = await fetch(
        `http://127.0.0.1:4000/api/versions/${currentVersionId}/reanalyze`,
        { method: "POST" }
      );

      if (!res.ok) {
        console.error("Failed to start re-analysis");
        return;
      }

      const data = await res.json();

      if (data.error) {
        console.error("Re-analyze error:", data.error);
        return;
      }

      // Clear current results and start loading
      setAnalysisResult(null);

      // Set up job tracking like a new analysis
      if (data.stem_job_id) {
        stemJobIdRef.current = data.stem_job_id;
        setStemJobId(data.stem_job_id);
      }

      // Start the loading view with the job ID
      setActiveJobId(data.job_id);
    } catch (error) {
      console.error("Failed to re-analyze", error);
    }
  };

  // Refresh stems only (without full re-analysis)
  const handleRefreshStems = async () => {
    if (!currentVersionId) return;

    try {
      const res = await fetch(
        `http://127.0.0.1:4000/api/versions/${currentVersionId}/reanalyze-stems`,
        { method: "POST" }
      );

      if (!res.ok) {
        console.error("Failed to start stem refresh");
        return;
      }

      const data = await res.json();

      if (data.error) {
        console.error("Stem refresh error:", data.error);
        return;
      }

      // Update stem job ID to trigger the StemAnalysisTab to show loading
      if (data.stem_job_id) {
        stemJobIdRef.current = data.stem_job_id;
        setStemJobId(data.stem_job_id);
      }
    } catch (error) {
      console.error("Failed to refresh stems", error);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-[var(--color-text-muted)]">
        Loading project...
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="p-8 text-center text-red-500">Project not found</div>
    );
  }

  // If viewing a report
  if (analysisResult) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-muted)]">
        {/* Re-analyze button in header */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleReAnalyze}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors shadow-lg"
          >
            <FaRedo /> Re-analyze
          </button>
        </div>
        <MixComparisonReport
          data={analysisResult}
          stemJobId={stemJobId || undefined}
          onBack={() => {
            setAnalysisResult(null);
            setCurrentVersionId(null);
            stemJobIdRef.current = null;
            setStemJobId(null);
          }}
          onRefreshStems={handleRefreshStems}
        />
      </div>
    );
  }

  // If analyzing
  if (activeJobId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-surface-muted)]">
        <LoadingAnalysis
          jobId={activeJobId}
          stemJobId={stemJobId || undefined}
          onComplete={handleAnalysisComplete}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen bg-[var(--color-surface-muted)]">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4 transition-colors"
        >
          <FaArrowLeft /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-[var(--color-text-highlight)]">
          {projectData.project.name}
        </h1>
        <p className="text-[var(--color-text-muted)]">
          Created on{" "}
          {new Date(projectData.project.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Version History */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--color-text-highlight)]">
              <FaHistory /> Version History
            </h3>
            {projectData.versions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No versions uploaded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {projectData.versions.map((version) => (
                  <div
                    key={version.id}
                    onClick={() => handleVersionClick(version.id)}
                    className={`p-3 bg-[var(--color-surface-muted)] rounded-lg border transition-colors cursor-pointer group ${
                      confirmingDeleteId === version.id
                        ? "border-red-500/50"
                        : "border-[var(--color-border)] hover:border-emerald-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--color-text)] group-hover:text-emerald-400">
                        {version.version_name}
                      </span>
                      <div className="flex items-center gap-2">
                        {confirmingDeleteId === version.id ? (
                          <>
                            <span className="text-xs text-red-400">
                              Delete?
                            </span>
                            <button
                              onClick={(e) =>
                                handleConfirmDelete(e, version.id)
                              }
                              className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={handleCancelDelete}
                              className="px-2 py-1 text-xs bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded transition-colors"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {new Date(
                                version.created_at
                              ).toLocaleDateString()}
                            </span>
                            <button
                              onClick={(e) => handleDeleteClick(e, version.id)}
                              className="p-1.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete version"
                            >
                              <FaTrash className="text-xs" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--color-text-highlight)]">
              <FaFileAudio /> Reference Tracks
            </h3>
            {projectData.references.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No reference tracks.
              </p>
            ) : (
              <div className="space-y-3">
                {projectData.references.map((ref) => (
                  <div
                    key={ref.id}
                    className="p-3 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border)] flex items-center gap-3"
                  >
                    <div className="w-8 h-8 bg-blue-500/10 rounded flex items-center justify-center text-blue-500">
                      <FaPlay className="text-xs" />
                    </div>
                    <span className="text-sm text-[var(--color-text)] truncate">
                      {ref.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upload New Version */}
        <div className="lg:col-span-2">
          <AudioAnalysisUpload
            projectId={projectId}
            onAnalysisStart={handleAnalysisStart}
            onAnalysisComplete={handleAnalysisComplete}
          />
        </div>
      </div>
    </div>
  );
}
