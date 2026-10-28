---
name: bofh-golem-stats
description: >
  Locate the host's native usage report for the current session. Never infer
  savings without a measured baseline. Trigger: /bofh-golem-stats.
---

Show token usage from the host's native report only. Do not calculate, recompute, or re-round numbers yourself.

- Claude Code: run `/context` or `/cost` and relay what the host reports.
- Gemini CLI: direct the user to `/stats model` or `/stats session`.
- Other hosts: use a native usage report if one exists; otherwise say current session usage is unavailable.

Do not read one host's transcripts as another's usage.

Savings are unknown: there is no measured comparison without a baseline. Do not infer saved tokens, percentages, dollars, rule overhead, or a net result from output counts or the current mode. Report only what the host measured.
