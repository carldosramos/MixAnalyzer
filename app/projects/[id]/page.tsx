import { Suspense } from "react";
import { ProjectView } from "@/features/projects/components/ProjectView";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={<div className="p-8 text-center">Loading project...</div>}
    >
      <ProjectView projectId={id} />
    </Suspense>
  );
}
