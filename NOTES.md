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
- [x] 0c. /analyze.md 3 confirmed (LumiWorld patterns)
- [x] 0d. /analyze.md 4 confirmed (mapping), then PLAN.md steps rewritten
- [x] 1. Minimal extension loads in Lumiverse (PLAN.md Step 1: scaffold, root spindle.json,
      minimal backend; also 2, 3, 4, 5a-c, 6a, 6b, 7 per rewritten PLAN.md)
- [x] 2. PLAN.md Step 2 — settings stub (one setting via spindle.storage global/settings.json)
- [x] 3. PLAN.md Step 3 — read a bounded chat window (spindle.chats.getActive + getMessages)

## Done Log
(Newest first: step / what changed / files / test result / tag)
- 3 / bounded chat window: CHAT_CHANGED handler reads active chat via getActive(userId) +
  getMessages; userId taken from event handler's 2nd argument (fix commit 4aa1ca7) /
  lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json / install+restart test
  PASSED (confirmed by me) / step-3 (tagged on 4aa1ca7)
- 2 / settings stub: one global settings file via spindle.storage (operator-scoped — no userId;
  userStorage was rejected at test), fix commit f6227b3 / lumiverse/src/backend.ts,
  lumiverse/dist/backend.js, PLAN.md / install+restart test PASSED (confirmed by me) / step-2
- 1 / scaffold: root spindle.json + lumiverse/ backend (bun + tsc, dist committed) /
  spindle.json, lumiverse/{package.json,tsconfig.json,src/backend.ts,dist/backend.js,bun.lock},
  .gitignore / build + install test PASSED (confirmed by me) / step-1
- 0d / mapping + PLAN steps rewritten per decisions (in-interceptor pipeline; root spindle.json;
  one combined block) / docs/port/MAPPING.md, PLAN.md / confirmed by me / step-0d
- 0c / LumiWorld patterns analysis / docs/port/LUMIWORLD_PATTERNS.md / confirmed by me / step-0c
- 0b / Lumiverse capabilities analysis / docs/port/LUMIVERSE_CAPABILITIES.md / confirmed by me / step-0b
- 0a / ST touchpoints analysis / docs/port/ST_TOUCHPOINTS.md / confirmed by me / step-0a
- step-0 / overlay, docs, LumiWorld clone / .clinerules/, tools/, NOTES, PLAN, SETUP, .gitignore / docs copied (COPIED.txt present) / step-0

## Current Step
- 4: PLAN.md Step 4 — one generate.raw JSON call on a fixed connection id

## Next Step
- /step.md 4 (implement + test, then /scribe.md step-4)

## Known Issues
- events.md:26 says the CHAT_CHANGED payload is { chatId }; observed runtime payload keys are:
  chat, changedFields.
- getActive(userId?) and the event handler's 2nd userId argument are not in the docs (types
  only: spindle-api.d.ts:911, :174/:210); confirmed working at runtime (operator-scoped ext).
- getMessages has no userId parameter (spindle-api.d.ts:494-495).
- CHAT_CHANGED also fires on message changes (send, edit, delete, swipe), sometimes several
  times per action, not only on chat switches.
- No startup read: the window is empty until the first CHAT_CHANGED event. In memory only.
- Temporary payload-key-names log in the CHAT_CHANGED handler — remove later.
- Step 4 (generate.raw) must reuse the userId from the event handler's 2nd argument.
- Settings live in spindle.storage (shared extension dir, storage.md:73, 81). If per-user
  settings are ever needed, that means userStorage + explicit userId (storage.md:83, 118-125).
- Before Step 5 starts: (1) add the data flow and where the model-call prompt and JSON parsing
  come from (suggest a minimal hand-written prompt in 6b); (2) say which sub-step holds the
  fixed mini-deck; (3) give exact end lines for the EOF ranges, a dependency list per sub-step,
  and the test command.
- GitHub push: push works from the user's own PowerShell; Cline never pushes.
- Analysis 1 confirmed: only index.js + hosts/sillytavern/* + ui.mjs are host-bound; rest is PURE.
  Packet = 3 named prompt keys; unit-testable logic lives outside tests/ (assert scripts in tools/).
- Analysis 2: interceptor timeout default 10 s (manifest override max 5 min); optional interceptor
  timeouts drop changes silently. spindle.json at repo root; dist/ auto-built (bun) if missing.
  Model calls: spindle.generate.raw(connection_id)/quiet/batch; no native card-deck equivalent.
- Analysis 3: LumiWorld ships pipeline-in-interceptor with interceptorTimeoutMs 300000 and
  internal per-phase budgets; dist/ committed; commit deferred to GENERATION_ENDED, discarded
  on GENERATION_STOPPED; single named breakdown entry; revision-based settings autosave.

## Last Working Version
Tag: step-3 (commit 4aa1ca7)
Go back with: git reset --hard step-3
