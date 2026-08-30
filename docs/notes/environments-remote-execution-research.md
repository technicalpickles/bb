# Research notes: environments and remote/sandboxed execution

Raw findings from a research pass through the codebase, prompted by a Discord
discussion (#containers, started by technicalpickles 2026-08-23) about
running agents in containers/VMs/cloud sandboxes. Sawyer's framing: "we have
the concept of an 'environment' in code and this is something that should be
pluggable." These notes check that claim against the actual implementation.

Not a proposal — just what we established, with file:line evidence, so it
doesn't need to be re-derived. See
[system-overview.md](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/docs/system-overview.md)
for the canonical component/data-model definitions this builds on.

Links below are permalinks pinned to commit
[`389329a`](https://github.com/technicalpickles/bb/commit/389329a2cf938d4463be3e2f84af3c344e5f5bca)
so line numbers stay correct as the branch moves.

## 1. What "Environment" actually is today

`Environment`
([`packages/domain/src/environment.ts:71-89`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/environment.ts#L71-L89))
binds a workspace directory to a **host**, nothing more. The only "kind" axis
is `workspaceProvisionType`
([`packages/domain/src/environment.ts:13-17`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/environment.ts#L13-L17)):

```ts
// packages/domain/src/environment.ts:13-17
const WORKSPACE_PROVISION_TYPES = [
  "unmanaged",
  "managed-worktree",
  "personal",
] as const;
```

This describes *how the workspace directory came to exist* (point at an
existing dir / bb-created git worktree / scratch dir under the host's data
dir) — not an execution backend. There is no `Runtime`/`Environment`
interface with swappable Docker/VM/cloud implementations anywhere in the
code.

"Running elsewhere" today means enrolling another **machine** — a durable
host you provision yourself and install the bb host daemon onto (VM,
container, cloud box, whatever) — not a bb-managed ephemeral sandbox. See
[multiple-devices.md](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/docs/multiple-devices.md),
"Add an execution machine." Selection is by host (`bb thread spawn --machine
<id>`), not by runtime type; there's no config knob for "docker vs vm vs
local" because those aren't distinct choices in the system.

## 2. Environment → harness process relationship

- **One `AgentRuntime` per Environment**, keyed only by `environmentId`
  ([`apps/host-daemon/src/runtime-manager.ts:310`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/runtime-manager.ts#L310),
  [`:973`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/runtime-manager.ts#L973)
  `ensureEnvironment`). No thread- or provider-level key at this layer.
- **The harness is a plain local child process.** `createAgentRuntime`
  ([`packages/agent-runtime/src/runtime.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime.ts))
  builds a `RuntimeProviderProcessManager`
  ([`packages/agent-runtime/src/runtime-provider-process.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime-provider-process.ts))
  with `workspacePath` as `cwd`. `spawnProvider`
  ([`packages/agent-runtime/src/runtime-provider-process.ts:495-518`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime-provider-process.ts#L495-L518))
  calls `spawnPortablePipedProcess` → a plain `crossSpawn(command, args,
  {cwd, detached, env})`
  ([`packages/process-utils/src/index.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/process-utils/src/index.ts)).
  **No sandboxing anywhere** — grepped for
  bubblewrap/seccomp/chroot/nsjail/container, zero hits. `detached` is only
  for process-group signal cleanup.
- **Provider (which harness — Claude Code, Codex, Pi, ACP) is a per-thread
  property**, not an environment property: `providerId` lives on `Thread`
  ([`packages/domain/src/thread.ts:369`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/thread.ts#L369)),
  resolved per-spawn via `resolveProviderProcessKey`
  ([`packages/agent-runtime/src/runtime.ts:418-437`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime.ts#L418-L437)).
  An environment is provider-agnostic.
- **Process sharing**: threads using the same provider in the same
  environment normally share one running harness process, distinguished by
  thread/session state inside the bridge protocol. Codex is a deliberate
  exception — one process per thread
  ([`packages/agent-runtime/src/runtime.ts:410-416`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime.ts#L410-L416),
  comment: "Codex runs one provider process per thread").
- **Lifecycle**: provisioning an environment only creates the workspace dir
  + the `AgentRuntime` object — no process spawns yet. The harness process
  starts lazily on the first `startThread`/turn for that provider. Teardown
  is idle-timeout reaping (`reapIdleProviderSessions`) or full
  `destroyEnvironment` → `runtime.shutdown()` + `workspace.destroy()` +
  `killManagedWorkspaceProcesses` sweep.

**Implication**: the pluggability point Sawyer pointed at isn't
`Environment`/`workspaceProvisionType` — that's just workspace-directory
provenance. It's the spawn call inside `RuntimeProviderProcessManager`,
which hardcodes "local `crossSpawn`."

## 3. Sandbox provider mapping (Daytona, E2B, Modal, EC2, Vercel Sandbox,
   Runloop, Blaxel, Novita, Beam, plus LangSmith/Hyperbrowser/Tensorlake
   from the Harbor Framework list)

These split into different integration shapes, not one:

- **"Just enroll it as a Host" (EC2 and similar raw VMs)** — this already
  fits bb's existing model almost as-is: an enrolled host running its own
  daemon, spawning locally. No transport change needed, only lifecycle
  automation (provision the instance, bootstrap-install the daemon via
  cloud-init, enroll, tear down).
- **"Sandbox-as-a-service" (Daytona, E2B, Vercel Sandbox, Runloop, Blaxel,
  Novita)** — create an ephemeral microVM/container via API, get a handle,
  interact via an exec/session API or an exposed port — never a local
  `ChildProcess` with piped stdio the way `spawnPortablePipedProcess`
  expects.
- **Key insight**: if a sandbox provider supports a long-lived background
  process with an exposed port (true for all of the above, as far as we
  know), you don't need to reimplement git/watcher/PTY as remote
  operations at all — **run bb's own host daemon *inside* the sandbox**,
  pointed back at the server over the sandbox's exposed URL. This collapses
  the "sandbox-as-a-service" bucket into the same "it's just a Host" shape
  as EC2. The only genuinely per-provider work becomes a `HostProvisioner`-
  shaped interface (create / bootstrap-the-daemon / destroy), not a new
  execution transport inside
  [`agent-runtime`](https://github.com/technicalpickles/bb/tree/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime).
- **Modal, Beam** — recalled (not verified against live docs — egress to
  daytona.io and e2b.dev was blocked in this session, so nothing below was
  checked against current docs) as having exec APIs closer to a real
  process stream than Daytona/E2B's discrete exec calls. Possibly less
  protocol massaging needed if not using the "run bb-daemon inside it"
  shortcut, but this needs verification.
- **Not an execution backend at all**: LangSmith (tracing/eval platform —
  would integrate as a trace exporter off `AgentRuntime`'s event stream, not
  as a place to run the harness), Hyperbrowser (hosted headless browsers —
  a tool an agent calls, not somewhere to run the harness process),
  Tensorlake (document/workflow processing, as far as we know). These
  belong to a different design question ("what tools can an agent call")
  than "where does the harness run."

## 4. `workspacePath` local-filesystem audit

Grepped 91 files referencing `workspacePath`/`workspace.path`. The good
news: **the server layer is already opaque passthrough.** Diff/commit/PR
([`apps/server/src/services/environments/workspace-command-target.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/environments/workspace-command-target.ts)),
skills/file-suggestions (routed through `host.read_file`/`host.list_files`
RPC commands), and
[`workspace-provision-target.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/workspace-provision-target.ts)/[`workspace-resolution.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/workspace-resolution.ts)
all treat `workspacePath` as a plain string routed through daemon RPC — no
server-wide changes needed for a remote-sandbox backend.

The hard blockers are daemon-internal, all local `child_process`/native-fs
dependencies, same category as the harness-spawn problem:

1. **Git**
   ([`packages/host-workspace/src/git.ts:271`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/git.ts#L271),
   [`:354`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/git.ts#L354),
   [`:544`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/git.ts#L544)) —
   `execFileAsync("git", ...)`/`spawn("git", ...)`/`spawn("/bin/sh", ...)`
   all with `cwd: workspacePath`. Plus the `.bb-env-setup.sh` provisioning
   script
   ([`packages/host-workspace/src/provisioning.ts:579`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/provisioning.ts#L579))
   and `fs.rm` on worktree removal
   ([`packages/host-workspace/src/provisioning.ts:780`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/provisioning.ts#L780)).
2. **File watching**
   ([`packages/host-watcher`](https://github.com/technicalpickles/bb/tree/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-watcher)) —
   a native `@parcel/watcher` (inotify/FSEvents) subscription
   ([`parcel-watcher-backend.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-watcher/src/parcel-watcher-backend.ts),
   [`parcel-host-watcher.ts:127`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-watcher/src/parcel-host-watcher.ts#L127),
   [`:196`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-watcher/src/parcel-host-watcher.ts#L196)).
   **No generic remote equivalent exists** — this is the hardest of the
   three; needs either polling or an agent running inside the sandbox that
   relays fs events back.
3. **Terminals**
   ([`apps/host-daemon/src/terminals/terminal-manager.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/terminals/terminal-manager.ts)) —
   `node-pty`, inherently local
   ([`terminal-manager.ts:204`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/terminals/terminal-manager.ts#L204),
   [`:407`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/terminals/terminal-manager.ts#L407)).

**This reinforces the "run bb-daemon inside the sandbox" shortcut from §3**:
rather than rewriting git/watcher/PTY as three separate remote-transport
reimplementations (repeated per provider), running bb's own daemon inside
the sandbox means all three keep working completely unchanged, because
they're local to wherever the daemon process is.

## 5. Host churn / ephemeral-host readiness

Evaluated whether bb could support ~5 short-lived sandbox hosts per project
(minutes-to-hours lifetime, frequent churn) vs. the "durable laptop +
desktop" scenario the docs assume.

**What works:**
- Enrollment is scriptable end-to-end:
  [`apps/server/src/assets/install-machine.sh`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh)
  takes `--join-code`/`--host-id`/`--server` and can run non-interactively
  at sandbox boot.
- Disconnect handling for transient blips is solid: 5s grace window before
  interrupting pending interactions (`DAEMON_DISCONNECT_GRACE_MS`), 30s
  grace window before interrupting active thread runs
  (`DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS`,
  [`apps/server/src/constants.ts:1-4`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/constants.ts#L1-L4)),
  handled in `handleDaemonSocketClosed`
  ([`apps/server/src/internal/session-owner-side-effects.ts:134-176`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/internal/session-owner-side-effects.ts#L134-L176)).

**What doesn't, structurally:**
1. **No ephemeral host type exists.** `hostType` has exactly one legal
   value: `["persistent"] as const`
   ([`packages/domain/src/host.ts:4`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/host.ts#L4)).
2. **A dead host doesn't clean up its environments.** `DELETE /hosts/:id`
   ([`apps/server/src/routes/hosts.ts:191-220`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/routes/hosts.ts#L191-L220))
   revokes auth and closes the session but never touches the `environments`
   table. Orphan-recovery logic (`recoverOrphanedEnvironmentDestroyRequests`,
   [`apps/server/src/services/environments/environment-cleanup-internal.ts:295-321`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/environments/environment-cleanup-internal.ts#L295-L321))
   only fires for environments already mid-`destroying`, and only after 24h
   of staleness. A sandbox that's just killed (not gracefully destroyed)
   leaves its `Environment` rows stuck at `ready`, pointing at a dead
   `hostId`, indefinitely.
3. **`Environment.hostId` is immutable** — set at creation, never updated
   anywhere in
   [`packages/db/src/data/environments.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/db/src/data/environments.ts).
   No re-provision/migration path if a host disappears.
4. **The auto-update path can permanently strand a bare sandbox process.**
   On protocol-version mismatch, the daemon downloads the update then calls
   `shutdown("self-update")`, which **fully exits the process**
   ([`apps/host-daemon/src/daemon.ts:38-43`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/daemon.ts#L38-L43)),
   expecting a service manager (systemd/launchd) to restart it
   ([docs/multiple-devices.md:166-168](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/docs/multiple-devices.md#L166-L168)
   confirms this is the intended design). A bare sandbox process with no
   supervisor just dies if it boots from an image with a stale daemon
   binary.
5. **Enrollment credentials don't scale to bursty creation.** Join codes
   are single-use, 15-minute TTL, mintable only from an owner-authenticated
   session (`ENROLL_KEY_TTL_SECONDS`,
   [`apps/server/src/services/machine-auth.ts:15`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/machine-auth.ts#L15),
   [`:391-399`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/machine-auth.ts#L391-L399)) —
   no bulk or long-lived API-token enrollment path.
6. Settings UI
   ([`MachinesSettingsSection.tsx`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/app/src/components/settings/MachinesSettingsSection.tsx))
   fetches the full unpaginated host list with no search/filter/pagination —
   built for a short, human-curated list.

**Bottom line**: an orchestrator that mints a fresh join code and installs
the latest daemon (never a stale baked image) at every boot, runs the
daemon under a real process supervisor, and explicitly calls
`DELETE /hosts/:id` on every teardown, could probably make 5 concurrent
ephemeral sandboxes work today — but entirely by the orchestrator's own
discipline. bb itself doesn't know these hosts are ephemeral, so nothing
self-heals if a step is skipped. **The single biggest structural gap: no
ephemeral `hostType` and no cascade-cleanup when a host disappears** — a
separate, and probably harder, piece of work than making harness execution
pluggable (§2–§3).

## 6. Concrete spike: one bb host daemon in a single, disposable Docker container

Narrowed scope, chosen deliberately simpler than §3/§5: no server-side
changes, no new `hostType`, no provider SDK — just "can today's enrollment
flow run cleanly inside one throwaway container, with the container's own
lifecycle (`docker run` / `docker rm`) as the cleanup." Based on reading
[`apps/server/src/assets/install-machine.sh`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh)
in full (this is the actual script the app tells a human to run — see §1's
"Add an execution machine" in
[multiple-devices.md](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/docs/multiple-devices.md)):

**The script already has a container-shaped path.** Setting
`BB_INSTALL_SKIP_SERVICE=1` makes it skip the systemd/launchd persistent-
service installation entirely and exit right after the daemon joins,
*leaving the temporary joined daemon process running* (the code comment
calls this out directly: "Tests and source-development smoke runs can leave
the enrolled daemon in the foreground-supervised process without modifying
the user's service manager" —
[`install-machine.sh:581-582`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L581-L582)).
That's exactly the shape a disposable container wants: no init system, no
service manager, the daemon just runs as (or under) the container's main
process and `docker stop`/`docker rm` is the teardown — no separate
"uninstall" step to run inside the container.

Concrete recipe implied by the script:

```dockerfile
FROM node:22-bookworm-slim   # >=22.19 required (install-machine.sh:138); avoid alpine — see caveat below
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git && rm -rf /var/lib/apt/lists/*
```
Then, at `docker run` time (not baked into the image, since join codes are
single-use and minted per-host — see §5):

```bash
docker run --rm \
  -e BB_INSTALL_SKIP_SERVICE=1 \
  bb-sandbox-host \
  sh install-machine.sh --join-code "$CODE" --host-id "$HOST_ID" --server "$SERVER_URL"
```

Caveats surfaced by actually reading the script, not assumed:

- The native addons (`better-sqlite3`, `node-pty`, `@parcel/watcher`) are
  the single hard-failure check in the whole script
  ([`install-machine.sh:436-448`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L436-L448):
  "npm installed bb-app, but its native add-ons... did not load"). It also
  explicitly passes
  `--allow-scripts=better-sqlite3,node-pty,@parcel/watcher` to npm because
  "npm >= 12 blocks dependency install scripts by default for global
  installs"
  ([`install-machine.sh:184-190`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L184-L190)) —
  any container recipe must carry that same flag.
- Data dir defaults to `$HOME/.bb-machines/<server-host>`
  ([`install-machine.sh:174`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L174)),
  overridable via `BB_DATA_DIR` — fine as in-container ephemeral state, no
  volume needed for a fully disposable container.
- Platform check only accepts `Darwin`/`Linux`
  ([`install-machine.sh:128-135`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L128-L135)) —
  a Linux container image is required, which is the natural choice anyway.
- The script downloads bb's own build from `${server_url}/install/bb-app.tgz`
  at run time
  ([`install-machine.sh:375`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/assets/install-machine.sh#L375))
  rather than the image baking in a pinned bb-app version — this means the
  container always gets the currently-running server's build, which is
  actually convenient (no image rebuild needed when bb ships a new version)
  but means the container needs network access to the bb server, not just
  to npm's registry.

**What we could not verify in this session**: whether
`better-sqlite3`/`node-pty`/`@parcel/watcher` install cleanly (prebuilt
binaries, no compiler needed) on a plain `node:22-bookworm-slim` image.
Attempted to actually test this by pulling the base image and running the
npm install inside a container — this session's egress policy blocks
`production.cloudfront.docker.com` (the CDN Docker Hub redirects blob pulls
to), confirmed via the proxy status endpoint (`connect_rejected`, "gateway
answered 403... policy denial"), not a transient failure. This needs to be
tried in an environment with real Docker Hub access before relying on it —
if any of the three lack prebuilt musl/glibc binaries for the target image,
the `apt-get install` line above would need `python3 make g++` added for a
source build, which is where alpine (musl libc) is the most likely to need
that fallback specifically because of `@parcel/watcher`'s history of
native-binding platform gaps.

**Cleanup beyond `docker rm`**: per §5 finding #2, the container disappearing
does *not* clean up the corresponding `Environment` row on the server side —
`docker rm` handles the compute, but the teardown script still needs to call
`DELETE /hosts/:id` (or the equivalent `bb machine` command) explicitly, or
the environment row is left dangling exactly as described there.

## 7. Thread durability / resuming on a different host

Separate concern from provisioning or host churn: if a container dies
mid-thread, can that thread be "respun" in a brand new container, and what
would actually survive?

**Durable, server-side, host-independent:** the `Thread`'s append-only event
stream (every message, tool call, turn boundary) lives in the server's
SQLite DB. The pointer to the provider's last session (`providerThreadId`)
is reconstructable purely from that log — `getLastProviderThreadId`
([`apps/server/src/services/threads/thread-events.ts:962-967`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/threads/thread-events.ts#L962-L967))
reads it back with no host round-trip.

**Host/container-local only, never reaches the server** — each harness
keeps its actual session *content* as local files on whichever host last
ran it, not in bb's event log:

- **Claude Code** — Agent SDK's own local session storage, addressed by
  `resume: resumeSessionId`
  ([`plugins/provider-claude-code/src/bridge/sdk-session.ts:300`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/plugins/provider-claude-code/src/bridge/sdk-session.ts#L300)).
- **Codex** — rollout files on local disk. The code's own comment: "bb
  releases idle sessions and later resumes by provider thread id, so the
  rollout must exist on disk... Codex rollouts persist on disk, so every
  session is restorable"
  ([`plugins/provider-codex/src/bridge/bridge.ts:586`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/plugins/provider-codex/src/bridge/bridge.ts#L586),
  [`:1021-1024`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/plugins/provider-codex/src/bridge/bridge.ts#L1021-L1024))
  — restorable only as long as that disk still exists.
- **pi** — literal path `~/.bb/pi-bridge-sessions/<threadId>.jsonl`
  ([`packages/agent-runtime/src/pi/bridge/session-paths.ts:14-32`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/pi/bridge/session-paths.ts#L14-L32)),
  keyed by the provider's own identity on that specific host.
- **ACP** — depends entirely on the wrapped agent's own `session/resume`
  support and whatever local state it keeps.

bb transmits the *coordinates* (provider thread id + `cwd`) needed to look
a session up — never the session content itself.

**Existing resume mechanism assumes the same host/workspace.**
`runtime-thread-rewind.test.ts` is a different feature entirely (forking a
provider session at an earlier checkpoint when a user edits a past message,
gated by `ProviderFork` capability —
[`packages/domain/src/provider-fork.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/provider-fork.ts)).
The actual "restart a provider process and resume its prior session" path
is `AgentRuntime.resumeThread`
([`packages/agent-runtime/src/runtime.ts:1779-1911`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime.ts#L1779-L1911)),
which sends a `thread/resume` bridge command hardcoding the environment's
live `workspacePath`
([`runtime.ts:1859`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/agent-runtime/src/runtime.ts#L1859)).
It does not re-provision anything — it assumes the workspace directory, and
the provider's local session file, are already sitting at that exact path on
that host. Called both for idle-session revival and by
`resumeThreadRuntimeIfMissing`
([`apps/host-daemon/src/command-handlers/thread.ts:174-210`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/host-daemon/src/command-handlers/thread.ts#L174-L210))
after a daemon restart — always same-host.

**No "host is gone" thread state, and no cross-host reassignment exists.**
`ThreadStatus` is only `["idle", "starting", "active", "stopping", "error"]`
([`packages/domain/src/thread-status.ts:3-9`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/domain/src/thread-status.ts#L3-L9))
— a disconnected host's active threads just get marked interrupted via
`interruptActiveThreads`
([`apps/server/src/internal/session-owner-side-effects.ts:134-176`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/internal/session-owner-side-effects.ts#L134-L176),
[`apps/server/src/services/threads/thread-lifecycle.ts:1578`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/apps/server/src/services/threads/thread-lifecycle.ts#L1578)),
indistinguishable from any other interruption. `Environment.hostId` stays
immutable; nothing repoints an existing thread at a freshly created
environment/host after its old one disappears.

**Uncommitted workspace changes are simply gone.** No snapshot, stash, or
auto-commit mechanism exists in
[`packages/host-workspace`](https://github.com/technicalpickles/bb/tree/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace)
— grepped
[`workspace.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/workspace.ts)/[`provisioning.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/provisioning.ts)/[`git.ts`](https://github.com/technicalpickles/bb/blob/389329a2cf938d4463be3e2f84af3c344e5f5bca/packages/host-workspace/src/git.ts),
no hits. Environment destroy proceeds unconditionally regardless of a dirty
working tree.

**Assessment:** respinning a dead container's thread today would preserve
the full bb-level transcript (readable, could be handed to a fresh session
as context) but get a provider CLI with amnesia rather than a true
continuation — no code path exists to reconstruct or transmit a harness's
own session content across hosts — plus total loss of anything uncommitted.
The structural gap isn't really the session-content loss (a fresh session
could plausibly be re-seeded from bb's own transcript with enough new
tooling); it's that **nothing in the system treats "resume on a different
host" as a first-class operation at all** — resume is implicitly
same-host-reconnects, full stop. This is a separate problem from
provisioning (§3, §6) and host churn (§5): even with a working
`HostProvisioner` and a real ephemeral `hostType`, a thread whose host died
mid-turn still has nowhere to resume *to* without new plumbing here.

## Open threads / not yet investigated

- **Native addon install on a plain Debian-slim Node image** — the one
  concrete unknown left from §6. Needs a session/machine with real Docker
  Hub access (this session's egress policy blocks the CDN host Docker Hub
  blob pulls redirect to).
- Whether Modal/Beam's exec APIs are actually closer to a real bidirectional
  pipe than Daytona/E2B's (would reduce the need for the
  "run bb-daemon inside the sandbox" indirection for those two
  specifically) — needs live docs, blocked by egress in this session.
- Whether any Bucket-B sandbox provider's "ephemeral"/cheapest tier
  explicitly *disallows* long-lived background processes or exposed ports
  (some code-interpreter-style products are one-shot-exec only) — this
  would break the "run bb-daemon inside it" shortcut for that provider and
  force the harder per-subsystem remote-transport route instead.
- Actual cost/latency of the daemon self-update flow (npm install of a
  tarball) — relevant to how painful "always install fresh at boot" is for
  fast-churning sandboxes.
- No design work yet on what an ephemeral `hostType` would actually need:
  cascade-delete semantics for environments/threads on host loss, whether
  `Environment.hostId` becoming mutable is required or whether
  environments should just be recreated, and how this interacts with
  `bb machine` CLI/UI surfaces.
- No design work on cross-host thread resume (§7): what a "reseed a
  provider's session from bb's own event log" fallback would need per
  provider, whether that's even desirable vs. always starting fresh
  post-migration, and whether an ephemeral `hostType` should require
  committing/pushing before a host is allowed to be torn down (closing the
  uncommitted-changes gap) rather than solving true mid-session
  portability.
