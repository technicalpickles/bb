import { Alert, AlertDescription, AlertTitle, Icon } from "@bb/shared-ui";

export function Default() {
  return (
    <Alert className="w-[420px]">
      <Icon name="Info" />
      <AlertTitle>Host daemon updated</AlertTitle>
      <AlertDescription>
        This machine reconnected on the latest protocol version. Running
        threads picked up where they left off.
      </AlertDescription>
    </Alert>
  );
}

export function Destructive() {
  return (
    <Alert variant="destructive" className="w-[420px]">
      <Icon name="AlertCircle" />
      <AlertTitle>Couldn't reach the workspace</AlertTitle>
      <AlertDescription>
        The checkout at ~/github.com/get-bb/bb is missing. Re-enroll the
        machine or pick a different path.
      </AlertDescription>
    </Alert>
  );
}

export function TitleOnly() {
  return (
    <Alert className="w-[420px]">
      <Icon name="CircleCheck" />
      <AlertTitle>All checks passed</AlertTitle>
    </Alert>
  );
}
