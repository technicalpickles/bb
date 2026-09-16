import { Icon } from "@bb/shared-ui";

const NAMES = [
  "Search",
  "Settings",
  "Copy",
  "Trash2",
  "Info",
  "AlertTriangle",
  "CircleCheck",
  "ChevronRight",
  "Terminal",
  "Folder",
  "MoreHorizontal",
  "X",
] as const;

export function Default() {
  return (
    <div className="grid grid-cols-6 gap-4 p-4">
      {NAMES.map((name) => (
        <div
          key={name}
          className="flex flex-col items-center gap-1.5 text-muted-foreground"
        >
          <Icon name={name} className="size-5" />
          <span className="text-2xs">{name}</span>
        </div>
      ))}
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-4 text-foreground">
      <Icon name="Terminal" className="size-3.5" />
      <Icon name="Terminal" className="size-4" />
      <Icon name="Terminal" className="size-5" />
      <Icon name="Terminal" className="size-6" />
    </div>
  );
}

export function Labeled() {
  return (
    <Icon
      name="AlertCircle"
      className="size-5 text-destructive-text"
      aria-label="Connection error"
    />
  );
}
