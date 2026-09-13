# Changelog: bb environments design notes

Dated record of corrections, revisions, and confirmations to the docs in
this directory. Each entry names what changed, why, and which doc/section
it affected. The docs themselves state current understanding, not the
history of how they got there — use this file for that.

## 2026-09-13

Upstream `main` synced after lagging this branch by ~450 commits (releases
0.41.0–0.43.0). Checked every claim in this directory against what actually
shipped in that window — two PRs land squarely in this space: **#3227
"Environment providers: plugins own where threads run"** +
**#3443 "Consolidate environment provisioning into one durable lifecycle"**
(environment/workspace side), and **#3274 "Machine providers: durable
lifecycle and shared plugin APIs"** (host/machine side, includes the
experimental Modal sandbox provider). Full comparison below; nothing here
was falsified, several open items closed, two claims need a wording
correction (not a reversal), and P5 is untouched.

- **design-position-and-probes.md, Part 1 ("The position").** Position
  holds: #3227/#3443 did not add a new pluggable `Environment` entity. The
  `environments` row is still one generic shape (workspace path + host + an
  opaque per-provider `resource` JSON blob); the one transitional table
  that briefly existed (`environment_launches`) was deleted back into that
  single row by #3443. What shipped is narrower and real: plugins now
  supply *who materializes the resource* behind that one row, via a
  `create`/`remove`/`validate`/`availability` contract
  (`@get-bb/plugin-sdk/environment-provider`) selected by
  `environmentProviderId` — not a new entity kind. Added one clarifying
  sentence to the position statement so "no per-provider integration in
  the core" isn't misread as "no provider plugins at all."
