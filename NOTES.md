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
- [x] 6b. PLAN.md Step 6b — real pipeline inside the interceptor (PASSED; tag step-6b on 8ea0085)

## Done Log
(Newest first: step / what changed / files / test result / tag)
- 6b / real pipeline inside the interceptor: windowed chat -> selectHand -> composePromptPacket -> generate.raw (top-level provider/model from connections.get + connection_id + userId, decision 21) -> 3 prompt blocks joined into ONE system message prepended at index 0; ONE Prompt Breakdown entry "Recursion Guidance" first, sections guidance / card evidence / guardrails; failure = pass-through (loop guard: raw calls never re-enter the interceptor chain, interceptors.md:179-181). Removed: the Step 4 fixture (runStep4Once, quiet variant, diag: logs) and the CHAT_CHANGED payload-keys log; 4th import line approved: hashJson + truncate (core.mjs). context.userId types-only (api.d.ts:141) but CONFIRMED PRESENT at runtime (userIdSource=context); CHAT_CHANGED 2nd-arg userId stays as fallback. spindle.json interceptorTimeoutMs 10000 -> 30000 (internal raw budget 25 s); tsconfig +allowImportingTsExtensions +noEmit (tsc check-only, bun build makes dist).
  TEMP failure-path probe commit a014e7a (forced throw at the top of the interceptor handler) committed untagged, tested, reverted — repo content equals 8ea0085 / lumiverse/src/backend.ts, lumiverse/tsconfig.json, lumiverse/dist/backend.js, spindle.json / dist/backend.js 74860 bytes, SHA256 F5E5DEC7C2E4B2429985B5B16F2297A17B6B445686D5E0723D0B87D92AA02885 (matched an isolated build) / VERIFIED PASSED on OpenRouter nvidia/nemotron-3.5-super-vl:free.
  Happy path: pipeline lines in order (start, window kept=10, hand cards=5 omitted=0, raw done ms=14858 contentLength=466, guidance status=used, injected blocks=3/3 promptMessages=15), no loop; Prompt Breakdown shows ONE "Recursion Guidance" entry first with the three sections. Failure path: "pipeline: failed stage=window error=probe: forced pipeline failure promptMessages unchanged=14", no Recursion entry, normal reply / tag step-6b (commit 8ea0085; the tag is on that commit, not HEAD)
- 6a / interceptor injects hard-coded "Recursion Guidance" block; permissions are now the old three plus interceptor / spindle.json, lumiverse/src/backend.ts, lumiverse/dist/backend.js / VERIFIED PASSED on OpenRouter: logs "interceptor: registered priority=100 timeoutMs=10000" and "interceptor: injected messageIndex=0 breakdownEntries=1 messageCount=13"; Prompt Breakdown showed "[1] SYSTEM" with "[Recursion Guidance] Step 6a test guidance." / tag step-6a (commit 3992b807941ba6f97f8ec026f51e2df2955d2034; local+remote verified)
- 5 / PURE ports + assert tests, one commit per sub-step: 5a packet composition (lumiverse/src/packet.mjs), 5b hand selection (lumiverse/src/cards.mjs), 5c card validation; shared dependency ports + fixed mini-deck (lumiverse/src/deck.ts). Facts: composeGuidanceForCards keeps source line 747 (its closing brace); cleanProviderPromptText is exported by deviation (src/cards.mjs:416 -> export at lumiverse/src/cards.mjs:760) / lumiverse/src/{card-selection,cards,core,deck.ts,instruction-safety,packet,safe-values,settings,settings-policy,story-form}.mjs, lumiverse/tests/{helpers,packet,cards,card-validation}.mjs, lumiverse/tsconfig.json / assert tests PASSED (bun lumiverse/tests/{packet,cards,card-validation}.mjs) / tags step-5a 154dacd, step-5b 8f9611a, step-5c 7fcb90f (no step-5 tag; notes commit is untagged)
- 4 / one generate.raw JSON call on fixed connection; JSON keys parsed; connectionId persisted to global/settings.json (commits 4d7b9be raw call, 2a93bfb userId in request, 239ee4d default profile + log) / lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json / install+restart test PASSED (user log: parsed keys status, test; persisted connectionId) / step-4 (tag on 239ee4d, applied after notes commit)
- 3 / bounded chat window: CHAT_CHANGED handler reads active chat via getActive(userId) + getMessages; userId taken from event handler's 2nd argument (fix commit 4aa1ca7) / lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json / install+restart test PASSED (confirmed by me) / step-3 (tagged on 4aa1ca7)
- 2 / settings stub: one global settings file via spindle.storage (operator-scoped — no userId; userStorage was rejected at test), fix commit f6227b3 / lumiverse/src/backend.ts, lumiverse/dist/backend.js, PLAN.md / install+restart test PASSED (confirmed by me) / step-2
- 1 / scaffold: root spindle.json + lumiverse/ backend (bun + tsc, dist committed) / spindle.json, lumiverse/{package.json,tsconfig.json,src/backend.ts,dist/backend.js,bun.lock}, .gitignore / build + install test PASSED (confirmed by me) / step-1
- 0a-0d / analyses confirmed: 0a ST touchpoints (docs/port/ST_TOUCHPOINTS.md), 0b Lumiverse capabilities (docs/port/LUMIVERSE_CAPABILITIES.md), 0c LumiWorld patterns (docs/port/LUMIWORLD_PATTERNS.md), 0d mapping + PLAN steps rewritten per decisions (in-interceptor pipeline; root spindle.json; one combined block) (docs/port/MAPPING.md, PLAN.md) / confirmed by me / step-0a..0d
- step-0 / overlay, docs, LumiWorld clone / .clinerules/, tools/, NOTES, PLAN, SETUP, .gitignore / docs copied (COPIED.txt present) / step-0

