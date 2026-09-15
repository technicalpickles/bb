---
category: Overlays
---

Composes with: `TooltipContent`, `TooltipProvider`, `TooltipTrigger`.

## Example

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="Copy"><Icon name="Copy" /></Button>
  </TooltipTrigger>
  <TooltipContent>Copy thread link</TooltipContent>
</Tooltip>
```
