import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bb/shared-ui";

export function Placeholder() {
  return (
    <Select>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Pick a provider" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="claude">Claude</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Filled() {
  return (
    <Select defaultValue="claude">
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="claude">Claude</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Disabled() {
  return (
    <Select defaultValue="claude" disabled>
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="claude">Claude</SelectItem>
      </SelectContent>
    </Select>
  );
}
