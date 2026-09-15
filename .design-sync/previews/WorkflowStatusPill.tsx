import { WorkflowStatusPill } from "@bb/shared-ui";

export function States() {
  return (
    <div className="flex items-center gap-2">
      <WorkflowStatusPill state="queued" />
      <WorkflowStatusPill state="completed" />
      <WorkflowStatusPill state="failed" />
      <WorkflowStatusPill state="cancelled" />
    </div>
  );
}
