import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";

// ---- Query keys ------------------------------------------------------------

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  analysis: (versionId: string) => ["analyses", versionId] as const,
};

// ---- Queries ---------------------------------------------------------------

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: api.getProjects,
    staleTime: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.getProject(id),
    staleTime: 30_000,
  });
}

export function useAnalysis(versionId: string | null) {
  return useQuery({
    queryKey: queryKeys.analysis(versionId!),
    queryFn: () => api.getAnalysis(versionId!),
    enabled: !!versionId,
    staleTime: Infinity, // analysis results never change
  });
}

// ---- Mutations -------------------------------------------------------------

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useDeleteVersion(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteVersion,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useReanalyze() {
  return useMutation({ mutationFn: api.reanalyze });
}

export function useReanalyzeStems() {
  return useMutation({ mutationFn: api.reanalyzeStems });
}

export function useStartAnalysis() {
  return useMutation({ mutationFn: api.analyze });
}
