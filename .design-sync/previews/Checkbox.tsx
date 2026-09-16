import { Checkbox, Label } from "@bb/shared-ui";

export function States() {
  return (
    <div className="flex items-center gap-4">
      <Checkbox aria-label="Unchecked" />
      <Checkbox checked aria-label="Checked" />
      <Checkbox checked="indeterminate" aria-label="Indeterminate" />
      <Checkbox disabled aria-label="Unchecked, disabled" />
      <Checkbox checked disabled aria-label="Checked, disabled" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="autostart" checked />
      <Label htmlFor="autostart">Start this workflow automatically</Label>
    </div>
  );
}

export function List() {
  return (
    <div className="flex w-[280px] flex-col gap-2">
      {[
        { id: "github", label: "GitHub", checked: true },
        { id: "memory", label: "Memory", checked: true },
        { id: "docs", label: "Docs", checked: false },
      ].map((plugin) => (
        <div key={plugin.id} className="flex items-center gap-2">
          <Checkbox id={plugin.id} defaultChecked={plugin.checked} />
          <Label htmlFor={plugin.id} className="text-sm font-normal">
            {plugin.label}
          </Label>
        </div>
      ))}
    </div>
  );
}
