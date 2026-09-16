import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[240px] w-[240px] items-start pt-2">
      <Select open defaultValue="claude">
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Pick a provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude">Claude</SelectItem>
          <SelectItem value="gpt">GPT-4</SelectItem>
          <SelectSeparator />
          <SelectItem value="local">Local model</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
