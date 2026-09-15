import { Toggle } from "@bb/shared-ui";

export function States() {
  return (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Bold">B</Toggle>
      <Toggle pressed aria-label="Italic, pressed">
        I
      </Toggle>
      <Toggle disabled aria-label="Underline, disabled">
        U
      </Toggle>
    </div>
  );
}

export function Variants() {
  return (
    <div className="flex items-center gap-2">
      <Toggle variant="default" pressed aria-label="Default variant">
        Default
      </Toggle>
      <Toggle variant="outline" pressed aria-label="Outline variant">
        Outline
      </Toggle>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-2">
      <Toggle size="sm" pressed aria-label="Small">
        S
      </Toggle>
      <Toggle size="default" pressed aria-label="Default size">
        M
      </Toggle>
      <Toggle size="lg" pressed aria-label="Large">
        L
      </Toggle>
    </div>
  );
}
