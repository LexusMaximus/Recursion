# PLAN.md

## Project Brief
- Goal: port Recursion (SillyTavern) to a Lumiverse Spindle extension.
- Platform and docs provided: docs/lumiverse/ (API truth), reference/LumiWorld/ (patterns),
  Recursion's own docs/ and src/ (read-only source of behaviour).
- Inputs and samples: tests/evaluation/scenarios/ (model-evaluation fixtures, not unit tests).
- Expected output: a Lumiverse extension installable from a repo URL.
- Constraints: documented APIs only; one step at a time; first cut is pre-process only.
- Done-when (testable): see NOTES.md. Confirm after analysis 4.
- Out of scope: see NOTES.md.
- Assumptions to confirm (RESOLVED after analyses 1-4 + manager decisions):
  1. RESOLVED (MAPPING.md Design Rows): docs require spindle.json at the repo root
     (lifecycle.md:3-7); a `lumiverse/` subfolder repo is not doc-supported. Decision: root
     spindle.json in this fork, port code under lumiverse/, ST files read-only.
  2. RESOLVED (LUMIVERSE_CAPABILITIES.md §Interceptor Timeout): optional interceptor timeouts
     drop changes silently; budget = manifest interceptorTimeoutMs (max 300000 ms). Decision:
     Tier 0 pipeline runs INSIDE the interceptor (LumiWorld precedent, LUMIWORLD_PATTERNS
     §Interceptor); precompute-on-events deferred to Step 8+.
  3. RESOLVED (MAPPING.md Tier 0): ONE pipeline mode = single `generate.raw` call; fixed
     mini-deck in code; ONE combined Prompt Breakdown block.
  4. RESOLVED (PLAN Step 1): dist/ must be committed (auto-build targets root src/backend.ts,
     lifecycle.md:8, unavailable here); `.gitignore` gets `!lumiverse/dist/` (SETUP.md §5).

## Approved Plan (max 10 lines)
- Goal: Lumiverse extension reproducing Recursion's core pre-generation flow (done-when in
  NOTES.md: named card-guidance block visible in Prompt Breakdown on one real chat).
- Layout: fork root holds spindle.json (permissions added per step) + lumiverse/ port code
  (package.json, tsconfig, src, committed dist). ST files untouched and read-only.
- Tier 0 path: scaffold → settings stub (userStorage) → windowed chat read (chats +
  chat_mutation) → one generate.raw JSON call (generation) → fixed mini-deck + PURE ports
  with assert tests (no permission) → interceptor injects hard-coded block (interceptor),
  then the real pipeline (6b) → minimal drawer-tab frontend.
- Pipeline placement: inside the interceptor, `interceptorTimeoutMs` per docs clamp; failure
  returns messages unchanged (pass-through).
- Deferred (Step 8+): Reasoner lane, decks UI, checkpoints/cache, post-process, Full Viewer,
  progress array, precompute-on-events.

## Steps
Rewritten after /analyze.md 4 (MAPPING.md) and manager decisions:
pipeline INSIDE the interceptor for Tier 0 (precompute later); code at fork root via root
spindle.json; ONE combined Prompt Breakdown block. Docs paths under docs/lumiverse/.

### Step 1: Scaffold — root spindle.json + minimal backend
- Prerequisite: `bun` available on PATH (docs' build toolchain is `bun build` —
  typescript-setup.md:35-46; quick-start.md:31).
- What changes:
  1. `spindle.json` at REPOSITORY ROOT (ref/getting-started/manifest.md:1-3; lifecycle.md:3-7 —
     install clones the repo and validates the root manifest): identifier `recursion`,
     permissions `[]` (logging is free tier — permissions.md:19; each later step adds its
     permission), `entry_backend: "lumiverse/dist/backend.js"` (entry paths are configurable;
     default `dist/backend.js`, manifest.md:35). `entry_frontend` is NOT set here — it is
     optional ("No", default `dist/frontend.js`, manifest.md:36) and is added in Step 7.
     `interceptorTimeoutMs` added in Step 6.
  2. `lumiverse/src/backend.ts` — minimal backend that logs one line; `declare const spindle`
     per ref/getting-started/typescript-setup.md:48-54 (pattern: ref/examples/minimal-backend.md).
  3. `lumiverse/tsconfig.json` (typescript-setup.md:18-33) and `lumiverse/package.json` (NEW)
     with devDependency `lumiverse-spindle-types` (typescript-setup.md:3-13) + build scripts
     with paths RELATIVE TO lumiverse/ (`bun build src/backend.ts --outfile dist/backend.js
     --target bun`, matching typescript-setup.md:39 where the script runs from the package dir).
  4. `.gitignore`: append `!lumiverse/dist/` exception.
