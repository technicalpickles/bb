import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[260px] w-[220px] items-start pt-2">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Provider
            <Icon name="ChevronDown" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Cloud</DropdownMenuLabel>
          <DropdownMenuItem>Claude</DropdownMenuItem>
          <DropdownMenuItem>GPT-4</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Local</DropdownMenuLabel>
          <DropdownMenuItem>Local model</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
