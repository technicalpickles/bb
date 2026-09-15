import { DelayedLoading, Skeleton } from "@bb/shared-ui";

export function Default() {
  return (
    <DelayedLoading>
      <div className="flex w-[280px] flex-col gap-2 rounded-md border border-border-hairline p-3">
        <div className="text-sm font-medium">Workspace ready</div>
        <div className="text-xs text-muted-foreground">
          Mounts its children after a short delay, so a fast-resolving load
          never flashes a loading state.
        </div>
      </div>
    </DelayedLoading>
  );
}

export function TypicalFallbackPairing() {
  return (
    <div className="flex w-[280px] flex-col gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