- Root package.json: NOT modified (ST file, read-only; its test harness stays intact).
  Docs never require a root package.json for install or build: install = clone + validate
  spindle.json (lifecycle.md:3-7). A build runs at install ONLY "If no `dist/` folder exists"
  and targets root `src/backend.ts` (lifecycle.md:8; quick-start.md:31) — root src/ is
  Recursion's ST code and must stay read-only, so auto-build is unusable in this fork.
- Built output: MUST be committed. Our entry points at `lumiverse/dist/`, no install-time
  build can produce it, and the repo's .gitignore ignores `dist/` — hence the
  `!lumiverse/dist/` exception (SETUP.md §5 anticipated exactly this).
- Install source (docs check): install takes ONLY `{ github_url }` — no branch parameter
  (ref-later/rest-api.md:82, 93-99) — and docs are SILENT on which branch is cloned and on
  any local/dev install path. Fallback: make `lumiverse-port` the fork's DEFAULT branch on
  GitHub so install/update clone it (update = `git pull`, lifecycle.md:19-24).
- Files touched: spindle.json (new), lumiverse/package.json (new), lumiverse/tsconfig.json (new),
  lumiverse/src/backend.ts (new), lumiverse/dist/backend.js (built + committed), .gitignore (edit).
- How I test it, pre-test actions first:
  1. push works (the fork is reachable with current credentials);
  2. `lumiverse-port` is the fork's DEFAULT branch on GitHub (fallback from the docs' silence
     on branch picking — see Install source above);
  3. `lumiverse/dist/backend.js` is committed and pushed (built output must be committed —
     see Built output above).
  Then: `bun install` inside lumiverse/ (fetches lumiverse-spindle-types), `bun run build`
  succeeds, and installing from the fork's GitHub URL via the Lumiverse Extensions panel
  registers the extension with the backend log line visible.
- Permission added: none (log only, free tier).
- Checkpoint: /scribe.md (commit + tag step-1)


### Step 2: Settings stub
- What changes: read/write one setting in `userStorage` `global/settings.json`
  (ref/backend-api/storage.md:79-127, getJson/setJson; pattern: LUMIWORLD_PATTERNS §Storage).
  Backend writes the default on first run when the file is missing.
- Files touched: lumiverse/src/backend.ts (edit), lumiverse/dist/backend.js (rebuild+commit).
- How I test it: first run writes `global/settings.json` (visible via storage), then after a
  Lumiverse/server restart the backend logs the SAVED value read back (not the default).
- Permission added: none (`storage`/`userStorage` are free tier — permissions.md:10, 12).
- Checkpoint: /scribe.md (step-2)

### Step 3: Read a bounded chat window
- What changes: `spindle.chats.getActive()` + `spindle.chat.getMessages(chatId)`, keep the
  last N messages in extension storage; refresh on `CHAT_CHANGED`
  (ref/backend-api/chats.md:22-29, 72-96; ref-later/backend-api/events.md:26).
- Files touched: lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json (permissions).
- How I test it: open a chat; log line shows the correct windowed message count.
- CHAT_CHANGED subscription permission: NONE needed. "Events — subscribe to any Lumiverse
  event" is FREE tier (permissions.md:9); the only gated subscriptions are generation events,
  which require `generation` (events.md:31-34). CHAT_CHANGED is a chat lifecycle event
  (events.md:26) — free.
- Permission added: `chats` (getActive — chats.md:22-23) + `chat_mutation` (getMessages —
  chats.md:163-176).
- Checkpoint: /scribe.md (step-3)

### Step 4: One model call returning JSON
- What changes: one `spindle.generate.raw({ connection_id, messages, parameters, signal })`
  call, response parsed to JSON and stored (ref/backend-api/generation.md:7-20, 53-62). This
  call IS the Tier 0 pipeline (decision 1: in-interceptor); proven standalone here first.
- connection_id before Step 7: temporary default = FIRST entry returned by
  `spindle.connections.list()` (generation.md:787-815; `list` confirmed in generation.md) when
  the setting is empty; persisted to settings on first successful use. Step 7 replaces this
  with an explicit picker.
- Files touched: lumiverse/src/backend.ts, lumiverse/dist/backend.js, spindle.json (permissions).
- How I test it: backend logs the parsed JSON keys for a fixture prompt on one real connection.
- Permission added: `generation` (raw + connections.list — permissions.md:30).
- Checkpoint: /scribe.md (step-4)

### Step 5: Fixed mini-deck + PURE logic ports (sub-steps)
- What changes: static small deck defined in code (no deck editing, no card-state UI); port
  the PURE subsets named in docs/port/ST_TOUCHPOINTS.md §Port-Relevant Summary — one module
  per sub-step. Assert-based tests under lumiverse/tests/ mirroring Recursion's tools/scripts
  pattern (no test framework; ST_TOUCHPOINTS §Tests).
