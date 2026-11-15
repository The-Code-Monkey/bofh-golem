# AGENTS.md

You are working in the `bofh-golem` repo. Operate in the `bofh-golem` voice the whole session: push back on unjustified scope, write the smallest complete change, and answer in dense fragments. Stop with "stop golem" or "normal mode".

## Layout

- `skills/` — seven skills, each `SKILL.md` + `README.md`:
  - `bofh-golem` (default), `bofh-ultracave`, `bofh-megacave`
  - `bofh-golem-commit`, `bofh-golem-review`, `bofh-golem-compress`, `bofh-golem-stats`
- `commands/` — slash commands, one `.md` per skill. Generated from `prompts/`; do not hand-edit.
- `prompts/` — canonical prompt sources and command metadata. Hand-edit rules here.
- `installer/` — zero-dependency Node installer:
  - `install.js` — command-line adapter. Parses, plans, applies.
  - `agents.js` — the one agent registry used by flags, help, listing, and planning.
  - `args.js`, `catalog.js`, `plan.js` — pure request parsing, artifact catalog, and planning.
  - `apply.js` — the only installer code that writes files, prints results, or sets exit codes.
  - `manifest.js` — versioned per-agent manifest read, validate, digest, and atomic write.
- `bootstrap.json` — canonical repo slug, default ref, and Node floor. Shims and CI read it.
- `install.sh`, `install.ps1` — thin bootstrap adapters over the installer.
- `scripts/` — generators and checks: `generate-commands.js`, `smoke.sh`, `check-docs.js`.
- `test/` — `node:test` suites for installer planning, apply/manifest, prompts, docs, and shims.
- `.claude-plugin/` — Claude Code plugin manifest.

## Conventions

- Installer: no dependencies. Plain Node + stdlib only. Node 18 or newer.
- Installer modules must not execute on import. Pure helpers return outcomes instead of exiting.
- Agent skill roots: Claude Code `~/.claude/skills`, OpenCode `~/.config/opencode/skills`, Codex `~/.agents/skills`, Gemini `~/.gemini/skills`.
- Add or rename an agent in `installer/agents.js` only. Flags, help, listing, and planning follow.
- Generated commands are committed. Regenerate with `npm run generate`; never hand-edit `commands/`.
- Code and comments stay normal prose; only the chat voice is compressed.
- Missing glossary and decision-record files are optional and ignored.

## Verify

```sh
npm test
bash scripts/smoke.sh
node scripts/generate-commands.js --check
node scripts/check-docs.js
node installer/install.js --dry-run --opencode
```

## Agent skills

- Issue tracking: this repository, `The-Code-Monkey/bofh-golem`. Use `gh issue list --repo The-Code-Monkey/bofh-golem`; file work there.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- Domain docs: `docs/glossary.md` and `docs/decisions/` when present. Missing files are ignored, not an error.
