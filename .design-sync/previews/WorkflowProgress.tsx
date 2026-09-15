import { WorkflowProgress } from "@bb/shared-ui";

const phases = [
  { index: 0, title: "Plan" },
  { index: 1, title: "Build" },
  { index: 2, title: "Review" },
];

const agents = [
  {
    index: 0,
    label: "planner",
    state: "done" as const,
    model: "claude-sonnet-5",
    attempt: 1,
    cached: false,
    lastProgressAt: 0,
    phaseIndex: 0,
    tokens: 4200,
    toolCalls: 3,
    durationMs: 18000,
  },
  {
    index: 1,
    label: "builder",
    state: "running" as const,
    model: "claude-sonnet-5",
    attempt: 1,
    cached: false,
    lastProgressAt: 0,
    phaseIndex: 1,
    tokens: 12500,
    toolCalls: 9,
  },
  {
    index: 2,
    label: "reviewer",
    state: "failed" as const,
    model: "claude-sonnet-5",
    attempt: 1,
    cached: false,
    lastProgressAt: 0,
    phaseIndex: 2,
    error: "Build step exited with code 1",
  },
];

export function Static() {
  return (
    <div className="w-[420px]">
      <WorkflowProgress progress={{ phases, agents }} settled={false} />
    </div>
  );
}

export function Collapsible() {
  return (
    <div className="w-[420px]">
      <WorkflowProgress
        progress={{ phases, agents }}
        settled={false}
        collapsiblePhases
        currentPhaseIndex={1}
      />
    </div>
  );
}
