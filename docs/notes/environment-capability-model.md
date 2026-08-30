# Environment capability model (working draft)

Where the container/remote-environments design has landed as of 2026-08-30.
Not approved, not a spec — the shape we converged on after the survey and
the container spike, written down so the next pass argues with it instead of
rebuilding it.

Inputs:
[host-locality-leaks-survey.md](host-locality-leaks-survey.md) (with its
2026-08-30 corrections),
[environments-remote-execution-research.md](environments-remote-execution-research.md)
§8 (the spike),
[container-and-remote-environments.md](container-and-remote-environments.md).

## The premise that changed

The Discord framing was "environments should be pluggable," and the research
showed `Environment` is not that thing — it binds a workspace directory to a
host and nothing more.

The design does not add a new pluggable `Environment`. **A runtime declares
what it can do, and bb adapts.** Every question we tried to answer globally
("do we mount volumes or snapshot state?", "daemon inside or outside?")
turned out to be a per-runtime answer wearing a global disguise.

Two topologies, named for what actually distinguishes them:

- **Daemon alongside** — the daemon and the agent share one execution
  environment. Git, watcher, PTY, and the spawn contract all keep working
  untouched. Spike-verified: 39s from `docker run` to `connected`.
- **Daemon across** — daemon on one side of a boundary, agent on the other.
  Cheaper per environment (one daemon, many workspaces; credentials in one
  place) but re-plumbs the spawn's ambient contract and forces a
  side-of-the-boundary decision for git, watcher, and PTY.

Current lean is **alongside**, because the spike showed its cost is low and
because every motivation (isolation, capacity, reproducible toolchain,
detached/always-on) is satisfiable there. Across is not ruled out; it is a
runtime that declares different capabilities.

## The axes

Revised 2026-08-30 after the Daytona pass (below), which showed the first
durability scale was too coarse and that two axes were missing entirely.

| Axis | Values | What exists today |
|---|---|---|
| **Process hosting** | `long-lived` · `oneshot` | The gate between alongside and across. Anything that can run a process supports alongside — bb's daemon dials *out*, so inbound reachability is not required. |
| **State durability** | `none` · `filesystem` · `filesystem-offloaded` · `process` | **Nothing.** `hostTypeValues = ["persistent"] as const` — one value, and it is *named* persistent. |
| **Durable artifacts** | `snapshots` · `volumes` · none | **Nothing.** Things that outlive the machine itself and can seed a new one. |
| **Persistence provider** | `self-managed` · `service-managed` | **Nothing.** Qualifies state durability: same capability, very different burden. Docker gives nothing unless you build it; a service may hand you the whole thing behind an API call. |
| **Workspace materialization** | `inherited` · `cloned` · `preexisting` | `project.clone` exists (`POST /projects/:id/sources`, `type: "clone"`) but is a manual call, never part of provisioning. No canonical-path convention. |
| **Credential acquisition** | `inherited` · `injected` · `interactive` | **Nothing.** Binaries: `bb machine provider-cli install` works remotely, 11s. Credentials: `~/.codex/auth.json` never appears; the provider hint is literally "Run `codex` on the machine to sign in." |
| **Interactive surfaces** | `terminal` · `port-exposure` · `editor-reach` | Terminal: works, costs +357MB for `node-pty` (§8a), so opt-in. Port exposure: `bb.hosts.declareSharedPorts` exists — but a runtime may bring its own, and then they compete. Editor: `remote-ssh` context exists, mapping hand-declared. |
| **Lifecycle ownership** | `bb` · `external` · `human` | Human only. Decides whether bb needs to hold cloud credentials. |
| **Lifecycle autonomy** | `none` · `idle-stop` · `idle-destroy` | **Nothing, and bb actively assumes `none`.** A runtime that stops the machine on its own timer is indistinguishable from a crash today. |

### The durability scale, concretely

- **`none`** — bare container. Nothing survives. Docker with no volume.
- **`filesystem`** — files survive a stop. Docker + named volume, EBS,
  Daytona `stop`.
- **`filesystem-offloaded`** — survives cheaply, slow to restore. Daytona
  `archive`.
- **`process`** — memory and running processes survive. Daytona `pause` on
  VM sandboxes. **This tier makes all of bb's state-portability machinery
  unnecessary**, because nothing ever stopped.

### Why "persistent volume vs snapshot" was never a design decision

