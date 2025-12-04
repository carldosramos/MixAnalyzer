"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaPlus, FaFolder, FaClock, FaArrowRight } from "react-icons/fa";
import { ThemeToggle } from "../../theme/components/ThemeToggle";

interface Project {
  id: string;
  name: string;
  created_at: string;
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("http://127.0.0.1:4000/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const res = await fetch("http://127.0.0.1:4000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName }),
      });

      if (res.ok) {
        const project = await res.json();
        setProjects([project, ...projects]);
        setNewProjectName("");
        setIsCreating(false);
      }
    } catch (error) {
      console.error("Failed to create project", error);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-highlight)]">
            Your Projects
          </h1>
          <p className="text-[var(--color-text-muted)]">
            Manage and track your mixing sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-medium"
          >
            <FaPlus /> New Project
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="mb-8 p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl animate-in fade-in slide-in-from-top-4">
          <form onSubmit={handleCreateProject} className="flex gap-4">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project Name (e.g., 'Summer Hits 2024')"
              className="flex-1 px-4 py-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-[var(--color-text)]"
              autoFocus
            />
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-6 py-3 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-muted)] text-[var(--color-text)] rounded-lg"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 bg-[var(--color-surface)] rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] border-dashed">
          <FaFolder className="text-6xl text-[var(--color-text-muted)] mx-auto mb-4 opacity-20" />
          <h3 className="text-xl font-medium text-[var(--color-text-muted)]">
            No projects yet
          </h3>
          <p className="text-sm text-gray-500 mt-2">
            Create your first project to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group block bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <FaFolder className="text-xl" />
                </div>
                <FaArrowRight className="text-[var(--color-text-muted)] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text-highlight)] mb-2 group-hover:text-emerald-400 transition-colors">
                {project.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <FaClock />
                <span>{new Date(project.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
