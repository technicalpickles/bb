# Environments: where the design stands, and how to falsify it

Written 2026-08-30, after the survey, the container spike, and one runtime
validation pass. **Nothing here is committed.** The point of this document is
to state the position cleanly enough that it can be attacked, and to list the
cheapest experiments that would attack it.

The working notes accreted corrections in place and are hard to read straight
through. This is the clean statement. Evidence lives in:

- [host-locality-leaks-survey.md](host-locality-leaks-survey.md) — the leak survey
- [environments-remote-execution-research.md](environments-remote-execution-research.md) — research, plus §8, the container spike
- [environment-capability-model.md](environment-capability-model.md) — the axes and the Daytona pass
- [container-and-remote-environments.md](container-and-remote-environments.md) — the spawn-hook question

---

## Part 1: Where we are

### The position

**A runtime declares what it can do; bb adapts.** There is no new pluggable
`Environment` type, and no per-provider integration in the core.

This is not a preference. Every question we tried to settle globally turned
out to be a per-runtime answer in disguise:

| We asked | It turned out to be |
|---|---|
| Volumes or snapshots? | One value on the durability axis |
| Daemon inside or outside? | A capability the runtime either has or doesn't |
| How do we port harness sessions? | Unnecessary on any runtime with process-level persistence |
| How do we expose a port? | Some runtimes bring their own and compete with ours |

The clinching evidence: **Daytona's `pause` freezes a VM with memory intact
and resumes processes from the freeze point.** On that runtime, all three
tiers of machine-local state survive with zero bb involvement, and every
mechanism we drafted for state portability is dead weight. On a runtime
without it, the same mechanisms are mandatory. Also, `pause` is VM-only while
`archive` is container-only — so capability varies *within* one provider, and
nothing can be keyed on provider identity.

### The nine axes

process hosting · state durability · durable artifacts · persistence
provider · workspace materialization · credential acquisition · interactive
surfaces · lifecycle ownership · lifecycle autonomy

Full values in
[environment-capability-model.md](environment-capability-model.md). The four
with **no machinery whatsoever** are state durability, durable artifacts,
persistence provider, and lifecycle autonomy — plus the credential half of
credential acquisition, since bb can already install provider *binaries*
remotely in 11s but cannot sign them in.

What those four have in common: they are all about the machine's *lifetime*.
Which is exactly what `hostTypeValues = ["persistent"] as const` was built
to not have.

### Two framings worth keeping

**Liveness is a property of requests, not entities.** The request layer is
good — 404 destroyed vs 502 disconnected, with distinct payloads. Nothing
upstream knows: `listEnvironments` has no join to hosts, `ThreadStatus` has
no "host gone" value, `Environment.hostId` is immutable. Hence lists that
look fine until you click. Correct behavior when a host is a laptop that
comes back; wrong when it is a container that never will.

**Daemon alongside vs across.** Alongside = daemon and agent share one
execution environment, so git, watcher, PTY, and the spawn contract are all
untouched. Across = cheaper per environment, but re-plumbs the spawn's
ambient contract. Current lean is alongside, spike-verified at 39s from
`docker run` to `connected`.

---

## Part 2: What the design rests on

Five load-bearing claims. If any is false, the design changes shape.

- **C1 — Daemon-alongside is sufficient.** Every motivation (isolation,
  capacity, reproducible toolchain, detached) is satisfiable without ever
  building daemon-across.
- **C2 — Process-tier durability makes state portability unnecessary.** A
  runtime that freezes and resumes with memory intact needs none of bb's
  state machinery, *including* an enrolled daemon surviving the freeze.
- **C3 — Without process-tier, path identity is the whole unlock.** Both
  harnesses pin sessions to an absolute `cwd` and nothing else
  machine-specific, so a canonical workspace path makes session state
  portable by file copy.
- **C4 — Credentials are the hard axis.** bb can install binaries remotely
  but not sign them in, and this is what makes N ephemeral environments
  painful.
- **C5 — Capabilities can be declared per-runtime without forking the core.**
  bb's subsystems can consume a declaration rather than branching on runtime
  identity.

---

## Part 3: Probes

Ordered cheapest-first, not importance-first — four of the five need no cloud
account and could be done in an afternoon. Each names what result would
**falsify** the claim, because a probe that cannot fail is not a probe.

### P1 — Can a daemon enroll without `node-pty`? (C5, cheap, local)

**Why:** we concluded terminals should be opt-in, since `node-pty` costs
+357MB of build toolchain on Debian slim and a disposable sandbox may never
open a terminal. But `install-machine.sh:441-448` hard-fails if `node-pty`
does not load. **Enrollment currently requires it.** So "interactive
surfaces" may not be a declarable capability without changing the install
gate and whatever else assumes a PTY exists.

**Method:** build the 484MB image (no `python3 make g++`), attempt
enrollment, read exactly where it dies. Then check whether the daemon itself
tolerates a missing PTY or only the installer does.

