# LumiWorld Patterns (analysis 3)

Pattern reference only (different license — LICENSE.md; describe patterns, do not copy code).
All cites are reference/LumiWorld/ files. Repo layout: spindle.json (root), package.json,
tsconfig.json, src/*.ts, dist/ COMMITTED (.gitignore holds only node_modules/.DS_Store/*.log).
Tests: bun test, *.test.ts colocated in src/.

## Manifest And Permissions — spindle.json

- identifier `agent_world`; permissions: interceptor, generation, decisions, chats,
  characters, personas, world_books (spindle.json:9).
- `interceptorTimeoutMs: 300000` — LumiWorld runs real pre-generation model work (Jev gate +
  Director call) inside the interceptor and takes the maximum 5-minute budget (spindle.json:10).
- entry_backend/entry_frontend point to dist/ bundles (spindle.json:11-12).

## Build And dist Handling

- Build: `bun build src/backend.ts --outfile dist/backend.js --target bun` and
  `src/frontend.ts --target browser` (package.json:7-9). typecheck via tsc --noEmit.
- dist/ IS committed (present in repo; .gitignore excludes only node_modules/.DS_Store/*.log).
  Resolves the port's open question: committing dist/ is a valid, used pattern.
- lumiverse-spindle-types 0.6.49 as devDependency; backend declares
  `const spindle: import("lumiverse-spindle-types").SpindleAPI` (backend.ts:1).

## Interceptor Registration And Prompt-Block Naming

- Registered once at load, deferred until the `interceptor` permission is granted, re-registered
  via `permissions.onChanged` (backend.ts:1403-1406, 1484-1487). Priority 150 (backend.ts:28).
- The handler first filters by enable flag and a settings allowlist of generation types
  (`shouldInterceptGeneration`, shared.ts:616-619 region) — quiet/unsupported types pass through.
- Concurrency: one Director call per key via `KeyedOperationLock` (shared.ts:420;
  backend.ts:38, 1314).
- Injection: prepends one system message and returns `breakdown: [{ messageIndex: 0, name:
  BREAKDOWN_NAME }]` — single named prompt block "LumiWorld Director" in Prompt Breakdown
  (backend.ts:1280-1290; shared.ts:3).
- Model call inside the interceptor: `spindle.generate.raw({ connection_id, provider, model,
  messages, parameters, reasoning, signal })` with a settings-driven AbortController timeout
  (backend.ts:973-993). Per-phase Jev budget 15 s and 20 s reserve tracked against the 300 s
  interceptor budget (backend.ts:30-34).

## Backend <-> Frontend Messaging

- Typed discriminated unions in src/types.ts: `FrontendToBackend` (ready, refresh_state,
  save_settings, test_controller, test_jev, get_decision_models) and `BackendToFrontend`
  (state, settings_saved, settings_save_error, run_logged, test_result, jev_test_result,
  decision_models, error) (types.ts:27-45).
- Backend: `spindle.onFrontendMessage(async (raw, userId))` switch on `message.type`, wrapped
  in try/catch that sends `{ type: "error" }` (backend.ts:1583-1621).
- Send: `spindle.sendToFrontend(payload, userId)` (backend.ts:116-118). userId tracking:
  `lastFrontendUserId` + chatId→userId map; generation events carry their own userId
  (backend.ts:36-37, 142-161).
- Frontend: `ctx.sendToBackend({...activeChat(ctx), ...message})` (frontend.ts:415).

## Storage Layout (per user / per chat)

- All storage through `spindle.userStorage` (per-user isolated; backend.ts:70-72).
- `global/settings.json` — normalized settings; read with DEFAULT_SETTINGS fallback, write
  merges legacy keys (backend.ts:26, 243-267).
- `global/runs.json` — bounded run log; serialized per-user writes via a promise chain map
  (backend.ts:27, 281-346); older records get full text stripped (backend.ts:348-360).
- Per-chat world state: `worldStatePath(chatId)` sanitizes chatId to `[A-Za-z0-9._-]`, max
  120 chars, under the per-user storage root (world-state.ts:358-391).
- No database, no per-message extras — JSON files only.

## Committing State Only After A Generation Ends

- Derived world state is computed during the interceptor but the commit is DEFERRED:
  `pendingCommits` is keyed by [userId, chatId, generationId] and only armed when the
  generation id from GENERATION_STARTED still matches (backend.ts:41-44, 1256-1272).
- `GENERATION_ENDED` handler performs the actual `saveWorldState` and patches the run trace;
  save failure is logged, not fatal (backend.ts:1520-1552).
- `GENERATION_STOPPED` discards the pending commit and marks the trace outcome "discarded"
  (backend.ts:1554-1570). Comment: "a cancelled, failed, or superseded generation cannot move
  the world" (backend.ts:1257-1258).
- Unmatched generation ids never commit (backend.ts:1263-1271).

## Settings Autosave

- Frontend keeps a revision counter (`markDirty`, in-flight revision, savedRevision) and sends
  `{ type: "save_settings", revision, settings }`; backend replies `settings_saved` (same
  revision) or `settings_save_error`; frontend acknowledges or fails the in-flight revision
  and retries when dirty (frontend.ts:214-234, 487-488; types.ts:30, 37-38).
- Settings are normalized on every read AND write (`normalizeSettings`, integer/number range
  clamps, defaults) (backend.ts:247-267; shared.ts:569+, 883-943).

## Error And Timeout Fallback

- Per-call timeout: AbortController + `settings.timeoutMs`; abort or AbortError becomes
  `ControllerTimeoutError` (backend.ts:973-1007).
- Interceptor catch: records a run with status timeout/skipped/error, logs a warning, and
  returns the UNMODIFIED message list — generation continues without the injection
  (backend.ts:1291-1312). Matches Spindle's optional-interceptor pass-through policy.
- Empty/invalid Director output triggers one bounded repair regeneration; failure withholds
  the note instead of injecting (backend.ts:1318-1323, 1240-1254).
- Host capability checks before use: `decisions-v1 >= 1` gate (backend.ts:94-100);
  permission state snapshot pushed to the UI (backend.ts:106-140).
- Decision connections: `spindle.decisions.*` for the Jev gate lane (types.ts:22;
  backend.ts:20, 94-100) — a second, cheaper evaluation lane distinct from the Director
  generation call.

## Other Notable Patterns

- Run log doubles as UI feed: `run_logged` messages keep the frontend live without polling
  (backend.ts:300, 338).
- `ctx.ui.registerDrawerTab` hosts the whole settings/run UI; first-party components via
  `ctx.components.mountSwitch/mountSelect/mountModelCombobox/mountNumberStepper/mountRangeSlider`
  inherit the host theme (frontend.ts:357, 533-610, 1114-1115).
- Jev (gate lane) uses `spindle.decisions.evaluate` with typed choice/score questions
  (src/jev.ts, 362 lines); gates logic isolated in src/gates.ts (1213 lines).

## Port-Relevant Takeaways (facts, not design)

1. A real pre-generation model pipeline inside the interceptor IS a shipped pattern here,
   backed by `interceptorTimeoutMs: 300000` + internal per-phase budgets + required-ish
   degradation (withhold rather than inject on failure).
2. Commit-after-GENERATION_ENDED with pending/discard keyed by generation id is the pattern
   matching Recursion's "commit only after generation ends" contract.
3. dist/ committed; bun build; typed message unions; per-user + per-chat JSON storage;
   revision-based settings autosave; single named breakdown entry per injected block.
