import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[220px] w-[220px] items-start pt-2">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Sort by
            <Icon name="ChevronDown" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="recent">
            <DropdownMenuRadioItem value="recent">
              Most recent
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
