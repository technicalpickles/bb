import { Textarea } from "@bb/shared-ui";

export function Default() {
  return (
    <Textarea
      className="w-[360px]"
      defaultValue="Refactor the plugin catalog service to batch its marketplace lookups."
    />
  );
}

export function Placeholder() {
  return (
    <Textarea
      className="w-[360px]"
      placeholder="Add a note for the next session…"
    />
  );
}

export function Disabled() {
  return (
    <Textarea
      className="w-[360px]"
      disabled
      defaultValue="Locked while the agent is running."
    />
  );
}