An earlier draft recommended "container ephemeral, named volume durable" as
the primary approach, with snapshot/restore as an escalation. That was a
Docker mechanism promoted to an architecture.

It is one value on one axis. `filesystem` → reattach storage, no
per-provider work. `none` → snapshot and restore. `process` → neither. The
resume strategy is a *function of the declaration*, not a choice bb makes
once for everybody.

### The empty axes

Five of nine have some machinery. The four that are genuinely empty:
**state durability**, **durable artifacts**, **persistence provider**, and
**lifecycle autonomy** — plus **credential acquisition**, which has the
binary half solved and the credential half untouched.

Note what that list has in common: they are all about *the machine's
lifetime*, which is exactly the thing `hostType` was built to not have.

## Full-fidelity resume: reachable, and the unlock is path identity

Target behavior is what a user expects: a thread survives its machine dying.
Both harnesses pin sessions to an absolute `cwd`, in different places:

- **Claude Code** — the session directory *is* the workspace path with
  slashes replaced by dashes
  (`~/.claude/projects/-Users-…-workspaces-env-3wrqsnkmjz/<sessionId>.jsonl`),
  and `cwd` also appears inside the session content.
- **Codex** — filename is date-keyed and path-free
  (`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`), but the
  `session_meta` line embeds `payload.cwd` as an absolute path, alongside
  `git.commit_hash`.

Neither is portable as-is. But nothing in either format is machine-specific
*beyond the workspace path*. That turns "port opaque harness state"
(intractable, and bb does not own these formats) into "make the workspace
path identical" (a convention: materialize at a canonical path). Path
stability is the prerequisite for every durability strategy, so adopting it
early is not a detour.

## Three tiers of machine-local state

What "the machine is gone" has to account for:

1. **bb-owned, host-local** — `thread-storage/<threadId>/` under the daemon's
   data dir. Verified created in the spike container. Has a **public API
   route** (`threadStoragePathsQuerySchema`), so it is a UI surface backed by
   one machine's disk. Not in any earlier notes.
2. **Harness-owned, host-local** — Claude SDK sessions, Codex rollouts,
   `~/.bb/pi-bridge-sessions/<threadId>.jsonl`. bb transmits *coordinates*
   to these, never content.
3. **Workspace** — uncommitted changes. No snapshot, stash, or auto-commit
   anywhere in `host-workspace`; destroy proceeds on a dirty tree.

Durable by contrast: the thread event stream in server SQLite, and
`providerThreadId`, reconstructable from it with no host round-trip.

## The staleness problem, stated precisely

**bb models host liveness as a property of requests, not of entities.**

The request layer is good: `requireConnectedHostSession` distinguishes 404
"Host is unavailable" (destroyed) from 502 "Host is not connected" (offline),
with different detail payloads. Someone thought about this.

Nothing upstream of a request knows:

- `listEnvironments` is `db.select().from(environments).all()` — no join to
  hosts, no status filter. An environment on a deleted host still lists as
  `ready`.
- `ThreadStatus` is `idle | starting | active | stopping | error`. A dead
  host's threads are marked interrupted, indistinguishable from a user
  pressing stop.
- `Environment.hostId` is immutable, so there is nowhere to move to.

Hence the observed symptom: lists look normal, clicking returns 404. This is
*correct* under the current model, where a host is a laptop that comes back.
It is wrong when the machine is a container that never will. `hostType` was
always a lifetime declaration with one value filled in; adding a second
forces the entity layer to grow what the request layer already has.

## Open

- **Test Daytona `pause`/resume for real.** The free-lunch claim rests on it,
  and a docs read cannot tell us whether a resumed VM's dropped WebSocket and
  clock skew break the daemon's session assumptions. Credits are available.
  This is the highest-value next probe.
- Validate against a `state-durability: process`-less runtime that is also
  service-managed, to check the axis separates cleanly. incus/LXD is the
  natural second, and is runnable locally rather than only readable.
- Credential acquisition for runtimes that cannot inherit from a host. Still
  the axis with no answer anywhere.
- How bb should reconcile a runtime's own port exposure with
  `declareSharedPorts` when both exist.
- Whether terminals become an opt-in capability, and what the UI does on a
  host that declares no terminal.
- What `lifecycle-autonomy: idle-stop` requires of the grace windows and of
  `ThreadStatus`, given a 15-minute idle stop against a 30-second window.

