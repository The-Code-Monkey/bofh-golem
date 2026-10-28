# bofh-golem

Ultra-lazy BOFH senior dev + maximum golem compression. Minimal code, maximum pushback, zero fluff.

A skill pack for coding agents. One install, seven skills.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.sh | bash
```

Windows, PowerShell 5.1+:

```powershell
irm https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.ps1 | iex
```

Local clone:

```sh
bash install.sh
# or
node installer/install.js
```

Needs Node.js >= 18. Detects Claude Code, OpenCode, Codex, Gemini CLI. Copies each skill's `SKILL.md` + `README.md` into the agent's skills dir. `--dry-run` reports, changes nothing. `--uninstall` removes them.

Agent skill roots:

| Agent | Path |
|-------|------|
| Claude Code | `~/.claude/skills` |
| OpenCode | `~/.config/opencode/skills` |
| Codex | `~/.agents/skills` (interop standard) |
| Gemini CLI | `~/.gemini/skills` |

Codex skills are experimental: enable `[features] skills = true` in `~/.codex/config.toml`, then restart. Gemini and Codex also read the `~/.agents/skills` alias.

## Skills

| Skill | Command | What it does |
|-------|---------|--------------|
| `bofh-golem` | `/bofh-golem` | Ultra-lazy senior dev + golem compression. Default. |
| `bofh-ultracave` | `/bofh-golem ultra` | Same lazy logic, grammar stripped. One word when enough. |
| `bofh-megacave` | `/bofh-golem wenyan` | Same lazy logic, Classical Chinese (文言文). |
| `bofh-golem-commit` | `/bofh-golem-commit` | Conventional Commits, intent only. |
| `bofh-golem-review` | `/bofh-golem-review` | One line per finding. Recommend deletion. |
| `bofh-golem-compress` | `/bofh-golem-compress <file>` | Compress a memory file, keeps a backup. |
| `bofh-golem-stats` | `/bofh-golem-stats` | Locate the host's native usage report. |

## Behavior

1. **Push back.** Question need first. Skip unasked features, options, abstractions, wrappers, boilerplate. Deletion beats addition.
2. **Smallest complete change.** Reuse codebase helpers > stdlib > deps. Never add deps for short code. Fix root cause in shared code.
3. **Golem output.** Dense fragments. Payload verbatim. One word when enough. Zero fluff.

Never cut: trust boundary validation, data-loss error handling, security, accessibility, hardware calibration.

Stop it with `stop golem` or `normal mode`.

## Claude Code plugin

```
claude plugin marketplace add The-Code-Monkey/bofh-golem
claude plugin install bofh-golem@bofh-golem
```

The plugin manifest is for discoverability; skills land in `~/.claude/skills` via the installer.

## Installer

```
node installer/install.js --list        # show detected agents
node installer/install.js --dry-run     # report, change nothing
node installer/install.js --opencode    # one agent only
node installer/install.js --uninstall   # remove skills
```

## License

[GPL-2.0](./LICENSE)
