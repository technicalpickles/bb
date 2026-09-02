# Container and remote environments — notes

Exploring whether plugins can wrap *how* an agent process gets spawned, as a
building block for running agents in containers or other remote/isolated
environments (e.g. spawn `direnv exec`, `mise exec`, a container-exec
wrapper, etc. in front of the real agent command instead of the daemon
invoking the agent binary directly).

## Current state (as of 2026-08-30, main @ f4bbc2fe8)

**No hook exists to wrap the spawn of an existing built-in provider.**

- Claude Code provider spawns directly: [`plugins/provider-claude-code/src/bridge/sdk-session.ts:123`](../../plugins/provider-claude-code/src/bridge/sdk-session.ts) — `spawnRecordedClaudeProcess()` calls `spawn(args.spawnOptions.command, args.spawnOptions.args, ...)`, overriding the `@anthropic-ai/claude-agent-sdk`'s own default spawn. `command`/`args` come from the SDK itself, not from any plugin-exposed config.
- Codex provider spawns directly: [`plugins/provider-codex/src/bridge/app-server-connection.ts:95`](../../plugins/provider-codex/src/bridge/app-server-connection.ts) — same pattern.
- Generic "pi" bridge: [`plugins/provider-pi/src/bridge/rpc-child.ts:72,122`](../../plugins/provider-pi/src/bridge/rpc-child.ts) — reads command from `PI_BRIDGE_COMMAND_ENV` and spawns.

None of these three take a plugin-supplied wrapper/launcher command. They're internal to each provider plugin's own bundled bridge code.

## Closest existing extensibility point: `AcpLaunchSpec`

A plugin can register a brand-new provider via `bb.providers.register(declaration: PluginProviderDeclaration)` ([`packages/plugin-sdk/src/backend-contract.ts:735,979`](../../packages/plugin-sdk/src/backend-contract.ts)). For providers built on the generic ACP bridge, the declaration includes a full launch spec:

```ts
// packages/provider-bridge-acp/src/launch-spec.ts (~line 33-50)
acpLaunchSpecSchema // command: string, args: string[], env: Record<string, string>, cwd?: string
```

Re-exported to plugins as `AcpLaunchSpec` from `@get-bb/plugin-sdk/provider-bridge/acp`
([`packages/plugin-sdk/src/provider-bridge-acp.ts:17`](../../packages/plugin-sdk/src/provider-bridge-acp.ts),
[`packages/plugin-sdk/src/app-contract.ts:389-392`](../../packages/plugin-sdk/src/app-contract.ts)).

This is genuinely "spawn this command with these args/env" — a plugin registering an ACP-family agent could set `command` to a wrapper binary (e.g. a container-exec shim) and put the real agent invocation into `args`, achieving a wrap/launcher effect.

**Limitation:** only applies to *new* agents registered through the ACP path. It does not let you intercept or wrap the spawn of the built-in `claude`/`codex` providers — those remain hardcoded with no override slot.

`docs/api_to_audit.md` (~line 110) references the ACP launch spec history but nothing about a spawn-wrapping hook for built-in providers specifically.

## Open questions / possible directions

- Would a `beforeSpawn`-style hook (letting a plugin rewrite `command`/`args`/`env` for *any* provider, not just ACP-registered ones) be the right shape, or should built-in providers (claude, codex) themselves grow an `AcpLaunchSpec`-like override?
- Server/daemon boundary (per [`AGENTS.md`](../../AGENTS.md)): "runtime/session management, and workspace execution" is daemon's job — a spawn-wrapping hook would live in the daemon's provider-launch path, with the server possibly supplying policy (e.g. "run this thread's agent in a container") but not owning the raw spawn.
- If/when this becomes a real API, it needs an `experimental_` prefix and an entry in `docs/api_to_audit.md` per the Plugin API guideline in `AGENTS.md`.
