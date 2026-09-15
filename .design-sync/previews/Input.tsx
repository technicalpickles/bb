import { Input, Label } from "@bb/shared-ui";

export function Default() {
  return (
    <div className="w-[320px]">
      <Input placeholder="Search threads" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div className="flex w-[320px] flex-col gap-1.5">
      <Label htmlFor="workspace-path">Workspace path</Label>
      <Input id="workspace-path" defaultValue="~/github.com/get-bb/bb" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-[320px]">
      <Input disabled defaultValue="Managed by your organization" />
    </div>
  );
}
