# Changelog: bb environments design notes

Dated record of corrections, revisions, and confirmations to the docs in
this directory. Each entry names what changed, why, and which doc/section
it affected. The docs themselves state current understanding, not the
history of how they got there — use this file for that.

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
