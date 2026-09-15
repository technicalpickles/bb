# bb design conventions

bb is a dense, neutral, developer-tool UI: Inter at small sizes (`text-xs`/`text-sm` do most of the work), hairline borders, near-monochrome surfaces, and color reserved for state (destructive, warning, success). Build with `window.BbUI` components for controls and Tailwind utility classes for your own layout.

## Setup

- Link `styles.css` and load `_ds_bundle.js`. The body already gets `bg-background text-foreground` and `font-family: var(--font-sans)` (Inter Variable).
- Wrap the app in `<TooltipProvider>`. `Tooltip` throws without it.
- Dark mode is a class: add `dark` to a wrapper (`<div className="dark">`). Every color token swaps under `.dark`. Don't hand-pick colors per theme.

## Styling idiom: Tailwind v4 utilities over bb tokens

**The stylesheet is precompiled.** Only classes the bb app already uses exist in `styles.css`. A made-up utility (an arbitrary `w-[437px]`, an uncommon color step) renders unstyled with no error. Stick to the families below, and `grep` `_ds_bundle.css` before relying on anything unusual. Use `style={{...}}` for one-off dimensions.

| Need | Use |
|---|---|
| Page / panel surface | `bg-background`, `bg-card`, `bg-popover`, `bg-surface-raised`, `bg-surface-recessed` |
| Text | `text-foreground`, `text-muted-foreground`, `text-subtle-foreground` |
| Hover / selected rows | `hover:bg-state-hover`, `bg-state-active`, `bg-surface-selected` |
| Borders | `border border-border`, `border-border-hairline`, `border-input` (form fields) |
| State color | `text-destructive-text`, `bg-surface-destructive`, `text-warning-text`, `bg-surface-attention`, `text-success` |
| Type scale | `text-2xs`, `text-xs`, `text-sm`, `text-base`; `font-medium`, `font-semibold`; `font-mono` for paths and code |
| Radius / shadow | `rounded-md`, `rounded-lg`; `shadow-xs`, `shadow-sm` |
| Layout glue | `flex`, `flex-col`, `items-center`, `justify-between`, `gap-1.5`/`gap-2`/`gap-3`/`gap-4`, `p-3`/`p-4`/`p-6`, `px-3`, `py-2`, `w-full`, `min-w-0`, `truncate` |

Raw values are available as CSS variables when you need them in inline styles: `var(--border)`, `var(--muted-foreground)`, `var(--foreground)`, `var(--radius-md)`, `var(--font-mono)`.

## Where the truth lives

- `styles.css` and its imports (`_ds_bundle.css` holds the compiled utilities and tokens): read these before styling anything unusual.
- `components/<section>/<Name>/<Name>.prompt.md` for usage, `<Name>.d.ts` for props. Compound components (Card, Dialog, DropdownMenu, Select, Tabs...) list their parts under "Composes with".
- Icons: `<Icon name="..." />` takes a fixed set of names, including `Check`, `ChevronRight`, `ChevronDown`, `Copy`, `Search`, `Settings`, `MoreHorizontal`, `X`, `Info`, `AlertCircle`, `AlertTriangle`, `CircleCheck`, `Trash2`, `Folder`, `Terminal`. Inside a `Button`, icons auto-size to 16px.

## Example

```tsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Pill, Switch, Icon } = window.BbUI;

<Card className="w-full">
  <CardHeader>
    <div className="flex items-center justify-between gap-2">
      <CardTitle>Local workspace</CardTitle>
      <Pill variant="outline" size="sm">main</Pill>
    </div>
    <CardDescription>Agents run against a checkout on this machine.</CardDescription>
  </CardHeader>
  <CardContent className="flex flex-col gap-3">
    <div className="truncate font-mono text-xs text-muted-foreground">~/github.com/get-bb/bb</div>
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">Dim inactive splits</span>
      <Switch checked aria-label="Dim inactive splits" />
    </div>
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm">Remove</Button>
      <Button size="sm"><Icon name="ChevronRight" />Open</Button>
    </div>
  </CardContent>
</Card>
```
