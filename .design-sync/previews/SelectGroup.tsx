import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
          <SelectGroup>
            <SelectLabel>Cloud</SelectLabel>
            <SelectItem value="claude">Claude</SelectItem>
            <SelectItem value="gpt">GPT-4</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