- Files touched (per sub-step): lumiverse/src/<module>.ts (new), lumiverse/tests/<module>.mjs
  (new). NO dist rebuild in step 5 — the rebuild+commit happens in Step 6b.
- Permission added: none (PURE logic, no host API).
- Source functions and line ranges ported (exact; NOTE: none of this logic lives in
  src/extension/index.js — it lives in src/prompt.mjs and src/cards.mjs per the analysis-1
  file map; src/extension/index.js:769-796 is the HOST-BOUND interceptor, ported as 6b logic):
  - 5a packet composition ← src/prompt.mjs: `composePromptPacket` (986-1117),
    `validatePromptPacket` (1118-1148), `packetToPromptBlocks` (1149-EOF), plus its text/
    budget helpers `cleanText` (90) through `estimateTokens` (146) as needed.
  - 5b hand selection ← src/cards.mjs: `selectHand` (1376-EOF) with helpers `sanitizeHandCard`
    (746), `sortCardsForHand` (784), `effectiveMaxCardsForPolicy` (823), `plannedCardForJob`
    (830), `limitCardJobsForHandBudget` (852-920).
  - 5c card validation ← src/cards.mjs: `providerCardRejectReason` (648-686), `normalizeCard`
    (921-974), evidence/text guards `normalizeEvidenceRefs` (479) through
    `assertCardPromptTextSafe` (541-550).
- How I test each sub-step (its own test, name = module):
  - 5a packet composition: given a fixture hand + settings, the composed packet sections match
    the expected fixture (labels, order, verbatim evidence text).
  - 5b hand selection: given a fixture deck + selection state, the selected hand matches the
    expected card ids and order; edge cases (empty deck, target 0) covered.
  - 5c card validation: given fixture card objects (valid, malformed, secret-looking),
    valid ones pass and invalid ones are rejected with the expected reason.
- Rule: each sub-step leaves all prior tests passing.
- Checkpoint: /scribe.md per sub-step (step-5a, 5b, 5c)

### Step 6a: Interceptor injects a hard-coded block
- What changes: `spindle.registerInterceptor` returns ONE combined system message with
  HARD-CODED text and `breakdown: [{ messageIndex: 0, name: "Recursion Guidance" }]`
  (ref/backend-api/interceptors.md:80-108; pattern: ref/examples/prompt-interceptor.md:36-54).
  Manifest gets `entry_backend` unchanged plus `interceptorTimeoutMs` (default 10 s; clamp
  [1000, 300000] ms — interceptors.md:183-193). No model call yet.
- Files touched: spindle.json (permissions, interceptorTimeoutMs), lumiverse/src/backend.ts,
  lumiverse/dist/backend.js (rebuild+commit).
- How I test it: on one real chat, the hard-coded "Recursion Guidance" block appears in
  Prompt Breakdown.
- Permission added: `interceptor` (permissions.md:32).
- Checkpoint: /scribe.md (step-6a)

### Step 6b: Real pipeline replaces the static text
- What changes: the interceptor handler now runs the Step 4 call + Step 5 pure modules
  (windowed chat → hand → packet) and injects the real combined block from stored state
  (decision 1: pipeline inside the interceptor). On failure/timeout return messages unchanged
  (interceptors.md:212-220). Loop guard: raw/quiet/batch calls never re-enter the interceptor
  chain (interceptors.md:179-181) — no self-retrigger path exists; state updates happen only
  via explicit events/storage.
- Files touched: lumiverse/src/backend.ts, lumiverse/dist/backend.js (REBUILD + commit happens
  here, after step 5's pure modules land).
- How I test it: on one real chat, the block appears in Prompt Breakdown with content derived
  from that chat's windowed messages and the one model call (the done-when in NOTES.md).
- Permission added: none new (interceptor + generation already granted).
- Checkpoint: /scribe.md (step-6b)

### Step 7: Minimal frontend drawer tab
- What changes: frontend module with `ctx.ui.registerDrawerTab`: enable toggle, connection
  picker (`spindle.connections.list`, generation.md:787-815; replaces the Step 4 temporary
  default), readout from backend messages (LUMIWORLD_PATTERNS §Backend<->Frontend Messaging).
  `spindle.json` now sets `entry_frontend: "lumiverse/dist/frontend.js"` (optional field,
  manifest.md:36).
- Files touched: lumiverse/src/frontend.ts (new), lumiverse/dist/frontend.js, spindle.json
  (entry_frontend).
- How I test it: toggle persists across reload; picker lists the user's real connections and
  the chosen id is used by the next interceptor run.
- Permission added: none new (`connections.list` is covered by `generation` — permissions.md:30).
- Checkpoint: /scribe.md (step-7)

### Step 8+: Deferred (NOTES.md scope)
Reasoner lane, authored decks + card-state UI, checkpoints/cache, post-process + swipes,
Full Viewer, progress array, precompute-on-events pipeline relocation.

