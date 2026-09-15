import {
  Button,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bb/shared-ui";

export function Open() {
  return (
    <div className="flex h-[140px] w-[280px] items-end justify-center pb-6">
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Copy thread link">
            <Icon name="Copy" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy thread link</TooltipContent>
      </Tooltip>
    </div>
  );
}
