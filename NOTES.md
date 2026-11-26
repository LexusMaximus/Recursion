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
- [x] 4. PLAN.md Step 4 — one generate.raw JSON call on a fixed connection id
- [x] 5. PLAN.md Step 5 — PURE ports + assert tests (5a packet composition, 5b hand
      selection, 5c card validation; tags step-5a/5b/5c)
- [x] 6a. PLAN.md Step 6a — interceptor injects a hard-coded block (PASSED; tagged step-6a)

## Done Log
(Newest first: step / what changed / files / test result / tag)
- 6a / interceptor injects hard-coded "Recursion Guidance" block; permissions are now the old three plus interceptor / spindle.json, lumiverse/src/backend.ts, lumiverse/dist/backend.js / VERIFIED PASSED on OpenRouter: logs "interceptor: registered priority=100 timeoutMs=10000" and "interceptor: injected messageIndex=0 breakdownEntries=1 messageCount=13"; Prompt Breakdown showed "[1] SYSTEM" with "[Recursion Guidance] Step 6a test guidance." / tag step-6a (commit 3992b807941ba6f97f8ec026f51e2df2955d2034; local+remote verified)
- 5 / PURE ports + assert tests, one commit per sub-step: 5a packet composition (lumiverse/src/packet.mjs), 5b hand selection (lumiverse/src/cards.mjs), 5c card validation; shared dependency ports + fixed mini-deck (lumiverse/src/deck.ts). Facts: composeGuidanceForCards keeps source line 747 (its closing brace); cleanProviderPromptText is exported by deviation (src/cards.mjs:416 -> export at lumiverse/src/cards.mjs:760) /
  lumiverse/src/{card-selection,cards,core,deck.ts,instruction-safety,packet,safe-values,settings,settings-policy,story-form}.mjs, lumiverse/tests/{helpers,packet,cards,card-validation}.mjs, lumiverse/tsconfig.json / assert tests PASSED (bun lumiverse/tests/{packet,cards,card-validation}.mjs) / tags step-5a 154dacd, step-5b 8f9611a, step-5c 7fcb90f (no step-5 tag; notes commit is untagged)
- 4 / one generate.raw JSON call on fixed connection; JSON keys parsed; connectionId persisted to global/settings.json (commits 4d7b9be raw call, 2a93bfb userId in request, 239ee4d default profile + log) / lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json / install+restart test PASSED (user log: parsed keys status, test; persisted connectionId) / step-4 (tag on 239ee4d, applied after notes commit)
- 3 / bounded chat window: CHAT_CHANGED handler reads active chat via getActive(userId) + getMessages; userId taken from event handler's 2nd argument (fix commit 4aa1ca7) / lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json / install+restart test PASSED (confirmed by me) / step-3 (tagged on 4aa1ca7)
- 2 / settings stub: one global settings file via spindle.storage (operator-scoped — no userId; userStorage was rejected at test), fix commit f6227b3 / lumiverse/src/backend.ts, lumiverse/dist/backend.js, PLAN.md / install+restart test PASSED (confirmed by me) / step-2
- 1 / scaffold: root spindle.json + lumiverse/ backend (bun + tsc, dist committed) / spindle.json, lumiverse/{package.json,tsconfig.json,src/backend.ts,dist/backend.js,bun.lock}, .gitignore / build + install test PASSED (confirmed by me) / step-1
- 0d / mapping + PLAN steps rewritten per decisions (in-interceptor pipeline; root spindle.json; one combined block) / docs/port/MAPPING.md, PLAN.md / confirmed by me / step-0d
- 0c / LumiWorld patterns analysis / docs/port/LUMIWORLD_PATTERNS.md / confirmed by me / step-0c
- 0b / Lumiverse capabilities analysis / docs/port/LUMIVERSE_CAPABILITIES.md / confirmed by me / step-0b
- 0a / ST touchpoints analysis / docs/port/ST_TOUCHPOINTS.md / confirmed by me / step-0a
- step-0 / overlay, docs, LumiWorld clone / .clinerules/, tools/, NOTES, PLAN, SETUP, .gitignore / docs copied (COPIED.txt present) / step-0

## Current Step
- 6b: PLAN.md Step 6b — replace the static interceptor block with the real pipeline

## Next Step
- Settle the Step 6b blockers before implementation: determine how generate.raw resolves the
  profile model on both providers, and obtain a documented userId source for generate.raw.
  Decision 2 wording: the dist rebuild happens in 6a AND 6b (cumulative); 6a already rebuilt
  and committed dist/, and 6b will rebuild and commit dist/ again with the real pipeline
  (Step 5 modules + Step 4 call).

