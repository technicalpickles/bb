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
  **service-managed** (Coder's Docker template, validated below, is
  process-less but *self-managed* — the volume is yours to lose). incus/LXD
  or a managed disk provider remain the natural next check, and are runnable
  locally rather than only readable.
- Credential acquisition for runtimes that cannot inherit from a host. Still
  the axis with no answer anywhere for bb's own daemon, though Coder's
  generic-secret pattern (below) is a viable template to copy.
- How bb should reconcile a runtime's own port exposure with
  `declareSharedPorts` when both exist.
- Whether terminals become an opt-in capability, and what the UI does on a
  host that declares no terminal.
- What `lifecycle-autonomy: idle-stop` requires of the grace windows and of
  `ThreadStatus`, given a 15-minute idle stop against a 30-second window.
- **New candidate property, not yet an axis: daemon identity persistence
  across compute recreation.** Surfaced by Coder (below) decoupling agent
  identity from the container's lifecycle. Orthogonal to state durability —
  it's not about what data survives, it's about whether a *freshly started
  process* on recreated compute can prove it's a continuation of a
  previously-enrolled host rather than a brand-new one. **Confirmed
  2026-09-02** by P6/C6 in
  [design-position-and-probes.md](design-position-and-probes.md)
  against two live containers: the mechanism already exists end-to-end
  (`upsertHost` keyed on `hostId`, plus a previously-unwired
  `POST /internal/hosts/enroll-key` reclaim path) and needs no new server
  protocol. The mechanism itself doesn't need a design pass — what remains
  is orchestration (`install-machine.sh` doesn't start a daemon on the
  already-joined path) and exposing reclaim as a real, authenticated
  CLI/UI action. `project:bb` task 492 tracks designing this together with
  `requirePrimaryHostId`, since both are the same underlying "no first-class
  reconcilable host identity" gap.
- Whether a capability is gated by the runtime's engineering versus a given
  deployment's license tier (Coder's dormancy/auto-deletion are
  enterprise-only; self-hosted OSS gets `idle-stop` but not `idle-destroy`).
  The model currently assumes capability is a property of the runtime; this
  is a case where it's runtime *and* license, which nothing declares today.

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

---

## Runtime validation 2: Coder (2026-09-02)

Chosen for two reasons: it's self-hostable, so it could be tested for real
with no cloud account and no credits, on a laptop; and it's a plausible
opposite pole from Daytona on the durability axis, worth checking before
assuming "VM sandbox platforms" is a coherent category rather than
per-runtime variation.

