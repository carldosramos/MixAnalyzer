export const API_BASE = "http://127.0.0.1:4000";

// ---- Types ----------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

export interface MixVersion {
  id: string;
  version_name: string;
  created_at: string;
  stem_job_id?: string;
}

export interface ReferenceTrack {
  id: string;
  name: string;
  created_at: string;
}

export interface ProjectDetails {
  project: Project;
  versions: MixVersion[];
  references: ReferenceTrack[];
}

export interface AnalysisData {
  metrics: unknown;
  ai_report: string;
}

export interface AnalysisJob {
  job_id: string;
  stem_job_id?: string;
}

// ---- Helpers ---------------------------------------------------------------

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---- API functions ---------------------------------------------------------

export const api = {
  getProjects: (): Promise<Project[]> =>
    fetch(`${API_BASE}/api/projects`).then(handleResponse),

  createProject: (name: string): Promise<Project> =>
    fetch(`${API_BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(handleResponse),

  getProject: (id: string): Promise<ProjectDetails> =>
    fetch(`${API_BASE}/api/projects/${id}`).then(handleResponse),

  getAnalysis: (versionId: string): Promise<AnalysisData> =>
    fetch(`${API_BASE}/api/analyses/version/${versionId}`).then(handleResponse),

  deleteVersion: (versionId: string): Promise<void> =>
    fetch(`${API_BASE}/api/versions/${versionId}`, {
      method: "DELETE",
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),

  reanalyze: (versionId: string): Promise<AnalysisJob> =>
    fetch(`${API_BASE}/api/versions/${versionId}/reanalyze`, {
      method: "POST",
    }).then(handleResponse),

  reanalyzeStems: (versionId: string): Promise<{ stem_job_id: string }> =>
    fetch(`${API_BASE}/api/versions/${versionId}/reanalyze-stems`, {
      method: "POST",
    }).then(handleResponse),

  analyze: (formData: FormData): Promise<AnalysisJob> =>
    fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    }).then(handleResponse),
};
