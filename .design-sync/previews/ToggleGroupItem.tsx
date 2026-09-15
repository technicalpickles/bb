import { ToggleGroup, ToggleGroupItem } from "@bb/shared-ui";

export function Default() {
  return (
    <ToggleGroup type="single" defaultValue="mine" aria-label="Filter">
      <ToggleGroupItem value="all" aria-label="All threads">
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="mine" aria-label="My threads">
        Mine
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Disabled() {
  return (
    <ToggleGroup type="single" defaultValue="all" aria-label="Filter">
      <ToggleGroupItem value="all" aria-label="All threads">
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="mine" disabled aria-label="My threads, disabled">
        Mine
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
