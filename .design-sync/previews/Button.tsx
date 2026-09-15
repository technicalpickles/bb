import { Button, Icon } from "@bb/shared-ui";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Save changes</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="outline">Connect repo</Button>
      <Button variant="ghost">Settings</Button>
      <Button variant="destructive">Delete project</Button>
      <Button variant="link">View docs</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" variant="outline" aria-label="Search">
        <Icon name="Search" />
      </Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Icon name="Check" />
        Save changes
      </Button>
      <Button variant="outline" size="sm">
        Add local path
        <Icon name="ChevronRight" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="More actions">
        <Icon name="MoreHorizontal" />
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Save changes</Button>
      <Button variant="secondary" disabled>
        Cancel
      </Button>
      <Button variant="outline" disabled>
        Connect repo
      </Button>
      <Button variant="destructive" disabled>
        Delete project
      </Button>
    </div>
  );
}
