import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Icon,
} from "@bb/shared-ui";

export function Default() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Icon name="Edit" />
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename thread</DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
