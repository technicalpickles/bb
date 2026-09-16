import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[220px] w-[240px] items-start pt-2">
      <Select open defaultValue="claude">
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Pick a provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude">Claude</SelectItem>
          <SelectItem value="gpt">GPT-4</SelectItem>
          <SelectItem value="local">Local model</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function Closed() {
  return (
    <Select defaultValue="main">
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Pick a branch" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="main">main</SelectItem>
        <SelectItem value="staging">staging</SelectItem>
      </SelectContent>
    </Select>
  );
}
