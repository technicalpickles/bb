import { WorkflowPhaseStrip } from "@bb/shared-ui";

const phases = [
  { index: 0, title: "Plan" },
  { index: 1, title: "Build" },
  { index: 2, title: "Review" },
];

function agent(index: number, phaseIndex: number, state: "done" | "running" | "queued") {
  return {
    index,
    label: `agent-${index}`,
    state,
    model: "claude-sonnet-5",
    attempt: 1,
    cached: false,
    lastProgressAt: 0,
    phaseIndex,
  };
}

export function InProgress() {
  const progress = {
    phases,
    agents: [
      agent(0, 0, "done"),
      agent(1, 1, "running"),
      agent(2, 2, "queued"),
    ],
  };
  return (
    <div className="w-[320px]">
      <WorkflowPhaseStrip progress={progress} currentPhaseIndex={1} settled={false} />
    </div>
  );
}

export function Settled() {
  const progress = {
    phases,
    agents: [agent(0, 0, "done"), agent(1, 1, "done"), agent(2, 2, "done")],
  };
  return (
    <div className="w-[320px]">
      <WorkflowPhaseStrip progress={progress} settled />
    </div>
  );
}
