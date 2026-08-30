# Survey: where bb assumes everything is on one machine

A pass over the app looking specifically for **leaky abstractions across the
environment / provider / host boundaries** — code that quietly assumes the
server, the host daemon, the agent process, the workspace, and the human's
browser all live on the same machine with the same filesystem.

Companion to
[environments-remote-execution-research.md](environments-remote-execution-research.md)
(what `Environment` is, host churn, thread durability) and
[container-and-remote-environments.md](container-and-remote-environments.md)
(whether plugins can wrap the agent spawn). Findings already established
there are referenced, not re-derived.

Evidence pinned to `6b7a4d7d2`.

## The five boundaries

bb has five distinct "places" that the code sometimes treats as one:

1. **Server** — owns the DB, product policy, plugin backends, the SPA.
2. **Host daemon** — one per enrolled machine, owns workspaces and spawns.
3. **Agent process** — the harness (claude/codex/pi/acp) the daemon spawns.
4. **Workspace filesystem** — where the repo actually lives.
5. **The human's machine** — the browser, and the editor they want to open.

Today 1–4 are almost always the same box, and 5 usually is too. The leaks
below are the places where that coincidence is load-bearing.

---

## 1. Server ⟷ host daemon co-location

### 1a. "Primary host" is read off the server's own disk

`resolvePrimaryHostId`
([`apps/server/src/services/hosts/primary-host.ts:30-71`](../../apps/server/src/services/hosts/primary-host.ts))
resolves in this order:

```ts
readPrimaryHostIdFromDataDir({ dataDir: deps.config.dataDir })  // <- shared filesystem
  ?? resolveSingleConnectedPublicHostId(deps)                   // <- only if exactly 1
  ?? resolveSinglePublicHostId(deps.db)                         // <- only if exactly 1
```

The first branch reads `HOST_ID_FILE_NAME` out of the **server's** data
directory — i.e. it only produces an answer because the daemon writes its id
into the same directory the server reads from. The two fallbacks both bail
out the moment more than one host exists.

Callers that silently mean "primary host" when no host is specified:

- [`services/projects/project-workspace.ts:68,115`](../../apps/server/src/services/projects/project-workspace.ts) — `args.hostId ?? requirePrimaryHostId(deps)`
- [`routes/files.ts:165`](../../apps/server/src/routes/files.ts)
- [`services/system/usage-limits.ts:21`](../../apps/server/src/services/system/usage-limits.ts)
- [`services/ai/inference.ts:261`](../../apps/server/src/services/ai/inference.ts)

### 1b. Server-side inference runs on the primary host, not the thread's host

`inference.ts:261` calls `requireConnectedPrimaryHostId(deps)` and RPCs the
AI service there. So thread titles, commit messages, and any other helper
completion for a thread running on host B are generated using **host A's**
provider credentials and rate limits. Nothing in the call carries the
thread's `hostId`.

