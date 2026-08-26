# Research notes: environments and remote/sandboxed execution

Raw findings from a research pass through the codebase, prompted by a Discord
discussion (#containers, started by technicalpickles 2026-08-23) about
running agents in containers/VMs/cloud sandboxes. Sawyer's framing: "we have
the concept of an 'environment' in code and this is something that should be
pluggable." These notes check that claim against the actual implementation.

Not a proposal — just what we established, with file:line evidence, so it
doesn't need to be re-derived. See [system-overview.md](system-overview.md)
for the canonical component/data-model definitions this builds on.

## 1. What "Environment" actually is today

`Environment` (`packages/domain/src/environment.ts:71-89`) binds a workspace
directory to a **host**, nothing more. The only "kind" axis is
`workspaceProvisionType`:

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
[multiple-devices.md](multiple-devices.md), "Add an execution machine."
Selection is by host (`bb thread spawn --machine <id>`), not by runtime
type; there's no config knob for "docker vs vm vs local" because those
aren't distinct choices in the system.

## 2. Environment → harness process relationship

- **One `AgentRuntime` per Environment**, keyed only by `environmentId`
  (`apps/host-daemon/src/runtime-manager.ts:310`, `:973`
  `ensureEnvironment`). No thread- or provider-level key at this layer.
- **The harness is a plain local child process.** `createAgentRuntime`
  (`packages/agent-runtime/src/runtime.ts`) builds a
  `RuntimeProviderProcessManager` with `workspacePath` as `cwd`.
  `spawnProvider` (`packages/agent-runtime/src/runtime-provider-process.ts:495-518`)
  calls `spawnPortablePipedProcess` → a plain `crossSpawn(command, args,
  {cwd, detached, env})` (`packages/process-utils/src/index.ts`). **No
  sandboxing anywhere** — grepped for bubblewrap/seccomp/chroot/nsjail/
  container, zero hits. `detached` is only for process-group signal cleanup.
- **Provider (which harness — Claude Code, Codex, Pi, ACP) is a per-thread
  property**, not an environment property: `providerId` lives on `Thread`
  (`packages/domain/src/thread.ts:369`), resolved per-spawn via
  `resolveProviderProcessKey` (`runtime.ts:418-437`). An environment is
  provider-agnostic.
- **Process sharing**: threads using the same provider in the same
  environment normally share one running harness process, distinguished by
  thread/session state inside the bridge protocol. Codex is a deliberate
  exception — one process per thread (`runtime.ts:410-416`, comment: "Codex
  runs one provider process per thread").
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
  execution transport inside `agent-runtime`.
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
(`apps/server/src/services/environments/workspace-command-target.ts`),
skills/file-suggestions (routed through `host.read_file`/`host.list_files`
RPC commands), and `workspace-provision-target.ts`/`workspace-resolution.ts`
all treat `workspacePath` as a plain string routed through daemon RPC — no
server-wide changes needed for a remote-sandbox backend.

The hard blockers are daemon-internal, all local `child_process`/native-fs
dependencies, same category as the harness-spawn problem:

1. **Git** (`packages/host-workspace/src/git.ts:271,354,544`) —
   `execFileAsync("git", ...)`/`spawn("git", ...)`/`spawn("/bin/sh", ...)`
   all with `cwd: workspacePath`. Plus the `.bb-env-setup.sh` provisioning
   script (`provisioning.ts:579`) and `fs.rm` on worktree removal
   (`provisioning.ts:780`).
2. **File watching** (`packages/host-watcher`) — a native `@parcel/watcher`
   (inotify/FSEvents) subscription (`parcel-watcher-backend.ts`,
   `parcel-host-watcher.ts:127,196`). **No generic remote equivalent
   exists** — this is the hardest of the three; needs either polling or an
   agent running inside the sandbox that relays fs events back.
3. **Terminals** (`apps/host-daemon/src/terminals/terminal-manager.ts`) —
   `node-pty`, inherently local (`terminal-manager.ts:204,407`).

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
  `apps/server/src/assets/install-machine.sh` takes
  `--join-code`/`--host-id`/`--server` and can run non-interactively at
  sandbox boot.
- Disconnect handling for transient blips is solid: 5s grace window before
  interrupting pending interactions
  (`DAEMON_DISCONNECT_GRACE_MS`), 30s grace window before interrupting
  active thread runs (`DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS`,
  `apps/server/src/constants.ts:1-4`), handled in
  `handleDaemonSocketClosed`
  (`apps/server/src/internal/session-owner-side-effects.ts:134-176`).

**What doesn't, structurally:**
1. **No ephemeral host type exists.** `hostType` has exactly one legal
   value: `["persistent"] as const` (`packages/domain/src/host.ts:4`).
2. **A dead host doesn't clean up its environments.** `DELETE /hosts/:id`
   (`apps/server/src/routes/hosts.ts:191-220`) revokes auth and closes the
   session but never touches the `environments` table. Orphan-recovery
   logic (`recoverOrphanedEnvironmentDestroyRequests`,
   `apps/server/src/services/environments/environment-cleanup-internal.ts:295-321`)
   only fires for environments already mid-`destroying`, and only after 24h
   of staleness. A sandbox that's just killed (not gracefully destroyed)
   leaves its `Environment` rows stuck at `ready`, pointing at a dead
   `hostId`, indefinitely.
3. **`Environment.hostId` is immutable** — set at creation, never updated
   anywhere in `packages/db/src/data/environments.ts`. No re-provision/
   migration path if a host disappears.
4. **The auto-update path can permanently strand a bare sandbox process.**
   On protocol-version mismatch, the daemon downloads the update then calls
   `shutdown("self-update")`, which **fully exits the process**
   (`apps/host-daemon/src/daemon.ts:38-43`), expecting a service manager
   (systemd/launchd) to restart it
   (docs/multiple-devices.md:166-168 confirms this is the intended design).
   A bare sandbox process with no supervisor just dies if it boots from an
   image with a stale daemon binary.
5. **Enrollment credentials don't scale to bursty creation.** Join codes
   are single-use, 15-minute TTL, mintable only from an owner-authenticated
   session (`ENROLL_KEY_TTL_SECONDS`,
   `apps/server/src/services/machine-auth.ts:15,391-399`) — no bulk or
   long-lived API-token enrollment path.
6. Settings UI (`MachinesSettingsSection.tsx`) fetches the full unpaginated
   host list with no search/filter/pagination — built for a short,
   human-curated list.

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

## Open threads / not yet investigated

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
