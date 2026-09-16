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
        <SelectValue placeholder="Pick a branch" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="main">main</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Selected() {
  return (
    <Select defaultValue="main">
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="main">main</SelectItem>
        <SelectItem value="staging">staging</SelectItem>
      </SelectContent>
    </Select>
  );
}
