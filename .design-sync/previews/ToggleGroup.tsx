import { ToggleGroup, ToggleGroupItem } from "@bb/shared-ui";

export function Single() {
  return (
    <ToggleGroup type="single" defaultValue="list" aria-label="View mode">
      <ToggleGroupItem value="list" aria-label="List view">
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        Grid
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Table view">
        Table
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Multiple() {
  return (
    <ToggleGroup
      type="multiple"
      defaultValue={["bold"]}
      variant="outline"
      aria-label="Text formatting"
    >
      <ToggleGroupItem value="bold" aria-label="Bold">
        B
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        I
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        U
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