The credential read itself is correctly host-side
([`plugins/provider-codex/src/ai/codex-auth.ts:49-54`](../../plugins/provider-codex/src/ai/codex-auth.ts)
reads `~/.codex/auth.json` from the daemon's `os.homedir()`) — the leak is
purely the routing decision above it.

### 1c. `localhost` links get rewritten to the server's hostname

`rewriteLocalhostLinkHref`
([`packages/client-core/src/localhost-link-rewrite.ts`](../../packages/client-core/src/localhost-link-rewrite.ts))
takes a `localhost:PORT` link the agent printed and swaps in
`currentHostname` — the hostname the **browser** is talking to, i.e. the
server. If the agent booted a dev server on a remote host, the rewritten
link points at the wrong machine. On by default
(`REWRITE_LOCALHOST_LINKS_DEFAULT = true`).

There is no concept of "expose a port from the host running this thread."

### 1d. Plugin backends run on the server, with server-local powers

`PluginServerApi` hands plugins `loopbackBaseUrl` and
`experimental_dataDir`
([`packages/plugin-sdk/src/backend-contract.ts:1064-1088`](../../packages/plugin-sdk/src/backend-contract.ts))
— both server-local by construction. That is coherent for plugins that only
talk to the server, but it means a plugin has no server-side route to the
workspace except the `host.*` RPC surface.

Where that already bites: the automations plugin spawns scripts
([`plugins/automations/src/script-runner.ts:208-209,298-303`](../../plugins/automations/src/script-runner.ts))
with `cwd` = the plugin's data dir **on the server**, `stdio: ["ignore",
"pipe", "pipe"]`, one script path as the only argv. So an automation script
executes on the server's filesystem, not the host's. (Not chased further:
whether anything passes a workspace path in via `env` — if it does, it's a
path that only resolves when server and host are the same box.)

### 1e. Cosmetic, but same class

`compactPath` in
[`apps/server/src/services/plugins/plugin-service.ts:1025-1032`](../../apps/server/src/services/plugins/plugin-service.ts)
shortens paths against the **server's** `homedir()`. A path from another
host either fails to compact or (worse, if both machines use the same
username) compacts into a lie.

---

## 2. Host daemon ⟷ workspace

Already covered in the research notes §4: git via `execFileAsync("git")`,
`@parcel/watcher` native subscriptions, and `node-pty` terminals are all
local `child_process`/native-fs against `workspacePath`. Not repeated here.

The one thing worth adding: the **server layer above them is clean**. Diff,
commit, file listing, skills, and file suggestions all route through
`host.*` RPC commands, so `workspacePath` is already an opaque string to the
server. The full RPC surface today:

```
host.browse_directory   host.file_metadata      host.list_files      host.mkdir
host.delete_skill       host.inspect_git_source host.list_paths      host.move_path
host.global_skills_status host.install_global_skills host.list_skills host.paths_exist
host.list_branch_options host.list_commands     host.pick_folder     host.read_file
host.read_file_relative  host.remove_path       host.write_file      host.write_skill
```

([`packages/host-daemon-contract/src/commands.ts`](../../packages/host-daemon-contract/src/commands.ts))

---

## 3. Agent process ⟷ daemon: the spawn's *ambient* contract

The container notes established there's no hook to wrap the spawn. The
broader point this survey adds: **wrapping the spawn alone wouldn't be
enough**, because the daemon hands the child three things that only work if
the child shares the daemon's machine.

`prepareRuntimeShellEnv`
([`apps/host-daemon/src/runtime-shell-env.ts:412-433`](../../apps/host-daemon/src/runtime-shell-env.ts)):

```ts
PATH:                prependPath(options.bbExecutableDirectory, inheritedPath)
BB_CLI:              <absolute path to the bb binary on this host>
BB_SERVER_URL:       <server origin>
BB_HOST_DAEMON_PORT: <loopback port on this host>
```

Plus `cwd: workspacePath` and piped stdio
([`packages/agent-runtime/src/runtime-provider-process.ts:495-518`](../../packages/agent-runtime/src/runtime-provider-process.ts)).

So a `docker exec`-style wrapper that put the agent in a *different*
namespace than the daemon would break, in order: the `PATH` entry, the
`BB_CLI` absolute path, and the loopback `BB_HOST_DAEMON_PORT`. Any
"pluggable spawn" design has to decide what happens to all four, not just
`command`/`args`.

---

## 4. The human's machine ⟷ the host

### 4a. Native folder picker runs on the daemon's machine

`host.pick_folder`
([`apps/host-daemon/src/command-handlers/native-folder-picker.ts`](../../apps/host-daemon/src/command-handlers/native-folder-picker.ts),
dispatched at [`command-dispatch.ts:581`](../../apps/host-daemon/src/command-dispatch.ts))
opens a native OS dialog **wherever the daemon runs**. From a browser on a
different machine this is either invisible or a dialog nobody is sitting in
front of. It only makes sense when host == human's machine.

### 4b. Open-in-editor is the one place this was solved — manually

`resolveOpenPathInTargetArgs`
([`apps/host-daemon/src/local-api.ts:141-179`](../../apps/host-daemon/src/local-api.ts))
already distinguishes `{ kind: "local" }` from `{ kind: "remote-ssh" }` and
builds `ssh` args for the remote case
([`packages/local-open-targets/src/terminal.ts`](../../packages/local-open-targets/src/terminal.ts),
`buildRemoteTerminalSshArgs`).

But the mapping is hand-configured per (server origin, host id):

> `No SSH target configured for host ${hostId} on ${serverOrigin}. Run: bb-app client ssh-target set ${serverOrigin} <ssh-target> --host-id ${hostId}`

This is prior art worth noting: it's the only subsystem that has explicitly
modeled "the host is somewhere else," and the shape it landed on was *a
manually declared reachability mapping*. Nothing derives it from the host
record, and nothing else in the app reuses it.

---

## 5. Projects are pinned to a host's filesystem path

The biggest structural one, and not covered by the earlier notes.

[`packages/domain/src/project.ts`](../../packages/domain/src/project.ts):

```ts
const projectSourceTypeValues = ["local_path"] as const;   // union of exactly one

