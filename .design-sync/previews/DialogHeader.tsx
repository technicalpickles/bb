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
          <DialogTitle>Rename thread</DialogTitle>
          <DialogDescription>
            Only you and other collaborators on this thread see the new
            name.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
