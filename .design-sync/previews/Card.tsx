import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@bb/shared-ui";

export function Default() {
  return (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Local workspace</CardTitle>
        <CardDescription>
          Agents run against a checkout on this machine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          ~/github.com/get-bb/bb
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost">Remove</Button>
        <Button>Open</Button>
      </CardFooter>
    </Card>
  );
}

export function Stats() {
  return (
    <div className="flex gap-3">
      <Card className="w-[170px]">
        <CardHeader>
          <CardDescription>Active threads</CardDescription>
          <CardTitle className="text-2xl">12</CardTitle>
        </CardHeader>
      </Card>
      <Card className="w-[170px]">
        <CardHeader>
          <CardDescription>Needs input</CardDescription>
          <CardTitle className="text-2xl">3</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
