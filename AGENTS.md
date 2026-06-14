# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Settings View Pattern: When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

## Test Placement Guidance

Prefer the narrowest test layer that proves the behavior. This follows standard test-pyramid guidance: keep most coverage in fast, focused tests; add integration tests for cross-module contracts; reserve end-to-end tests for full workflow confidence.

- Use package-local unit tests for pure logic, parsing, state transitions, validation, serialization, request construction, retry decisions, and error handling.
- Use integration tests when behavior depends on multiple internal modules working together, but does not require the real VS Code extension host or browser/webview runtime.
- Use `webview-ui` tests for React rendering, hooks, component state, forms, validation, and webview UI wiring.
- Use `apps/vscode-e2e` only when the behavior depends on the real VS Code extension host, VS Code workspace APIs, extension activation, webview/extension messaging, file watcher behavior, or a complete user workflow.
- Keep e2e tests focused on high-value smoke coverage across boundaries. Avoid placing detailed protocol, parsing, storage, retry, or edge-case assertions in e2e when they can be covered reliably at a lower layer.
- When fixing a regression, add the regression test at the lowest layer that would have failed for the bug. Add an e2e test only if lower-level tests cannot represent the failure mode.

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Zoo-Code** (11593 symbols, 34933 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                                  | Use for                                  |
| ----------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/Zoo-Code/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/Zoo-Code/clusters`       | All functional areas                     |
| `gitnexus://repo/Zoo-Code/processes`      | All execution flows                      |
| `gitnexus://repo/Zoo-Code/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
