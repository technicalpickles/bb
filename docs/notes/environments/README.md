# Environments: containers, remote/sandboxed execution, and host locality

Design work on running bb agents somewhere other than "the same machine as
the human," prompted by a Discord discussion (#containers, started by
technicalpickles 2026-08-23) about containers/VMs/cloud sandboxes. Started
from Sawyer's framing that `Environment` "should be pluggable"; the research
here checked that claim against the actual implementation and landed
somewhere different.

**Current position:** a runtime declares what it can do, and bb adapts.
There is no new pluggable `Environment` type and no per-provider integration
in the core — every question that looked like it needed one ("volumes or
snapshots?", "daemon inside or outside?") turned out to be a per-runtime
capability in disguise. See
[design-position-and-probes.md](design-position-and-probes.md) for the full
statement, six load-bearing claims (C1–C6), and the falsification probes
run against them (five of six answered via real execution, not just source
reading, as of 2026-09-02).

## Reading order

1. [remote-execution-research.md](remote-execution-research.md) — where this
   started: a research pass through the codebase checking whether
   `Environment` is actually pluggable (it isn't — it binds a workspace
   directory to a host and nothing more), plus §8, the first container
   spike (39s from `docker run` to `connected`).
2. [host-locality-leaks-survey.md](host-locality-leaks-survey.md) — a
   companion survey for code that quietly assumes the server, host daemon,
   agent process, workspace, and browser all live on one machine.
3. [container-and-remote-environments.md](container-and-remote-environments.md) —
   a narrower spike on whether plugins can wrap *how* an agent process gets
   spawned, as a building block for daemon-across topologies.
4. [environment-capability-model.md](environment-capability-model.md) — the
   working draft: nine capability axes, two runtime validations (Daytona,
   Coder), and what's still open.
5. [design-position-and-probes.md](design-position-and-probes.md) — the
   clean statement of where the design stands, six claims, and the probes
   built to falsify each one. Start here if you only read one file; it
   links back into the other four for evidence.

## Status

Nothing here is committed as a spec. Five of six probes (P1–P4, P6) are
answered against real execution. Only **P5** (Daytona pause/resume with a
live enrolled daemon) remains open — it needs cloud credits and tests C2,
the strongest and least-verified claim in the design.

Open follow-up work is tracked in taskwarrior (`task project:bb list`):
two bugs found along the way (`install-machine.sh`'s already-joined branch
never starts a daemon; a `pnpm bb:dev` CLI arg-parsing bug), one design
pass (unifying `requirePrimaryHostId` with C6's host-identity-reclaim
mechanism), one feature (exposing the internal host-reclaim route through a
real CLI/UI surface), and P5 itself.