const localPathProjectSourceSchema = baseProjectSourceSchema.extend({
  type: z.literal("local_path"),
  hostId: z.string(),
  path: z.string(),
});
```

Two observations:

- **The shape anticipates this.** It's a discriminated union with one
  member, `findLocalPathProjectSourceForHost(sources, hostId)` exists, and
  `Project.gitRemoteUrl` is already a field. Multi-host projects are
  modeled; the missing piece is a source type that can *materialize*.
- **There is no way to bring a project to a new host.** A freshly booted
  container has no `local_path` source, and nothing clones one. Combined
  with `Environment.hostId` being immutable (research notes §5, finding 3),
  a new host is inert until a human registers a path on it.

This is upstream of everything in §5–§7 of the research notes: ephemeral
`hostType` and cross-host resume don't matter if the project can't exist on
the new host in the first place.

---

## 6. Per-host state nothing keeps in sync

Things that are legitimately host-local, correctly implemented as host-local,
but with no story for a host that appears later:

- **Provider credentials** — `~/.claude/.credentials.json`
  ([`plugins/provider-claude-code/src/bridge/provider-maintenance.ts`](../../plugins/provider-claude-code/src/bridge/provider-maintenance.ts)),
  `~/.codex/auth.json`, `~/.cursor/auth.json`
  ([`packages/provider-bridge-acp/src/bridge/provider-maintenance.ts`](../../packages/provider-bridge-acp/src/bridge/provider-maintenance.ts)).
  The provider's own `signInHint` is literally "Run `codex` on the machine
  to sign in" ([`plugins/provider-codex/server.ts`](../../plugins/provider-codex/server.ts)) —
  a human step, per machine.
- **Global CLI skills** — installed by explicit fan-out over hosts
  ([`apps/server/src/services/skills/global-skill-install.ts:137-175`](../../apps/server/src/services/skills/global-skill-install.ts)),
  reachable only from a `routes/system.ts` endpoint. There is no
  install-on-enroll: a new host has no bb skills until someone re-triggers
  it.
- **MCP servers** — bb doesn't model them at all (no `mcp` references in
  `apps/server/src`, `packages/agent-runtime/src`, or `packages/domain/src`
  outside event passthrough). Whatever the harness reads from
  `~/.claude.json` or a workspace `.mcp.json` is out-of-band config that
  travels with neither the project nor the thread.

---

## 7. Where the abstraction already holds (patterns worth copying)

Not everything leaks. Three places got it right and are the models for
anything new:

1. **Prompt attachments.** The server stores bytes in its own data dir
   ([`apps/server/src/services/projects/attachments.ts`](../../apps/server/src/services/projects/attachments.ts));
   the daemon **fetches them over HTTP and stages them locally**, rewriting
   the path in the prompt before the harness sees it
   ([`apps/host-daemon/src/command-handlers/prompt-attachments.ts:196-245`](../../apps/host-daemon/src/command-handlers/prompt-attachments.ts),
   `stageAttachment` → `fetchProjectAttachment` → `writeFile(stagedPath)`).
   Content moves; paths are minted where they'll be used. This is the
   template.

2. **Model catalog scoping.** `PluginProviderModelCatalogScope` is an
   explicit `"host" | "workspace"` with documented cache semantics for each
   ([`packages/plugin-sdk/src/backend-contract.ts:669,811-830`](../../packages/plugin-sdk/src/backend-contract.ts)).
   A provider declares how far one answer travels rather than bb guessing.

3. **The `host.*` RPC surface** generally — the server does not open files,
   it asks a named host to.

---

## Ranked read on what's actually blocking

1. **Project can't exist on a new host** (§5). Everything else is downstream.
2. **The spawn's ambient contract** (§3) — the real shape of the
   "pluggable execution" problem, bigger than `command`/`args`.
3. **`requirePrimaryHostId` as an implicit default** (§1a/1b) — cheap to
   fix, and every one of those call sites is a wrong answer the moment a
   second host exists.
4. **No port/URL story for a remote host** (§1c) and no reachability model
   beyond the manual ssh-target mapping (§4b).
5. **Per-host bootstrap** (§6) — credentials, skills, MCP. A new host is
   born empty and nothing notices.

---

## Appendix: what was checked and came back clean

Recording the negatives so a later pass doesn't re-run them.

- **Server-side `child_process`.** Only two non-test hits in
  `apps/server/src`: `services/install/bb-app-artifact.ts` and
  `services/skills/registry-skill-install.ts`. Neither touches a workspace.
  The server does not shell out on a host's behalf.
- **Server-side `node:fs`.** ~38 non-test files, all against the server's
  own data dir (plugin artifacts, themes, skills, attachments, config).
  None reach for a workspace path. `services/plugins/plugin-service.ts` is
  the one exception and it's cosmetic (§1e).
- **Diff / commit / PR, file listing, file suggestions.** Confirmed routed
  through `host.*` RPC — `apps/server/src/services/environments/workspace-command-target.ts`
  treats `workspacePath` as an opaque string.
- **Prompt attachments.** Traced end to end. Server stores under
  `dataDir/attachments/<projectId>/`; daemon fetches over HTTP via
  `serverClient.fetchProjectAttachment` (wired in
  [`apps/host-daemon/src/app.ts:747-750`](../../apps/host-daemon/src/app.ts))
  and stages locally with the path rewritten. **Not a leak** — this is §7's
  template.
- **`bb` CLI.** Talks to the server over HTTP (`createCliBbSdk(baseUrl)`,
  [`apps/cli/src/client.ts`](../../apps/cli/src/client.ts)); `BB_SERVER_URL`
  comes from CLI config. No local-server assumption baked in.
- **Provider credential reads.** All in `bridge/` or `host.ts` — i.e.
  daemon-side, reading the daemon's `os.homedir()`. Correct placement. The
  full `homedir()` sweep across `apps/*/src`, `packages/*/src`,
  `plugins/*/src` turned up nothing misplaced except §1e.
- **Model catalogs.** Explicitly host-scoped via
  `PluginProviderModelCatalogScope`, with documented cache semantics. Not a
  leak; it's §7's second good example.
- **Terminals.** Keyed off environments (which carry `hostId`);
  `apps/server/src/routes/terminals.ts` never touches a host directly.
  `node-pty` locality is a §2 concern, not a routing one.
- **MCP servers.** bb doesn't model them. Grepping `apps/server/src`,
  `packages/agent-runtime/src`, and `packages/domain/src` finds `mcp` only
  in `internal/events.ts`, `thread-event-scope.ts`, and `provider-event.ts`
  — event passthrough. Whatever the harness reads from `~/.claude.json` or
  a workspace `.mcp.json` is out-of-band. Noted in §6 as a gap, but there
  is no bb-side code to fix.

## Appendix: not chased

- Whether the automations plugin passes a workspace path to scripts via
  `env` (§1d). The `cwd` and argv are server-local; `env` wasn't traced.
- What the daemon inherits into `shellEnv` beyond the four variables in §3
  — whether it sources a login shell, and what that implies for a container
  that has no user shell configured.
- Whether anything installs global CLI skills on host *enrolment*. Only
  caller found is a `routes/system.ts` endpoint, so the read is "no," but
  a connect-time hook elsewhere would falsify it.
- The app UI itself. This survey stayed in `apps/server`, `apps/host-daemon`,
  `packages/*`, and `plugins/*`. Which surfaces let a human pick a host, and
  which silently assume one, is unexamined.
