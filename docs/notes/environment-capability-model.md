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

| Axis | Values | What exists today |
|---|---|---|
| **Process hosting** | `long-lived` · `oneshot` | The gate between alongside and across. Anything that can run a process and expose a port supports alongside. |
| **State durability** | `none` · `disk-survives` · `full` | **Nothing.** `hostTypeValues = ["persistent"] as const` — one value, and it is *named* persistent. |
| **Workspace materialization** | `inherited` · `cloned` · `preexisting` | `project.clone` exists (`POST /projects/:id/sources`, `type: "clone"`) but is a manual call, never part of provisioning. No canonical-path convention. |
| **Credential acquisition** | `inherited` · `injected` · `interactive` | **Nothing.** Binaries: `bb machine provider-cli install` works remotely, 11s. Credentials: `~/.codex/auth.json` never appears; the provider hint is literally "Run `codex` on the machine to sign in." |
| **Interactive surfaces** | `terminal` · `port-exposure` · `editor-reach` | Terminal: works, but costs +357MB for `node-pty` (see §8a) so it should be opt-in. Port exposure: `bb.hosts.declareSharedPorts` exists. Editor: `remote-ssh` context exists, mapping is hand-declared. |
| **Lifecycle ownership** | `bb` · `external` · `human` | Human only. Decides whether bb needs to hold cloud credentials. |

Four of six have partial machinery. **The two that are genuinely empty are
state durability and credential acquisition** — and those are exactly the two
that the ephemeral-container case depends on.

## Why "persistent volume vs snapshot" is not a design decision

An earlier draft recommended "container ephemeral, named volume durable" as
the primary approach with snapshot/restore as an escalation. That was a
Docker mechanism promoted to an architecture.

It is one value on one axis. `state-durability: disk-survives` → reattach
storage, no per-provider work. `none` → snapshot and restore. `full` →
neither. The resume strategy is a function of the declaration.

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

- Validate the axes against runtimes that are not Docker. The model was
  derived from one spike on one runtime, and a Docker-shaped answer already
  slipped in once.
- What `state-durability: none` actually requires per provider, given the
  path-identity finding.
- Credential acquisition for runtimes that cannot inherit from a host.
- Whether terminals become an opt-in capability, and what the UI does on a
  host that declares no terminal.
