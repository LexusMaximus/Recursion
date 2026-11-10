# NOTES.md
> Single source of truth. Under 150 lines. Factual and terse. Update only after a step's test PASSES (or an analysis is confirmed).

## What It Does
Port of MentallyQuill/Recursion (SillyTavern extension: pre-generation scene reasoning,
card deck, prompt packet, optional post-process rewrite) into a Lumiverse (Spindle)
extension. My fork, branch `lumiverse-port`. The original ST source stays intact.

## How It's Organized
| Path | Job |
|---|---|
| src/, styles/, schemas/, tests/ | Recursion ST source. Read-only until a step names a module. src/ = 111 files in 11 subfolders |
| docs/ (Recursion's own) | Architecture, technical, design and user docs. Start at docs/DOCUMENTATION_INDEX.md |
| docs/lumiverse/ | Verbatim Lumiverse developer docs (API truth). Git-ignored, made by tools/ script |
| docs/port/ | Analysis outputs (ST touchpoints, capabilities, patterns, mapping) |
| reference/LumiWorld/ | Pattern reference only. Git-ignored |
| lumiverse/ | New extension code (location is an assumption, see PLAN.md) |
| AGENTS.md | Recursion's own agent notes. Read only in /adopt.md and /analyze.md 1 |

## Project Scope
- Goal: Lumiverse extension that reproduces Recursion's core pre-generation flow.
- Done-when (draft, confirm after analysis 4): extension installs in Lumiverse; on one real
  chat the interceptor injects a named card-guidance block that shows in Prompt Breakdown.
  Unit checks only if analysis 1 finds testable host-independent logic.
- First cut: pre-process only, ONE pipeline mode, small fixed deck, one Lumiverse connection.
- Out of scope until the core works: post-process rewrite, enhancement/editorial, redirect,
  resumable pipeline and cache, Full Viewer, drag/mobile UI polish.

## Standing Rules
- I'm the manager. I own the plan and scope.
- Simple only. One step at a time. No stacked fixes.
- Spindle APIs only from docs/lumiverse/. Missing = "not found in docs" and ask me.
- List files before touching them.
- Full rules live in .clinerules/ (00 = general, 01 = Lumiverse port)

## Samples and Docs
| File | What it shows |
|---|---|
| docs/lumiverse/ref/ | Core Spindle docs (manifest, permissions, interceptors, generation, decisions, storage) |
| docs/lumiverse/ref-later/ | Events, chat mutation, UI placement, frontend communication |
| reference/LumiWorld/ | A working Spindle extension to copy patterns from |
| docs/technical/HOST_INTEGRATION_MANUAL.md | How Recursion touches SillyTavern |
| docs/technical/PROMPT_PACKET_AND_INJECTION.md | What Recursion injects into the prompt |
| docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md | Recursion's model-call lanes |
| docs/port/*.md | Analysis outputs (once written) |
| docs/DOCUMENTATION_INDEX.md | Canonical map of Recursion docs |

## Steps
- [x] 0. Scaffold committed and tagged step-0
- [x] 0a. /analyze.md 1 confirmed (ST touchpoints)
- [x] 0b. /analyze.md 2 confirmed (Lumiverse capabilities)
- [ ] 0c. /analyze.md 3 confirmed (LumiWorld patterns)
- [ ] 0d. /analyze.md 4 confirmed (mapping), then PLAN.md steps rewritten
- [ ] 1. Minimal extension loads in Lumiverse (see PLAN.md)

## Done Log
(Newest first: step / what changed / files / test result / tag)
- 0b / Lumiverse capabilities analysis / docs/port/LUMIVERSE_CAPABILITIES.md / confirmed by me / step-0b
- 0a / ST touchpoints analysis / docs/port/ST_TOUCHPOINTS.md / confirmed by me / step-0a
- step-0 / overlay, docs, LumiWorld clone / .clinerules/, tools/, NOTES, PLAN, SETUP, .gitignore / docs copied (COPIED.txt present) / step-0

## Current Step
- 0c: /analyze.md 3 (LumiWorld patterns, attach @reference/LumiWorld)

## Next Step
- /analyze.md 3, then /scribe.md (N = 0c)

## Known Issues
- Code location undecided: lumiverse/ subfolder vs separate repo (check install layout in analysis 2).
- Kit .gitignore ignores dist/. Lumiverse may need built output: check in analyses 2-3.
- Interceptor timeout vs multi-call pipeline: unknown until analysis 2.
- Analysis 1 confirmed: only index.js + hosts/sillytavern/* + ui.mjs are host-bound; rest is PURE.
  Packet = 3 named prompt keys; unit-testable logic lives outside tests/ (assert scripts in tools/).
- Analysis 2: interceptor timeout default 10 s (manifest override max 5 min); optional interceptor
  timeouts drop changes silently. spindle.json at repo root; dist/ auto-built (bun) if missing.
  Model calls: spindle.generate.raw(connection_id)/quiet/batch; no native card-deck equivalent.

## Last Working Version
Tag: step-0b
Go back with: git reset --hard step-0b