- **design-position-and-probes.md, Part 1 ("Liveness is a property of
  requests, not entities").** `Environment.hostId` immutability bullet
  softened, not reversed. `reserveEnvironment()` can now rewrite `hostId`
  on the same row when a fully-torn-down provisioning attempt is retried
  on a different host — but only after full teardown (no path, no
  resource), never for a live/`ready` environment. The disconnect case P4
  exercised is untouched: nothing reassigns `hostId` on a bare
  disconnect, and the staleness P4 found is confirmed still live on
  current `main` — `listEnvironments` remains an unjoined flat select,
  and the new provisioning state machine's `ready` branch never checks
  host connectivity. The only staleness fix that shipped
  (`markHostEnvironmentsDestroyed`) fires solely when bb itself tears
  down an ephemeral machine it provisioned, not on an arbitrary
  disconnect — P4's finding stands exactly as written.
- **design-position-and-probes.md, C6.** Confirmed as the *shipped*
  mechanism, not superseded. `apps/host-daemon/src/identity.ts` has a
  zero-line diff since this branch's base commit; `upsertHost` is still
  the same `hostId`-keyed insert-or-update. #3274 adds `launchKey` /
  `phase` / `resource` columns on top of the existing `hosts` row for
  machine-provider orchestration — not a new identity table; the
  migration's backfill literally copies the existing `hostId` into the
  new `resource.hostId` field. Both orchestration gaps P6 flagged are now
  closed: `install-machine.sh`'s already-joined fast path starts a
  daemon, and #3274 adds a first-class `--start`/`--stop`/`--uninstall
  --host-id` lifecycle action. Not confirmed either way in this pass:
  whether the loopback-only `/internal/hosts/enroll-key` "data dir fully
  lost" reclaim path got a real authenticated surface — worth a
  follow-up check before calling that gap closed.
- **design-position-and-probes.md, P5.** Unaffected, still the highest-value
  open probe. The new Modal sandbox provider's "same-host resume" is a
  `snapshotFilesystem()` + `terminate()` + reboot-from-image cycle —
  process death, filesystem-only survival, daemon reconnection explicitly
  re-driven through the same persisted-`auth.json` path P6 validated. That
  is evidence for C6, not a test of C2 or of a real process-tier
  freeze/thaw (dropped WebSocket, clock skew, expired token). Nothing that
  shipped exercises what P5 asks.
- **environment-capability-model.md, axes table — workspace
  materialization.** Marked resolved. All three bundled provider plugins
  (git-worktree, personal-workspace, project-checkout) now compute paths
  from a fixed, validated formula rooted at the daemon's `dataDir` (e.g.
  `<dataDir>/worktrees/<pathKey>/<repoDirName>`), landed by #3227. The
  "no canonical-path convention" gap this doc flagged is closed, per
  provider plugin rather than one host-wide scheme.
- **environment-capability-model.md, axes table — credential acquisition.**
  `injected` moved from "nothing" to a real, shipped mechanism: an
  AES-256-GCM encrypted machine-environment store (#3274), admin-settable
  via CLI/UI, delivered to agent turns and, as of the same window's
  `3f7729443`, synced into the daemon's own process env on
  connect/reconnect. Structurally the same shape the Coder validation
  proposed as a template to copy. Still open, untouched by any of this:
  whether a provider's own auth/health check (Keychain-only for Claude
  Code, file-only for Codex, per P2) actually honors an injected
  credential for a live turn.
- **environment-capability-model.md, axes table — lifecycle autonomy.**
  Partially resolved, with the boundary now precise. #3274 adds a real
  `hosts.phase` state machine
  (`creating/active/suspending/suspended/resuming/removing/destroyed`)
  with a distinct "known-good maintenance" signal, separate from the
  crash/disconnect path — but only for idle-stop *bb itself* initiates
  (the Modal provider's own idle timer calls `experimental_suspend`
  through bb's scheduler). A runtime's own autonomous stop, invisible to
  bb and colliding with the 5s/30s disconnect grace windows — the
  original Daytona/Coder framing — is still unaddressed by anything in
  this window.
- **environment-capability-model.md, "Open" section.** Two items closed
  (canonical-path convention, credential-injection delivery, both above).
  "Daemon identity persistence across compute recreation" reclassified
  from candidate property to shipped feature — see C6 above. Everything
  else in Open (P5, external lifecycle-autonomy, `requirePrimaryHostId`
  unification, provider health checks ignoring env vars, license-gated
  capability) stands unchanged.

## 2026-09-02

- **design-position-and-probes.md — C6 added, confirmed same day.** New
  sixth load-bearing claim, prompted by the Coder validation surfacing that
  bb's daemon already separates a durable host credential from ephemeral
  session state. P6 confirmed it live against two containers (data-dir
  survives, and data-dir fully lost) — see Part 2 and Part 3.
- **design-position-and-probes.md — P1, P2, P3, P4, P6 answered.** Five of
  six probes (all but P5, which needs Daytona credits) run against real
  execution — source reads followed by live Docker containers, not
  documentation alone. Full results in Part 3.
- **design-position-and-probes.md, Part 1 ("Liveness is a property of
  requests, not entities").** P4 sharpened this: staleness reaches a
  thread's own detail payload (the embedded `environment` object), not just
  list views — the dedicated status endpoint 502s immediately for a
  disconnected host while the thread detail keeps reporting a live status
  for over a minute.
- **design-position-and-probes.md, Part 1.** Added a note that C6 narrows
  C3's urgency: a good chunk of "the machine is gone" is now a wiring gap
  (`install-machine.sh`, a CLI/UI surface for `enroll-key`), not an
  unsolved design problem.
- **design-position-and-probes.md, Part 2, C3.** Narrowed from "cwd and
  nothing else machine-specific" to "path identity plus harness-stamped
  context." P3 found a live session transcript carrying literal
  account/machine fingerprints (sandbox policy paths, global config,
  MCP/skill listings) that would be *wrong*, not just irrelevant, on
  another machine.
- **design-position-and-probes.md, Part 2.** Noted C1 (daemon-alongside is
  sufficient) has never been directly probed — every probe in the set ran
  daemon-alongside, because it's the only topology bb has.
- **environment-capability-model.md, axes table.** State durability and
  persistence provider values independently confirmed against a second,
  disjoint runtime (Coder) — a Docker template landed on
  `filesystem`/`self-managed`, the clean opposite pole from Daytona's
  `pause`/`service-managed`.
- **environment-capability-model.md — "Runtime validation 2: Coder" section
  added.** Full write-up of the Coder pass: self-hosted locally, a real
  `coder stop`/`start` cycle, agent-identity decoupling from container
  lifecycle, and its credential and port-exposure patterns.
- **environment-capability-model.md, Open section.** "Daemon identity
  persistence across compute recreation" candidate property confirmed by
  P6/C6 — the mechanism exists end-to-end and needs no new server
  protocol; what remains is orchestration and a CLI/UI surface
  (`project:bb` task 492).
- **remote-execution-research.md, §5 finding 3** (`Environment.hostId` is
  immutable, "no re-provision/migration path if a host disappears").
  Narrowed by C6/P6: a host reclaiming its own identity on fresh compute
  doesn't need `Environment.hostId` to move. Reassigning an environment to
  a genuinely *different* host is still unaddressed.
- **remote-execution-research.md, §7 Assessment.** Same narrowing:
  same-identity reconnection already covers the disposable-container
  resume case this section worried about most; cross-host thread moves
  still have no mechanism.
- **host-locality-leaks-survey.md, §1a** (`requirePrimaryHostId`). Linked
  to C6 as the same underlying "no first-class reconcilable host identity"
  gap; `project:bb` task 492 tracks a unified fix.
- **Repo structure.** Moved the five environments-design docs from
  `docs/notes/` into `docs/notes/environments/`, added a README with
  reading order and current status. `environments-design-position-and-
  probes.md` was renamed to `design-position-and-probes.md`;
  `environments-remote-execution-research.md` was renamed to
  `remote-execution-research.md`.

## 2026-08-31

- **design-position-and-probes.md, P1** (node-pty gates enrollment).
  Falsified more strongly than expected: the daemon binary itself cannot
  reach a running state without `node-pty` loading, not just the
  installer's explicit check.
- **design-position-and-probes.md, P2** (injected API key). Split into two
  answers: bb's plumbing delivers an injected env var to the provider
  process (confirmed), but neither Claude Code's nor Codex's own readiness
  check consults it — both would report `"unauthenticated"` regardless of
  an injected key. Whether that's cosmetic or actually blocks a turn was
  left open (no live provider call was made).
- **design-position-and-probes.md, P3** (session portability). Partially
  falsified: a live Claude Code session transcript carries no
  machine-specific data at the per-turn level beyond `cwd`, but does carry
  an embedded `sandbox_instructions` attachment with real account/machine
  fingerprints (this account's absolute paths, `DARWIN_USER_TEMP_DIR`).
- **design-position-and-probes.md, P4** (host vanishing mid-turn).
  Partially confirmed, one layer worse than expected: `bb machine show`
  and `bb environment status` both update within seconds of a `docker
  kill`, but a thread's own embedded `environment` object stayed stale
  ("ready") for well over a minute.

## 2026-08-30

- **host-locality-leaks-survey.md, §1c.** Corrected: bb does have a
  port-exposure primitive (`bb.hosts.declareSharedPorts`/
  `ensureSharedPortTunnel`); the leak is narrower than first thought — the
  link rewriter just doesn't use it.
- **host-locality-leaks-survey.md, §5.** Corrected: a project *can* be
  brought to a new host, via `POST /projects/:id/sources` with `type:
  "clone"`. The original claim ("nothing clones one") missed this because
  the survey only grepped the `host.*` daemon-command namespace and missed
  `project.clone`; see design-position-and-probes.md Part 5 for the
  resulting standing methodology note.
- **host-locality-leaks-survey.md, "Ranked read on what's actually
  blocking."** Superseded by the axes-based model in
  environment-capability-model.md, once the two corrections above and the
  container spike (research notes §8) invalidated its top-ranked item.
  Original ranking, for the record:
  1. ~~Project can't exist on a new host (§5) — everything else is
     downstream.~~ Wrong.
  2. The spawn's ambient contract (§3).
  3. `requirePrimaryHostId` as an implicit default (§1a/1b).
  4. No port/URL story for a remote host (§1c), no reachability model
     beyond the manual ssh-target mapping (§4b).
  5. Per-host bootstrap (§6) — credentials, skills, MCP.
- **environment-capability-model.md, axes table.** Revised after the
  Daytona pass: the original durability scale (roughly "ephemeral vs.
  persistent") was too coarse and became four tiers
  (`none`/`filesystem`/`filesystem-offloaded`/`process`); two axes
  (persistence provider, lifecycle autonomy) were added that hadn't been
  identified before.

---

Kept for orientation, not for citation — each doc states its own current
understanding. Use `git log -p -- docs/notes/environments/<file>` for the
literal diffs behind any entry above.