**Method:** installed `coder` v2.35.3 locally via Homebrew, ran `coder
server` fully self-hosted against `127.0.0.1:3000` (its embedded Postgres,
no external dependency), pushed the stock `docker` starter template
unmodified, created a workspace. Before stopping it: wrote a marker file to
`/home/coder` (the template's named Docker volume), a second marker to
`/tmp` (container root, not volume-backed), and started a background `while
true` loop appending a timestamped heartbeat line to a log every 2s. Then
`coder stop` (the real control-plane path, not `docker stop`), waited 45s —
past bb's 30s `DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS` — then `coder start`,
then diffed what survived. Cleaned up afterward: workspace deleted, template
removed, Docker container/volume/image removed, local server killed, scratch
config directory deleted. No bb code or docs were touched by the test itself
(this section is the only artifact).

### No pause tier — `state-durability: filesystem`, confirmed empirically

`coder stop` destroyed the container outright in about a second — gone
entirely from `docker ps -a`, not paused, not archived. The heartbeat log
stopped dead at the exact destruction timestamp and the process was not
running post-restart; nothing about it survived. `coder start` created a
**brand-new container** (a different Docker container ID) in ~1.6s, agent
healthy again in ~14s. `/home/coder/marker.txt` survived (the named volume);
`/tmp/root-marker.txt` did not (fresh container root). This is exactly
`state-durability: filesystem`, `persistence-provider: self-managed` — the
volume is a Docker construct you own, not a platform-managed guarantee — and
it is the clean opposite of Daytona's `pause`. Confirms the axis separates
runtimes as sharply as the model claims: two "container/VM sandbox
platforms," nearly disjoint capability profiles.

### A property the nine axes don't name: daemon identity survives compute recreation

The template's `coder_agent` Terraform resource is **not** gated by `count =
data.coder_workspace.me.start_count` the way `docker_container` is. Stopping
only destroys the container; the agent resource — and its auth token — is
untouched ("Drift detected (update)" in the Terraform plan, not destroy/
recreate). So when a fresh container starts and runs the agent's init
script, it reconnects **as the same logical workspace**, automatically, with
no re-auth step, even though the compute underneath it is 100% new.

This is architecturally the missing piece the design doc's staleness section
already flagged: bb's own `Environment.hostId` is immutable and a vanished
host has "nowhere to move to" (P4 found the same shape — a host flips to
`disconnected` in ~1s with no path back). Coder doesn't solve this *for* a
bb daemon running inside one of its workspaces — a fresh bb daemon process
in the fresh container still has to prove it's a continuation of the
previous host, same problem as plain Docker. But Coder is a working
reference architecture for the fix: decouple logical identity from physical
compute, mint a durable token at logical-creation time, treat a
control-plane-initiated stop as known-good rather than indistinguishable
from a crash. Since bb's own daemon data dir could live on the same
persistent volume the workspace files do, the same trick is available to bb
directly — if the daemon's startup path checks for existing enrollment
credentials on disk before enrolling fresh. Not evaluated further this
session; see the **Open** section above.

### Credential acquisition: a cleaner non-interactive pattern than bb has today

Two distinct mechanisms, easy to conflate: git-specific `coder_external_auth`
is OAuth, interactive once per user, then auto-injected via `GIT_ASKPASS`.
Separately, and more relevantly, **arbitrary secrets are just Terraform
variables piped into `coder_agent`'s `env` block** — template-admin-set,
non-interactive, no OAuth, applies to every workspace built from that
template. That's the same shape P2 already found bb's daemon plumbing
supports mechanically (env passthrough to the provider subprocess works
generically) — Coder is independent evidence that "declare a secret at
provisioning time, inject into the agent's environment" is normal, working
practice elsewhere, not a hopeful assumption. Strengthens the case for
finishing `injected` as a real value once bb's own provider health checks
stop being blind to env vars (P2's still-open half).

### Port exposure: opt-in per template, same shape as bb's own gap

`coder_app` gives subdomain-based port exposure, but the template author has
to wire up each port explicitly — it is not automatic the way Daytona's "any
listening port gets a preview URL" is. Structurally the same shape as bb's
`declareSharedPorts`: a mechanism that exists but has to be hand-declared,
not a platform guarantee. Doesn't resolve the "how does bb reconcile a
runtime's own port exposure with `declareSharedPorts`" open question, but
confirms it's a real recurring shape, not a Daytona-specific wrinkle.

### Lifecycle autonomy: native and well-specified, but license-gated

Autostop-on-inactivity and autostart-on-schedule are free, self-hosted, OSS
features — admin sets defaults, users can adjust if allowed. Dormancy
(mark inactive after N days) and auto-deletion (destroy after N days
dormant) exist too, but are **enterprise/premium-only** per the docs — not
available in the free self-hosted tier this session actually ran. Worth
naming precisely because the model's axes currently treat capability as a
property of the *runtime*; this is a case where it's runtime *and*
deployment license, which nothing in the model declares today. See Open.

### Not verified

- Whether a non-Docker Coder template (a real VM provider, e.g. AWS/GCP)
  would land differently on the durability or persistence-provider axes —
  this session only tested the Docker provisioner, which is inherently
  self-managed. Coder itself is provisioner-agnostic; "Coder" is no more a
  fixed capability set than "Daytona" was.
- Full-fidelity harness session resume (C3) — this session tested file/
  process survival, not an actual `claude`/`codex` session resuming inside
  a rebuilt container. The path-stability precondition looks satisfiable
  (fixed `/home/coder` mount) but wasn't exercised end-to-end.
- Outbound network behavior from inside a workspace, and whether a
  Coder-hosted bb daemon enrolling against a real (non-tunnel) bb server
  has any surprises beyond what plain Docker already showed in P1/P4.

Sources: [Workspace Lifecycle](https://coder.com/docs/user-guides/workspace-lifecycle),
[Workspace Scheduling](https://coder.com/docs/admin/templates/managing-templates/schedule),
[External Auth](https://coder.com/docs/admin/external-auth),
[Port Forwarding](https://coder.com/docs/admin/networking/port-forwarding),
[Coder Agents](https://coder.com/docs/ai-coder/agents),
[Install](https://coder.com/docs/install),
and the `docker` starter template (`coder templates init --id docker`),
read directly and run locally this session.
