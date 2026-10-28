---
name: bofh-golem-compress
description: >
  Compress a memory file such as CLAUDE.md or a todo list into golem format to
  save input tokens, keeping a readable backup. Trigger: /bofh-golem-compress.
---

# bofh-golem-compress

## Purpose

> **Data leaves the machine.** Compression sends the file's full text to the model provider configured for the agent. Files whose names look like secrets (`.env`, `credentials`, `secrets`, `.netrc`, …) are refused before they are read. Don't compress a file the provider shouldn't see.

Compress natural language files (CLAUDE.md, todos, preferences) into golem-speak to reduce input tokens. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md` beside the source file.

## Trigger

`/bofh-golem-compress <filepath>` or when user asks to compress a memory file.

**Requires an explicit filepath.** If the user pastes raw text instead of naming a file, do NOT improvise an inline compression — ask them for the filepath to compress, or offer to save the pasted text to a file first. Never let reasoning/commentary leak into the saved file.

## Process

1. Back up original to `<filename>.original.md`.
2. Compress the prose with the rules below.
3. Overwrite the original with the compressed text.
4. Report byte/token delta, one line. Never claim provider savings without a measured baseline.

## Compression Rules

### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure", "the reason is because" → "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links (full URLs, markdown links)
- File paths (`/src/components/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`, `docker build`)
- Technical terms (library names, API names, protocols, algorithms)
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

### Preserve Structure
- All markdown headings (keep exact heading text, compress body below)
- Bullet point hierarchy (keep nesting level)
- Numbered lists (keep numbering)
- Tables (compress cell text, keep structure)
- Frontmatter/YAML headers in markdown files

### Compress
- Use short synonyms: "big" not "extensive", "fix" not "implement a solution for", "use" not "utilize"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets that say the same thing differently
- Keep one example where multiple examples show the same pattern

CRITICAL RULE:
Anything inside ``` ... ``` must be copied EXACTLY.
Do not:
- remove comments
- remove spacing
- reorder lines
- shorten commands
- simplify anything

Inline code (`...`) must be preserved EXACTLY.
Do not modify anything inside backticks.

If file contains code blocks:
- Treat code blocks as read-only regions
- Only compress text outside them
- Do not merge sections around code

## Pattern

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

Compressed:
> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

## Boundaries

- ONLY compress natural language files (.md, .txt, .typ, .typst, .tex, extensionless)
- NEVER modify: .py, .js, .ts, .json, .yaml, .yml, .toml, .env, .lock, .css, .html, .xml, .sql, .sh
- If file has mixed content (prose + code), compress ONLY the prose sections
- If unsure whether something is code or prose, leave it unchanged
- Original file is backed up as FILE.original.md before overwriting
- Never compress FILE.original.md (skip it)
