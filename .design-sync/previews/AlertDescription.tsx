import { Alert, AlertDescription, AlertTitle, Icon } from "@bb/shared-ui";

export function Default() {
  return (
    <Alert className="w-[380px]">
      <Icon name="Info" />
      <AlertTitle>Host daemon updated</AlertTitle>
      <AlertDescription>
        This machine reconnected on the latest protocol version. Running
        threads picked up where they left off.
      </AlertDescription>
    </Alert>
  );
}

export function WithoutTitle() {
  return (
    <Alert className="w-[380px]">
      <Icon name="CircleCheck" />
      <AlertDescription>All checks passed on this branch.</AlertDescription>
    </Alert>
  );
}
