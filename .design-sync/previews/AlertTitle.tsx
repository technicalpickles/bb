import { Alert, AlertTitle, Icon } from "@bb/shared-ui";

export function Default() {
  return (
    <Alert className="w-[380px]">
      <Icon name="Info" />
      <AlertTitle>Host daemon updated</AlertTitle>
    </Alert>
  );
}

export function Long() {
  return (
    <Alert className="w-[380px]">
      <Icon name="AlertTriangle" />
      <AlertTitle>
        The workspace checkout is missing required environment variables
      </AlertTitle>
    </Alert>
  );
}