**Falsifies if:** the daemon needs a PTY at startup rather than on first
terminal request. Then terminals are load-bearing infrastructure, not a
capability, and the axis loses a value.

### P2 — Does an injected API key actually work, end to end? (C4, cheap, local)

**Why:** credential acquisition is the axis with no answer, and the whole
`injected` value is an assumption. If `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
in the environment is enough to run a real turn with no interactive login,
the axis is far less frightening than it looks and the ephemeral case gets
much easier.

**Method:** reuse the spike container. Enroll, install a provider CLI (known
to work, 11s), inject a key via the daemon's environment, run one real turn.
Repeat per provider — they will not behave the same.

**Falsifies if:** providers require an OAuth session that an API key cannot
substitute for, or bb has no path to get an env var to the provider process
at all. Then `injected` is not a real value and every runtime that cannot
inherit credentials from a host needs something bb does not have.

### P3 — Move a live session to another machine at the same path (C3, cheap, local)

**Why:** C3 rests on reading two session formats and finding only `cwd`
machine-specific. That is an argument from absence, which is the weakest kind.

**Method:** run a real thread to a few turns. Copy the harness session files
plus `thread-storage/<threadId>/` to a second machine with the workspace at
an **identical** path. Resume. Check whether the agent actually has its
context or is quietly amnesiac.

**Falsifies if:** anything else is machine-pinned — a machine id, an absolute
path to a node binary or tool, a credential referenced by path, an embedded
absolute path we did not see in the first 40 lines. Then full-fidelity
resume needs per-provider rewriting, not just path discipline, and the cost
of every non-`process`-tier runtime goes up sharply.

### P4 — What does the UI actually do when a host vanishes mid-turn? (C5, cheap, local)

**Why:** "lists look fine, clicking 404s" is inferred from reading
`listEnvironments` and `ThreadStatus`. Worth seeing, because the *actual*
user-visible failure is what any fix has to target, and because
lifecycle-autonomy needs to know the difference between a 15-minute idle
stop and a crash. bb's grace windows are 5s and 30s.

**Method:** enrolled container, thread mid-turn, `docker kill`. Observe the
thread state, the environment row, the timeline, and every screen that
references them. Repeat while idle rather than mid-turn — the two paths
differ (`DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS` vs
`DAEMON_DISCONNECT_GRACE_MS`).

**Falsifies if:** it degrades gracefully already, in which case
lifecycle-autonomy is a smaller problem than claimed and drops down the list.

### P5 — Daytona pause/resume with a live enrolled daemon (C2, needs credits)

**Why:** the single highest-value probe, and the only one that cannot be done
locally. C2 is the strongest claim in the design and it currently rests
entirely on a documentation sentence. "Processes resume from the point they
were frozen" is a statement about *processes*; it is not a statement about a
**WebSocket that has been dead for an hour**, a **clock that jumped**, or an
**auth token that expired while frozen**.

**Method:** enroll a Daytona VM sandbox as a bb host. Verify connected. Pause
it. Wait long enough to matter — past the 30s active-work grace window, and
ideally past a token lifetime. Resume. Does the daemon reconnect on its own,
or does it sit there with a dead socket believing it is still connected? Does
the thread resume with real continuity, or does it look continuous while the
harness has actually lost its place?

**Falsifies if:** the daemon cannot recover from a freeze without a restart.
Then `process`-tier durability does not deliver the free lunch — you get the
filesystem for free but still need reconnection logic, and possibly all of
C3's path-identity machinery anyway. This is the result that would most
change the design, which is why it is worth spending credits on.

### Ordering

P1–P4 are local, need no accounts, and together test four of the five claims.
P5 needs Daytona credits and tests the one claim that would most expensively
be wrong. Doing P1–P4 first is not deferring P5 — it is arriving at P5 already
knowing what a healthy enroll/kill/resume cycle looks like locally, which is
what makes a Daytona result interpretable rather than ambiguous.

---

## Part 4: What can proceed regardless

One item does not depend on any of this and could ship on its own:

**`requirePrimaryHostId` as an implicit default.** It resolves by reading the
host-id file out of the *server's own data dir*, so it only works because the
daemon writes into the same directory; both fallbacks bail once more than one
host exists. Four call sites default to it silently. The worst is server-side
inference, which generates thread titles and commit messages for a thread
running on host B using **host A's** credentials. Independent of the
capability model, cheap, and wrong today on any multi-host setup.

---

## Part 5: Standing methodology note

Two claims in the original survey were wrong, with one cause: it enumerated
daemon commands by grepping `z.literal("host.*")` only. There are seven other
namespaces — `project.*`, `environment.*`, `workspace.*`, `thread.*`,
`provider.*`, `turn.*`, `interactive.*` — and it never read
`packages/plugin-sdk/src/backend-contract.ts`. That is where
`bb.hosts.declareSharedPorts` lives, which falsified one claim, while
`project.clone` falsified the other.

**Before asserting "bb cannot do X on a host," check every command namespace
and the plugin SDK.** Both wrong claims were of that exact form, and both
made a gap look structural when a primitive already existed.
