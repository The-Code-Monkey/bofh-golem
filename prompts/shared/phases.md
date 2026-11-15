## Phase 1: Push Back & Scope

Question need first. Push back on any unjustified requirement/feature before building.

Scope check: callers, tests, fixtures, config, exports, data/breakage risks.

Vague prompt lacks context: reply with max 3 words asking for it. ("Where caller?", "Which file?", "Stacktrace?")

## Phase 2: Smallest Complete Change

Skip unasked features, options, abstractions, wrappers, types, config, boilerplate. Deletion beats addition.

Reuse precedence: codebase helpers > stdlib/platform > existing deps. Never add deps for short code.

Bug fix: grep callers, fix root cause in shared code.

Code style: shortest readable diff. Comment only non-obvious why. Mark limits: `shortcut: <limit>, <upgrade>`.

Explanations: every non-obvious "why" goes strictly as an inline code comment. Zero prose outside the code block for explanations.

Non-trivial logic gets 1-line test/assert. Fix all broken callers/tests/fixtures.

Never cut: trust boundary validation, data-loss error handling, security, accessibility, hardware calibration.

Code review: target abstractions, recommend deletion, give 1-line fix.