## Known Issues
- userId docs gap: GenerationRequestDTO.userId exists in types (api.d.ts:483-488) but not in generation.md:53-62; operator-scoped extensions must pass it inside the request object (LumiWorld backend.ts:986). The interceptor context userId exists only in installed types (api.d.ts:141), not docs (interceptors.md:152-166); 6b needs a userId for generate.raw.
- generate.raw with only connection_id fails on OpenRouter and custom profiles (provider 400: No models provided / model field is required); the failing custom profile is `Test` (model z-ai/glm-5.3-flash), while the custom koboldcpp profile worked end to end. Probe (untagged commit, user-verified): on OpenRouter nvidia/nemotron-3.5-super-vl:free, generate.raw with top-level provider and model from spindle.connections.get(connectionId, userId) plus connection_id SUCCEEDED, and generate.quiet with connection_id also succeeded. Decision: 6b uses raw-explicit (typed cast like LumiWorld backend.ts:982-993; docs: generation.md:7-18, 286-293 prose/examples; the DTO table generation.md:53-62 and api.d.ts:454-520 omit provider/model). Open: quiet may have used the active profile, not connection_id (the test profile was the default); custom profile retest pending Step 7 picker. Probe code in runStep4Once (quiet + raw-explicit variants and diag: logs) is temporary and is to be removed in 6b.
- INFERRED: NVIDIA NIM 401 "Invalid JWT serialization: Missing dot delimiter(s)" was a key/profile problem, not the extension (the extension has no access to headers or keys); the interceptor ran on the same message before the provider returned 401.
- The revoke/re-grant lifecycle of an interceptor is not documented (interceptorRegistered stays true; permissions.md:199-226).
- The failure-path probe (forced throw) was SKIPPED in 6a.
- The Step 4 fixture generate.raw call still fires once per process start and spends one request; remove or gate it in Step 6.
- connections.list order undocumented; selection rule: saved connectionId, else is_default profile, else first. Step 4 persists the first successful choice into global/settings.json (sticky). Step 7 picker needs a "use default" option that clears the saved id and never changes Lumiverse's own default.
- Minor: in runStep4Once, a persistConnectionId failure is logged as "failed at generate.raw" (stage not advanced before persist). Not fixed.
- "[runtime] critical memory pressure" lines appeared while a local 26B model ran; no sign they come from this extension. Lumiverse data disk 96.9% used.
- events.md:26 says the CHAT_CHANGED payload is { chatId }; observed runtime payload keys are: chat, changedFields.
- getActive(userId?) and the event handler's 2nd userId argument are not in the docs (types only: spindle-api.d.ts:911, :174/:210); confirmed working at runtime (operator-scoped ext).
- getMessages has no userId parameter (spindle-api.d.ts:494-495).
- CHAT_CHANGED also fires on message changes (send, edit, delete, swipe), sometimes several times per action, not only on chat switches.
- No startup read: the window is empty until the first CHAT_CHANGED event. In memory only.
- Temporary payload-key-names log in the CHAT_CHANGED handler — remove later.
- Settings live in spindle.storage (shared extension dir, storage.md:73, 81). If per-user settings are ever needed, that means userStorage + explicit userId (storage.md:83, 118-125).
- GitHub push: push works from the user's own PowerShell; Cline never pushes.
- Analysis 1 confirmed: only index.js + hosts/sillytavern/* + ui.mjs are host-bound; rest is PURE.
  Packet = 3 named prompt keys.
- Step 5 tests live in lumiverse/tests/ (bun lumiverse/tests/<module>.mjs; no framework, helpers.mjs); not type-checked, not part of the build.
- Analysis 2: interceptor timeout default 10 s (manifest override max 5 min); optional interceptor timeouts drop changes silently. spindle.json at repo root; dist/ auto-built (bun) if missing. Model calls: spindle.generate.raw(connection_id)/quiet/batch; no native card-deck equivalent.
- Analysis 3: LumiWorld ships pipeline-in-interceptor with interceptorTimeoutMs 300000 and internal per-phase budgets; dist/ committed; commit deferred to GENERATION_ENDED, discarded on GENERATION_STOPPED; single named breakdown entry; revision-based settings autosave.

## Last Working Version
Tag: step-6a (commit 3992b807941ba6f97f8ec026f51e2df2955d2034)
Go back with: git reset --hard step-6a
