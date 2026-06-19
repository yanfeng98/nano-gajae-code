# @gajae-code/coding-agent

Core implementation package for the `gjc` coding agent in the `gajae-code` monorepo.

For installation, setup, provider configuration, model roles, slash commands, and full CLI reference, see:
- [Monorepo README (local)](../../README.md)
- [Monorepo README (GitHub)](https://github.com/can1357/gajae-code#readme)

Package-specific references:
- [CHANGELOG](./CHANGELOG.md)
- [DEVELOPMENT](./DEVELOPMENT.md)
- [RenderMermaid guide](../../docs/render-mermaid.md)

## Memory backends

The agent supports two memory backends, selected via the `memory.backend` setting (Settings → Memory tab, or `~/.gjc/config.yml`):

- `off` (default) — no memory subsystem runs.
- `local` — existing rollout-summarisation pipeline; writes `memory_summary.md` and consolidated artifacts under the agent dir.

Switching backends mid-session is honoured on the next system-prompt rebuild and the next `/memory` slash command. Existing users with `memories.enabled = true|false` are migrated to `memory.backend = "local"|"off"` exactly once on first launch.

## Red-claw TUI theme

The interactive TUI defaults to the bundled `red-claw` crustacean theme for dark terminals and the bundled `blue-crab` theme for light-appearance terminals, with matching welcome/icon assets. Explicit user theme settings still win; set `theme.dark: red-claw` and `theme.light: blue-crab` in `~/.gjc/agent/config.yml` to pin them.
