---
category: Data display
---

Composes with: `CardContent`, `CardDescription`, `CardFooter`, `CardHeader`, `CardTitle`.

## Example

```tsx
<Card>
  <CardHeader>
    <CardTitle>Local workspace</CardTitle>
    <CardDescription>Agents run against a checkout on this machine.</CardDescription>
  </CardHeader>
  <CardFooter className="justify-end gap-2">
    <Button variant="ghost">Remove</Button>
    <Button>Open</Button>
  </CardFooter>
</Card>
```
