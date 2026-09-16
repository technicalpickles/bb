import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bb/shared-ui";

export function Default() {
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reconnect the machine</DialogTitle>
          <DialogDescription>
            The host daemon lost its connection. Reconnect to resume queued
            work.
          </DialogDescription>
        </DialogHeader>
        <Button>Reconnect</Button>
      </DialogContent>
    </Dialog>
  );
}
