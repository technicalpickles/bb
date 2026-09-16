import {
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
          <DialogTitle>Enroll this machine</DialogTitle>
          <DialogDescription>
            The host daemon will register with your organization and start
            picking up queued agent work. You can remove it later from
            Settings → Machines.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
