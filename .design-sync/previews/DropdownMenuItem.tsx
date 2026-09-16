import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@bb/shared-ui";

export function Default() {
  return (
    <div className="flex h-[240px] w-[220px] items-start pt-2">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Actions
            <Icon name="ChevronDown" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Icon name="Copy" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Icon name="Download" />
            Export (unavailable)
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            <Icon name="Trash2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
