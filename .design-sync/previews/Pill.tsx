import { Pill } from "@bb/shared-ui";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill variant="secondary">managed</Pill>
      <Pill variant="destructive">failed</Pill>
      <Pill variant="outline">manager</Pill>
      <Pill variant="emphasis">active</Pill>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-2">
      <Pill variant="outline">fork</Pill>
      <Pill variant="outline" size="sm">
        fork
      </Pill>
    </div>
  );
}

export function Truncated() {
  return (
    <div className="flex items-center gap-2">
      <Pill variant="outline">feat/review-flow</Pill>
      <Pill variant="outline" className="max-w-40">
        feat/very-long-branch-name-that-truncates
      </Pill>
    </div>
  );
}