## Current Step
- 7: PLAN.md Step 7 — minimal frontend drawer tab (ctx.ui.registerDrawerTab): enable toggle,
  connection picker (spindle.connections.list, generation.md:787-815) with a "use default"
  option that clears the saved id, readout from backend messages; spindle.json gains
  entry_frontend: "lumiverse/dist/frontend.js" (manifest.md:36).

## Next Step
- Test Step 7 in Lumiverse: toggle persists across reload; picker lists the user's real
  connections and the chosen id drives the next interceptor run. Then /scribe.md (step-7).
  After 7: Step 8+ deferred items (see Project Scope / PLAN.md Step 8+).

## Known Issues
1. Latency: raw done ms=14858 on the free OpenRouter model (nvidia/nemotron-3.5-super-vl:free),
   so each message waits ~15 s before generation starts; timeout raised to 30000. Step 7 can
   consider a faster connection.
2. The parse-failure log can echo a few characters of model output via the JSON.parse error
   text. Later: replace with a fixed string plus contentLength.
3. The guardrails section is truncated mid-sentence in the injected text (exceeds its 700-char
   footprint budget). Look at it after Step 7.
4. Each user message now costs two model requests (one raw pipeline call, one real generation);
   a raw failure just means pass-through.
5. Unchanged and still open: revoking then re-granting the interceptor permission without a
   restart might not re-register (interceptorRegistered stays true; permissions.md:199-226).
6. generate.raw with only connection_id failed on OpenRouter ("No models provided") and custom profile `Test` ("model field is required"); the Task A probe showed raw with
   top-level provider/model from connections.get plus connection_id and userId works on OpenRouter (decision 21); generate.quiet with connection_id also worked but is not proven
   to honour connection_id (the profile was also the default); custom profile `Test` not retested until the Step 7 picker.
- INFERRED: NVIDIA NIM 401 "Invalid JWT serialization: Missing dot delimiter(s)" was a
  key/profile problem, not the extension (no header/key access from the extension).
- userId docs gap remains: GenerationRequestDTO.userId in api.d.ts:483-488 but not
  generation.md:53-62; context.userId types-only (interceptors.md:152-166 vs api.d.ts:141) —
  both confirmed at runtime in 6b (operator-scoped ext).
- connections.list order undocumented; selection rule: saved connectionId, else is_default
  profile, else first. Step 7 picker needs a "use default" option that clears the saved id and
  never changes Lumiverse's own default; custom profile `Test` (z-ai/glm-5.3-flash) retest
  pending that picker.
- Minor (moot since 6b removed runStep4Once): a persistConnectionId failure was logged as
  "failed at generate.raw" (stage not advanced before persist).
- "[runtime] critical memory pressure" lines appeared while a local 26B model ran; no sign they
  come from this extension. Lumiverse data disk 96.9% used.
- events.md:26 says the CHAT_CHANGED payload is { chatId }; observed runtime payload keys are:
  chat, changedFields.
- getActive(userId?) and the event handler's 2nd userId argument are types-only
  (spindle-api.d.ts:911, :174/:210); confirmed working at runtime (operator-scoped ext).
- getMessages has no userId parameter (spindle-api.d.ts:494-495).
- CHAT_CHANGED also fires on message changes (send, edit, delete, swipe), sometimes several
  times per action, not only on chat switches.
- No startup read: the window is empty until the first CHAT_CHANGED event. In memory only.
- Settings live in spindle.storage (shared extension dir, storage.md:73, 81). Per-user settings
  would mean userStorage + explicit userId (storage.md:83, 118-125).
- GitHub push: push works from the user's own PowerShell; Cline never pushes.
- Analysis 1 confirmed: only index.js + hosts/sillytavern/* + ui.mjs are host-bound; rest is
  PURE. Packet = 3 named prompt keys.
- Step 5 tests live in lumiverse/tests/ (bun lumiverse/tests/<module>.mjs; no framework,
  helpers.mjs); not type-checked, not part of the build.
- Analysis 2: optional interceptor timeouts drop changes silently; spindle.json at repo root;
  dist/ auto-built (bun) only if missing; no native card-deck equivalent in Lumiverse.
- Analysis 3: LumiWorld ships pipeline-in-interceptor with per-phase budgets,
  interceptorTimeoutMs 300000, commit deferred to GENERATION_ENDED, single named breakdown
  entry, revision-based settings autosave.
- 6b artifacts: dist/backend.js 74860 bytes, SHA256
  F5E5DEC7C2E4B2429985B5B16F2297A17B6B445686D5E0723D0B87D92AA02885 (matched an isolated build).

## Last Working Version
Tag: step-6b (commit 8ea0085; the tag is on that commit, not HEAD)
Go back with: git reset --hard step-6b
