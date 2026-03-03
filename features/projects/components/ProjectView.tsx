"use client";

import { useState, useRef } from "react";
import {
  FaArrowLeft,
  FaHistory,
  FaPlay,
  FaFileAudio,
  FaTrash,
  FaRedo,
  FaSpinner,
} from "react-icons/fa";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AudioAnalysisUpload } from "../../audio-analysis/components/AudioAnalysisUpload";
import { LoadingAnalysis } from "../../audio-analysis/components/LoadingAnalysis";
import { MixComparisonReport } from "../../audio-analysis/components/MixComparisonReport";
import {
  useProject,
  useAnalysis,
  useDeleteVersion,
  useReanalyze,
  useReanalyzeStems,
  queryKeys,
} from "@/lib/queries";

interface ProjectViewProps {
  projectId: string;
}

export function ProjectView({ projectId }: ProjectViewProps) {
  const queryClient = useQueryClient();

  // Job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [stemJobId, setStemJobId] = useState<string | null>(null);
  const stemJobIdRef = useRef<string | null>(null);

  // Which historical version is selected (drives useAnalysis)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Fresh analysis result coming directly from SSE completion
  const [freshAnalysis, setFreshAnalysis] = useState<{
    metrics: unknown;
    analysis_text: string;
  } | null>(null);

  // Needed for re-analyze / refresh-stems actions
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Queries
  const { data: projectData, isLoading } = useProject(projectId);
  const analysisQuery = useAnalysis(selectedVersionId);

  // Mutations
  const deleteVersion = useDeleteVersion(projectId);
  const reanalyze = useReanalyze();
  const reanalyzeStems = useReanalyzeStems();

  // Derived display value — fresh SSE result takes precedence over cached query
  const analysisResult = freshAnalysis ?? analysisQuery.data ?? null;
  const isLoadingAnalysis = analysisQuery.isLoading && !!selectedVersionId && !freshAnalysis;

  const handleAnalysisStart = (jobId: string, stemId?: string) => {
    setActiveJobId(jobId);
    if (stemId) {
      stemJobIdRef.current = stemId;
      setStemJobId(stemId);
    }
  };

  const handleAnalysisComplete = (data: { metrics: unknown; analysis_text: string }) => {
    setFreshAnalysis(data);
    setActiveJobId(null);
    if (stemJobIdRef.current) {
      setStemJobId(stemJobIdRef.current);
    }
    // Refresh version list to include the newly created version
    queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
  };

  const handleVersionClick = (versionId: string) => {
    if (confirmingDeleteId) {
      setConfirmingDeleteId(null);
      return;
    }
    const selected = projectData?.versions.find((v) => v.id === versionId);
    stemJobIdRef.current = selected?.stem_job_id ?? null;
    setStemJobId(selected?.stem_job_id ?? null);
    setCurrentVersionId(versionId);
    setFreshAnalysis(null);
    setSelectedVersionId(versionId);
  };

  const handleDeleteClick = (e: React.MouseEvent, versionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmingDeleteId(versionId);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, versionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    await deleteVersion.mutateAsync(versionId);
    setConfirmingDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmingDeleteId(null);
  };

  const handleReAnalyze = async () => {
    if (!currentVersionId) return;
    const data = await reanalyze.mutateAsync(currentVersionId);
    if (data.error) return;
    setFreshAnalysis(null);
    setSelectedVersionId(null);
    if (data.stem_job_id) {
      stemJobIdRef.current = data.stem_job_id;
      setStemJobId(data.stem_job_id);
    }
    setActiveJobId(data.job_id);
  };

  const handleRefreshStems = async () => {
    if (!currentVersionId) return;
    const data = await reanalyzeStems.mutateAsync(currentVersionId);
    if (data.stem_job_id) {
      stemJobIdRef.current = data.stem_job_id;
      setStemJobId(data.stem_job_id);
    }
  };

  const handleBack = () => {
    setFreshAnalysis(null);
    setSelectedVersionId(null);
    setCurrentVersionId(null);
    stemJobIdRef.current = null;
    setStemJobId(null);
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

  // SSE-driven loading (new analysis in progress)
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

  // Loading a historical analysis
  if (isLoadingAnalysis) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-muted)]">
        <FaSpinner className="animate-spin text-3xl text-emerald-500" />
      </div>
    );
  }

  // Showing analysis report
  if (analysisResult) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-muted)]">
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleReAnalyze}
            disabled={reanalyze.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50"
          >
            <FaRedo /> {reanalyze.isPending ? "Starting..." : "Re-analyze"}
          </button>
        </div>
        <MixComparisonReport
          data={analysisResult}
          stemJobId={stemJobId || undefined}
          onBack={handleBack}
          onRefreshStems={handleRefreshStems}
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
                              disabled={deleteVersion.isPending}
                              className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
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
