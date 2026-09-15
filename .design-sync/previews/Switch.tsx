import { Switch } from "@bb/shared-ui";

export function States() {
  return (
    <div className="flex items-center gap-4">
      <Switch checked={false} aria-label="Off" />
      <Switch checked aria-label="On" />
      <Switch checked={false} disabled aria-label="Off, disabled" />
      <Switch checked disabled aria-label="On, disabled" />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-4">
      <Switch size="sm" checked aria-label="Small" />
      <Switch size="default" checked aria-label="Default" />
    </div>
  );
}

export function InSettingRow() {
  return (
    <div className="flex w-[360px] items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-medium">Dim inactive splits</div>
        <div className="text-xs text-muted-foreground">
          Fade out splits that do not have focus.
        </div>
      </div>
      <Switch checked aria-label="Dim inactive splits" />
    </div>
  );
}
