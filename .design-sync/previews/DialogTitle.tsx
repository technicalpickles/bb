import { Dialog, DialogContent, DialogTitle } from "@bb/shared-ui";

export function Default() {
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Delete this thread?</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