---

## Runtime validation 1: Daytona (2026-08-30)

Chosen as the stress case for `state-durability: none` and the hardest
credential case. Verified against live docs this session (earlier research
sessions were egress-blocked from daytona.io; this one was not).

**The hypothesis under test:** persistence may be something the *service*
provides, at levels that differ per service, rather than something bb has to
build. Confirmed, and more strongly than the hypothesis stated.

### Daytona provides four distinct persistence levels natively

| State | Filesystem | Memory / processes | Applies to |
|---|---|---|---|
| **stop** | preserved on the runner, counts against disk quota (VM sandboxes offload to nearby storage and release quota) | cleared, processes terminate | container + VM |
| **pause** | preserved | **preserved — "freezes the VM with memory intact, resuming continues all processes from the point they were frozen"** | **VM sandboxes only** |
| **archive** | moved to object storage, frees runner quota, cheaper than stopped | cleared (must be stopped first) | **container only** |
| **delete** | destroyed | — | both |

Snapshots and volumes persist independently of the sandbox and survive
delete.

### Consequence 1: `pause` dissolves the three-tier state problem

If the VM freezes with memory intact and resumes with processes alive, then
all three tiers survive with **zero bb work**: `thread-storage/` (tier 1),
the harness's own session files (tier 2), and uncommitted workspace changes
(tier 3) are simply still there, and the harness process itself never died.

Everything derived above about canonical workspace paths, per-provider
session snapshot/restore, and reseeding from bb's event log is
**unnecessary on this runtime**. It remains necessary on runtimes without
pause.

That is the capability model justifying itself: the correct amount of
machinery is a function of what the runtime already does.

### Consequence 2: capability varies *within* one provider

`pause` is VM-only; `archive` is container-only. So "Daytona" is not a
capability set — a *sandbox* is. Any model keyed on provider identity is
wrong at the first provider we checked.

### Consequence 3: a seventh axis — lifecycle autonomy

Not in the original six. **The runtime acts on the machine on its own:**

- auto-stop after idle, **default 15 minutes**, settable to 0 to disable
- auto-archive after a continuously-stopped interval, **default 7 days**

bb currently assumes a host goes away only because it crashed or a human
removed it. Here the platform stops it on a timer, which collides with:

- bb's own idle-session reaping (`reapIdleProviderSessions`)
- the disconnect grace windows `DAEMON_DISCONNECT_GRACE_MS` (5s) and
  `DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS` (30s) — both far shorter than a
  15-minute idle stop, so an auto-stopped sandbox looks like a crash and its
  threads get marked interrupted
- any notion of "the machine is gone", since it is recoverable by calling
  start

An environment whose runtime can stop it underneath bb needs bb to know that
stopping is normal and resumable, not failure.

### Consequence 4: port exposure has a native answer here

Any process listening for HTTP on ports 1–65535 is reachable through a
generated preview URL. Two auth shapes: a standard URL needing an
`x-daytona-preview-token` header (token resets on restart), or a **signed
URL that persists across restarts**, 1 second to 24 hours, revocable.

So the survey's §1c need is already served on this runtime, by the runtime.
bb's own `bb.hosts.declareSharedPorts` tunnel would be a competing
mechanism, not a complementary one. Which port-exposure mechanism applies is
itself a capability.

### Topology note

bb's daemon dials **out** to the server, so daemon-alongside needs no
inbound reachability at all. Preview URLs matter for the *agent's* dev
servers, not for enrollment.

### Not verified

- Whether outbound network access from a sandbox is unrestricted (docs
  section did not cover it). Gates whether an enrolled daemon can reach a
  bb server at all.
- Concrete SDK method names and the exact state machine; the
  `sandbox-management` doc path 404s and this was assembled from the
  persistence, preview, and SDK reference pages.
- Storage quotas and per-state costs. Docs reference them without numbers.
- Whether a paused VM sandbox's clock skew or dropped WebSocket on resume
  breaks the daemon's session assumptions. **This is the one that most
  needs a real test** — pause/resume is the whole free-lunch claim.

Sources: [Persistence](https://www.daytona.io/docs/en/persistence/),
[Preview](https://www.daytona.io/docs/en/preview/),
[Sandboxes](https://www.daytona.io/docs/en/sandboxes/),
[TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/sandbox/),
[Daytona docs root](https://www.daytona.io/docs/).
