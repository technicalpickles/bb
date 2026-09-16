import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[260px] w-[240px] items-start pt-2">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Columns
            <Icon name="ChevronDown" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Status</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Provider</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            Updated
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
