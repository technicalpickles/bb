# Environments: where the design stands, and how to falsify it

Started after the survey, the container spike, and the first runtime
validation pass. **Nothing here is committed.** The point of this document
is to state the position cleanly enough that it can be attacked, and to
list the cheapest experiments that would attack it.

The working notes accreted corrections in place and are hard to read straight
through. This is the clean statement — it reflects current understanding
only; see [CHANGELOG.md](CHANGELOG.md) for how it got here. Evidence lives
in:

- [host-locality-leaks-survey.md](host-locality-leaks-survey.md) — the leak survey
- [remote-execution-research.md](remote-execution-research.md) — research, plus §8, the container spike
- [environment-capability-model.md](environment-capability-model.md) — the axes and the runtime validations (Daytona, Coder)
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
upstream knows:

- `listEnvironments` has no join to hosts
- `ThreadStatus` has no "host gone" value
- `Environment.hostId` is immutable

The staleness reaches further than a list that looks fine until you click, too — a
thread's own detail payload (the embedded `environment` object a status
badge would render from) can keep reporting a live status for over a
minute after the host actually went `disconnected`, while the dedicated
status endpoint for the identical ID 502s immediately (P4). What you're
looking at once you've already clicked can itself be wrong, not just the
list you clicked from. Correct behavior when a host is a laptop that comes
back; wrong when it is a container that never will.

**State portability (C3) and identity persistence (C6) are closer than
they look.** They read like separate problems on separate axes, but a good
chunk of what "the machine is gone" needs — reconnecting to the same
logical entity — already works today with zero new server code, just
unwired orchestration (P6). That doesn't remove the C3 case (uncommitted
workspace changes and harness session content still need their own
answer), but the identity half of the staleness problem above is now a
wiring task (fix `install-machine.sh`, add a CLI/UI surface for
`enroll-key`), not a design problem waiting on an architecture decision.

**Daemon alongside vs across.** Alongside = daemon and agent share one
execution environment, so git, watcher, PTY, and the spawn contract are all
untouched. Across = cheaper per environment, but re-plumbs the spawn's
ambient contract. Current lean is alongside, spike-verified at 39s from
`docker run` to `connected`.

---

## Part 2: What the design rests on

Six load-bearing claims. If any is false, the design changes shape.

- **C1 — Daemon-alongside is sufficient.** Every motivation (isolation,
  capacity, reproducible toolchain, detached) is satisfiable without ever
  building daemon-across.
- **C2 — Process-tier durability makes state portability unnecessary.** A
  runtime that freezes and resumes with memory intact needs none of bb's
  state machinery, *including* an enrolled daemon surviving the freeze.
- **C3 — Without process-tier, path identity is most of the unlock, but not
  all of it.** Both harnesses pin sessions to an absolute `cwd`, so a
  canonical workspace path makes session state portable by file copy —
  confirmed against a real session file by P3. But the same transcript
  also carries account/machine-fingerprint data the harness
  stamps into context (sandbox policy paths, global config, MCP/skill
  listings) that would be *wrong*, not just irrelevant, on another machine.
  Full-fidelity resume needs path identity plus harness context regenerated
  per-machine, not path identity alone.
- **C4 — Credentials are the hard axis.** bb can install binaries remotely
  but not sign them in, and this is what makes N ephemeral environments
  painful.
- **C5 — Capabilities can be declared per-runtime without forking the core.**
  bb's subsystems can consume a declaration rather than branching on runtime
  identity.
- **C6 — Host identity can survive compute recreation via a persisted
  credential, with no new server protocol.** P6 confirmed this against two
  live containers: a persisted `auth.json` on a surviving data dir
  reconnects automatically through the existing
  `upsertHost`-keyed-on-`hostId` path, and even a fully lost data dir can be
  reclaimed via the previously-unwired `POST /internal/hosts/enroll-key`
  route. Both gaps found are orchestration/UX (`install-machine.sh` not
  starting a daemon on the already-joined path; no CLI/UI surface for
  reissuing a credential), not protocol.

  Not yet probed at all: **C1**. Every probe in this document ran
  daemon-alongside because that's the only topology bb has, so C1 has never
  been directly stress-tested against an alternative — it remains the one
  claim resting purely on the original spike and the absence of a
  motivation for daemon-across, not on a falsification attempt.

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

