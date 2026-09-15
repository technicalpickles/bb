import { Badge } from "@bb/shared-ui";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  );
}

export function InContext() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">Claude Code</span>
      <Badge variant="secondary">v2.1</Badge>
      <Badge variant="outline">local</Badge>
    </div>
  );
}