**Result (2026-08-31), via source reading, not an actual image build:**
falsified, more strongly than the probe expected. `node-pty` is a plain
`dependencies` entry (not `optionalDependencies`) in both
`apps/host-daemon/package.json` and `packages/bb-app/package.json`.
`terminal-manager.ts:6` does a static `import { spawn as spawnPty } from
"node-pty"`, and its exported `TerminalManager` class is imported as a
*value* (not `type`) at `app.ts:27` — a plain top-level import, evaluated
eagerly. Node's module graph loads and executes every imported module before
the importing module's own top-level code runs, so `node-pty`'s native
binding loads at daemon process start, before any terminal is ever
requested. This isn't just the installer's explicit `require()` check
(`install-machine.sh`) being overzealous — the daemon binary itself cannot
reach a running state without `node-pty` loading successfully. Making
"interactive surfaces" a real declarable capability needs `terminal-manager.ts`
rewritten to load `node-pty` lazily (dynamic `import()` on first terminal
request), not just a relaxed installer.

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

**Result (2026-08-31), via source reading — the live-turn half is still
open:** the probe bundled two separable questions with different answers.

*Does bb's plumbing deliver an injected env var to the provider process at
all?* Yes. `runtime-provider-process.ts:372-376` builds the child env as
`sanitizeInheritedChildProcessEnv({env: process.env})` merged with
`args.env` and `processConfig.env`. `sanitizeInheritedChildProcessEnv`
(`packages/process-utils/src/index.ts:449-466`) strips only `NODE_ENV` and
`BB_*` — everything else, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` included,
passes straight through from the daemon's own process environment. There is
no dedicated "inject a credential" command in bb; `injected` in practice
means "set it on the daemon process's environment before it starts."

*Does bb's own readiness check ever look at that env var?* No, for either
provider inspected. `provider-claude-code/.../provider-maintenance.ts:260-274`
reads OAuth credentials only from the macOS Keychain (`security
find-generic-password`) or `~/.claude/.credentials.json`.
`provider-codex/.../codex-auth.ts:128-146` reads only `~/.codex/auth.json` —
and even that file's API-key path is a JSON field (`OPENAI_API_KEY` inside
the file), never `process.env`. Neither provider's health check consults the
environment at all, so both would report `"unauthenticated"` regardless of
an injected key. No code path was found gating turn-start on that health
status (only two provider-maintenance modules reference
`"unauthenticated"`), so this is plausibly cosmetic — but that inference is
argument-from-absence, the same weak evidence type C3 already flagged.

**Still open:** whether the `claude` / `codex` CLI binaries themselves accept
the env var for a real non-interactive turn. `claude` is installed locally
(2.1.251); `codex` is not. This needs an actual API call against a real key
to answer, which weakens "cheap, local" — flagging it for a deliberate go/no-go
rather than just spending it.

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

**Result (2026-08-31), from a real thread's actual session file, not the
format read cold:** partially falsified — real content beats absence.

Ran a live two-turn thread (`claude-code` provider) against a throwaway git
workspace through the dev app (`scripts/bb-dev-app`, not the packaged
build), then read the Claude Code CLI session file it produced
(`~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`, 22 lines) instead of
reading the format cold. Every per-turn record does carry `cwd` and nothing
else worrying at the top level — no hostname, no machine id, no absolute
path to a node/claude binary.

But the transcript also holds an `attachment` record with
`type: "sandbox_instructions"` — the same sandbox filesystem-policy block
visible to every interactive session, captured verbatim into the harness's
own history. It embeds dozens of this account's absolute paths (`~/.cache/*`,
`~/.config/*`, `~/.claude/*`, tool caches) and, more pointedly,
`/private/var/folders/w0/tl09v7dd22q5pn96nbf2btjw0000gn` — confirmed via
`getconf DARWIN_USER_TEMP_DIR` to be the live `DARWIN_USER_TEMP_DIR`, which
is derived from the account's UUID and — per this account's own sandbox-paths
note — "changes on a different Mac or a recreated account." That is not
`cwd`. It is a literal account/machine fingerprint, and on another machine
it would be **wrong**, not just irrelevant: the model would be told a temp
directory is writable when the path doesn't exist there at all.

Other `attachment.type` values in the same transcript
(`hook_additional_context`, `mcp_instructions_delta`, `skill_listing`) are
similarly account-personalized — tied to this account's global
`~/.claude/CLAUDE.md`, MCP config, and skill set, not the workspace. Whether
any of this actually breaks a resumed turn (versus the model just getting
corrected on the next real sandbox violation) was not tested — the second
half of the probe's method, copying to a genuinely separate machine and
resuming, still wasn't run. A Docker container wouldn't isolate this
variable cleanly anyway, since it would have neither this account's sandbox
policy nor its credentials to compare against. What changed is the *kind* of
evidence: the doc's "reading two session formats and finding only `cwd`" was
an argument from absence; this is presence of a real fingerprint, one
severity level below "resume doesn't work." C3 should read "cwd, plus
whatever the harness's own context-injection features stamp into every
session" rather than "cwd only."

Separately: bb's own `thread-storage/thr_2vk4mz4z5d/` directory was empty
for this thread — no bb-side data supplements the harness session file for
this provider. Whatever moves, moves entirely as the CLI's own JSONL.

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

**Result (2026-08-31), a real enrolled container, real `docker kill`, not
inferred from code:** partially confirmed, one layer worse than "lists look
fine, clicking 404s" suggested — the staleness reaches the thread detail
view itself, not just an index.

Built the §8 spike image (`node:22-bookworm-slim` + the toolchain P1 already
showed is mandatory), enrolled it against the dev app with
`BB_INSTALL_SKIP_SERVICE=1` (39s to `connected`, matching §8b), created a
project/environment on it, and got one thread to actually spawn by passing
`--model` explicitly — the default-model-resolution path 503s before a
thread even exists if the provider health check hasn't passed, so an
unauthenticated container can't reach "running" through the normal path at
all. That thread errored on auth within about a second (expected — no
Keychain, no credentials file in a fresh container, the same wall P2 hit),
so **the active-work grace path
(`DAEMON_ACTIVE_WORK_DISCONNECT_GRACE_MS` = 30s,
`hostReconnectGraceExpiresAt`) could not be exercised** — that needs a
genuinely in-flight turn, which needs the same live provider credentials
this investigation has twice now declined to spend. Idle only.

What idle *did* show, `docker kill`, then polled every 1–2s:

- **`bb machine show` flips `connected` → `disconnected` in about a
  second** — not gated by either grace constant. Those constants turned out
  to govern how a thread with active work waits before reacting to a
  disconnect, not how fast the raw connectivity signal itself updates.
- **`bb environment status` on that host's environment returns a clean
  `HTTP 502: Host is not connected`** the instant the host is down — the
  doc's predicted "404 destroyed vs 502 disconnected, distinct payloads"
  is real and working exactly as described, for this environment endpoint.
- **But `bb thread show`'s embedded `environment` object — the same data a
  thread detail page would render a status badge from — kept reporting
  `"status": "ready"`**, unchanged, after the host had been `disconnected`
  for well over a minute. Querying the *same environment ID* through the
  dedicated status endpoint 502s immediately; querying it as a side-object
  on the thread returns a stale success. The doc's "lists look fine until
  you click" undersold it slightly: this isn't a list failing to join to
  host state, it's the thread's own detail payload — what you're looking
  at when you've already clicked — carrying a snapshot that direct query
  on the identical ID contradicts.

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

### P6 — Does a persisted credential alone let recreated compute reclaim its host identity? (C6, cheap, local)

**Why:** the Coder runtime validation (`environment-capability-model.md`,
"Runtime validation 2") found that Coder's own agent survives container
destroy/recreate by keeping its identity token outside the container's
lifecycle, and flagged this as a property bb's own daemon/server pairing
might or might not already have. It looked, from the outside, like exactly
the mechanism the staleness section describes as missing.

**Method:** read `apps/host-daemon/src/start-host-daemon.ts`,
`identity.ts`, `auth-state.ts`, and the server's
`apps/server/src/internal/{hosts,session}.ts` and
`packages/db/src/data/hosts.ts`, rather than build anything first — this is
answerable from source before it needs a container.

**Falsifies if:** the daemon's persisted credential is derived from
something that doesn't survive being written to and read back from a
volume (a hardware ID, a container-assigned hostname), so persisting the
data dir alone wouldn't be sufficient — or if the server's `upsertHost` path
requires anything beyond a matching `hostId` (e.g. a hostType or session
state check that only holds for same-process restarts, not cross-container
ones) — meaning C6 needs new server protocol, not just a storage
convention.

**Result (2026-09-02), via source reading, not a live container test:**
partially confirmed, with the gap narrower and more specific than expected.

**The "same process restarts" case already works, exactly like the design
doc's staleness section implies it should for a laptop that comes back.**
`install-machine.sh` picks a fixed data directory
(`$HOME/.bb-machines/<server-host>`, overridable via `BB_DATA_DIR` —
`install-machine.sh:174`). First enrollment mints a `hostId`
(`identity.ts:44`, `randomUUID()` — not derived from any machine fact) and a
non-expiring `hostKey` (`DAEMON_HOST_CONFIG_ID`, no `keyExpiration` —
`machine-auth.ts:147-153`), persisted to `<dataDir>/host-id` and
`<dataDir>/auth.json` (`identity.ts:57-80`, `auth-state.ts:32-52`, mode
`0o600`). Every subsequent boot reads `auth.json`
(`start-host-daemon.ts:77`) and, if present, **reuses it unconditionally**
and skips enrollment entirely (`start-host-daemon.ts:109-110`). Server-side,
both the enroll route and the per-connection `session/open` route call
`upsertHost(deps.db, deps.hub, { id: hostId, ... })`
(`hosts.ts:101-106`, `session.ts:91-96`), which is a plain
insert-or-update keyed on `id` (`packages/db/src/data/hosts.ts:57-107`) —
`destroyedAt` is untouched by connect/disconnect, only set by the explicit
host-removal route. So a daemon that reconnects with its original
`auth.json` is recognized as the *same* host row already, today, with no
new protocol — this is bb's already-exercised restart/reconnect path, not
a gap.

**The gap is narrower than "no mechanism exists" — it's that nothing ever
threads a prior `hostId` back through re-enrollment on recreated compute.**
When `auth.json` is absent (a fresh container, empty volume), the daemon
takes the first-enrollment branch unconditionally
(`start-host-daemon.ts:112-127`) and, absent an explicitly supplied
`--host-id`/`BB_HOST_ID`, `identity.ts:44` mints a **new random `hostId`**.
Server-side, `issuePersistentHostEnrollKey`
(`apps/server/src/services/hosts/host-enrollment.ts:11-24,15`) mirrors
this: `args.hostId ?? createHostId()` — it *can* accept a caller-supplied
`hostId` and re-mint an enroll key scoped to an existing host, and
`hosts/enroll-key` accepts an optional `hostId` (`hosts.ts:68`), but no CLI
or UI code path in the repo actually calls it that way. The mechanism for
C6 already exists end-to-end in the API; it has simply never been wired to
anything that would use it for "compute got recreated, reclaim identity
X." So C6 is not falsified — the credential *is* the right durable
primitive and the server *does* accept a supplied `hostId` — but it is
also not yet proven, because the reclaim path has never been exercised,
only found unused via grep.

**Result (2026-09-02), against a real daemon and a real dev server, not
just source reading:** confirmed for the "data dir survives" case, with one
real orchestration gap found along the way that source reading alone would
not have surfaced.

Method: built the §8 spike image (`node:22-bookworm-slim` + the toolchain
P1 already showed is mandatory), created a Docker named volume, ran a
container with `BB_DATA_DIR` pointed at that volume, and enrolled it
against the local dev server (`scripts/bb-dev-app`) via a real join
code/hostId pair minted through `POST /hosts/join-codes`. Confirmed
`connected` (`host_j7ar5b3aem`), with `auth.json`/`host-id` written onto
the volume. Then `docker kill` + `docker rm` — container fully gone, host
flipped to `disconnected` within seconds, matching P4. Waited 45s (past the
30s active-work grace window). Started a **second, brand-new container**
(different container ID) with the same volume attached, same `--host-id`,
and deliberately reused the **already-exhausted** join code from round one
(single-use, `remaining: 1`, already spent) to make the test strict: if the
reclaim depended on the join code at all, this run would fail.

It didn't. `install-machine.sh` printed `This machine is already joined to
http://host.docker.internal:20470 as host_j7ar5b3aem` — the join code was
never touched, exactly matching `auth_matches_host()`'s short-circuit found
in the source read. But the host stayed `disconnected` — because in the
`already_joined=yes` branch, `install-machine.sh` never sets `$join_pid`
(that only happens inside the `if [ "$already_joined" = no ]` block), so
under `BB_INSTALL_SKIP_SERVICE=1` it prints `Service installation
skipped.` and exits **without starting a daemon process at all**. This is
correct behavior for its actual use case — a real reinstall/upgrade of a
machine that already has a persistent systemd/launchd service managing the
daemon — but it's a real gap for a disposable-container recipe, where
there is no service and nothing else will start the daemon.

Worked around it by invoking the daemon directly:
`BB_DATA_DIR=/data bb-app host-daemon join --host-daemon-port <port>
--host-id host_j7ar5b3aem --server-url <url>`, **no join code at all**.
Log: `Connected to server {"sessionId":"hses_bgmcp94bvi"}`, then `Host
daemon started {"identity":{"hostId":"host_j7ar5b3aem", ...}}`.
`bb machine list` immediately after showed exactly one row for
`host_j7ar5b3aem`, now `connected` — not a second row, not a duplicate.
That's the core C6 claim, confirmed against a live server: a persisted
credential on a volume that outlives the container is sufficient, with the
existing `upsertHost`-keyed-on-`hostId` mechanism, no new server protocol.
Cleaned up: host removed via `DELETE /hosts/:id`, container/volume/image
removed, scratch files deleted.

**So, precisely:** C6's core mechanism is not just unfalsified, it is now
demonstrated end to end. The gap is not in the daemon/server protocol —
it's one level up, in `install-machine.sh`'s assumption that "already
joined" implies "something else is already running the daemon." Any real
recipe for daemon-alongside-in-disposable-compute needs either a fix to
that script (start the daemon in the `already_joined` branch too, at least
under `BB_INSTALL_SKIP_SERVICE=1`) or a container entrypoint that calls
`host-daemon join` directly instead of going through the installer's full
provisioning path every time.

**The "data dir did not survive" case, answered same day:** ran it for
real too. Enrolled a fresh host (`host_dvdxcu46hf`), confirmed `connected`,
then `docker kill` + `docker rm` **and** `docker volume rm` — container and
volume both gone, no credential surviving anywhere. Confirmed
`disconnected`. Then called the previously-unused escape hatch directly:
`POST /internal/hosts/enroll-key` with `{"hostId": "host_dvdxcu46hf"}` —
this route is loopback-only (`assertLoopbackRequest`) but otherwise
unguarded, and worked on the first call, returning a fresh `bbde_` join
code scoped to the old `hostId` with no complaint about the host being
disconnected or the prior key being gone. Used that key on a **brand-new
container with a brand-new, never-before-seen volume** — no residue from
the original enrollment anywhere — and it joined cleanly as
`host_dvdxcu46hf`. `bb machine list` showed exactly one row, `connected`,
no duplicate. Also created a real project (`POST /projects`, `local_path`
source pointed at the reclaimed host) to confirm the practical
consequence: source routing to a reclaimed `hostId` just works, because
nothing else in the model was ever keyed on the compute instance, only on
`hostId` — which is exactly why this worked without touching
`Environment.hostId` at all.

So the full C6 claim now stands on two live tests, not source reading: a
persisted credential reconnects automatically when the data dir survives,
and — via a real but entirely unwired-up internal route — an operator can
manually reissue a fresh credential for an old `hostId` even when nothing
survives at all. Neither path needed any new server code. The gap in both
cases is orchestration and UX, not protocol: `install-machine.sh` doesn't
start the daemon on the already-joined fast path (previous result, above),
and nothing in the CLI or web UI exposes "get a new join code for this
specific existing host" — the loopback restriction on
`/internal/hosts/enroll-key` means it would need a proper authenticated
route (or a CLI subcommand that runs on the server's own machine) before
it could be offered as a real "recover this host" action.

Cleaned up: project and host both deleted via the API, container/volume/
image removed, scratch files deleted.

**Incidental:** `pnpm run bb:dev -- <command> <positional> --<flag>` fails
across multiple unrelated CLI commands (`machine join-code --json`,
`machine show <id> --json`, `machine remove <id> --yes`) with `error: too
many arguments for '<command>'. Expected N but got N+1` — a flag following
a positional argument is miscounted as an extra positional. Worked around
it by calling the HTTP API directly (`POST /hosts/join-codes`,
`DELETE /hosts/:id`) instead of the CLI. Not investigated further; flagging
it here since it blocked routine CLI use during this probe and would
affect anyone else scripting against `bb:dev`.

### Ordering

P1–P4 are local, need no accounts, and together test four of the five
original claims. P6 is likewise local and cheap, and was answered the same
way — source reading, no container needed for the first half of the
question. P5 needs Daytona credits and tests the one claim that would most
expensively be wrong. Doing P1–P4 and P6 first is not deferring P5 — it is
arriving at P5 already knowing what a healthy enroll/kill/resume cycle
looks like locally, which is what makes a Daytona result interpretable
rather than ambiguous.

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

Worth noting after P6: this and the staleness problem are the same
underlying gap wearing two different symptoms. `requirePrimaryHostId`
assumes there is one obvious host because nothing ever gave hosts a
first-class, reconcilable identity; the staleness problem's "nowhere to
move to" is the same absence viewed from the environment side. A real fix
for either should probably be designed as one identity-model pass, not two
separate patches that end up touching the same `hosts` table twice.

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
