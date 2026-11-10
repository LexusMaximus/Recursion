# Mapping (analysis 4)

Inputs: docs/port/ST_TOUCHPOINTS.md (1), LUMIVERSE_CAPABILITIES.md (2), LUMIWORLD_PATTERNS.md (3),
NOTES.md. Statuses: direct / partial / needs redesign / no equivalent / not found in docs.

## Feature Map

| Recursion feature | ST touchpoint | Lumiverse doc/API | Permission | Status | Notes |
|---|---|---|---|---|---|
| Pre-process packet injection (3 keys: guidance/cardEvidence/guardrails) | `generate_interceptor` hook + `setExtensionPrompt` (ST_TOUCHPOINTS §Interceptor, §Prompt Install) | `spindle.registerInterceptor` + `breakdown: [{messageIndex, name}]` Prompt Breakdown entries | interceptor | direct | One system message per section with its own breakdown name; LumiWorld ships exactly this shape (LUMIWORLD §Interceptor) |
| Bounded chat-window read (last N messages, roles, visibility, swipe meta) | `context.chat`, mesid indexing, swipe arrays | `spindle.chat.getMessages(chatId)`; hidden flag in `extra` | chat_mutation | direct | Full raw message list; windowing is our logic; swipe metadata depth not found in docs — verify in build step |
| Utility lane (one chosen Connection Profile, structured JSON out) | `ConnectionManagerRequestService.sendRequest` | `spindle.generate.raw({ connection_id, ... })`; native `response_format` via interceptor `parameters` or request params | generation | direct | Per-call AbortSignal replaces Recursion's per-call timeout plumbing |
| Reasoner lane (second profile, deeper synthesis) | same as Utility, separate profile | `generate.raw` with a second connection_id | generation | direct | Recursion's profile FIFO queue/port has no native equivalent — queue is our code |
| Deck + authored cards + card states (off/active/priority/refinement) | `extension_settings.recursion` + storage repo | `spindle.storage` / `userStorage` JSON files | storage (free) | direct | No native card concept; pure port |
| Resumable checkpoints, scheduler, run journal, cache | ST user-file storage `/user/files` + `/api/files/*` | `userStorage` per-user JSON files (getJson/setJson) | storage (free) | direct | Same file-per-record shape; LumiWorld serialized-write pattern reusable (LUMIWORLD §Storage) |
| Post-process rewrite committed as swipe | `context.generate('quiet')`, `updateMessageBlock`, `saveChat`, `swipes[swipe_id]` | `spindle.chat.updateMessage` (swipes/swipe_id), `SWIPE_EDITED` event; writer via `generate.raw/quiet` | chat_mutation + generation | partial | chat-mutation is ref-later; out of scope for first cut (NOTES scope) |
| Host generation stop | `context.stopGeneration()`, `#mes_stop` fallback | `GENERATION_STOPPED` event + interceptor `context.signal` abort; context-handler `cancelGeneration` (pre-LLM only) | generation (events) | partial | No native "stop the host's in-flight generation" API found in ref docs; port listens + aborts own work |
| Lifecycle hooks (install/update/enable/disable/delete) | manifest hooks `recursionOn*` | Host-managed: disable unregisters handlers; SPINDLE_EXTENSION_LOADED/UNLOADED events | free | direct | No per-hook exports to write; teardown handled by host |
| Last Brief dropdown, Recursion Bar, Hero Pixel progress, settings panel, Full Viewer | DOM root near `#chat` | Frontend: `ctx.dom.*`, `ctx.ui.registerDrawerTab`, `ctx.components.*` (host-themed) | free (DOM) | direct | Drawer tab replaces chat-attached bar as simplest first surface; compact bar later |
| Settings persistence + autosave | `extension_settings.recursion` + host save | `userStorage global/settings.json` + revision-based autosave round-trip | free | direct | LumiWorld revision pattern (LUMIWORLD §Settings Autosave) |
| Privacy/redaction discipline (no secrets, bounded diagnostics) | Recursion code (profile-secrets reads active-key state only) | `has_api_key` boolean only; secure enclave for any secret; never read keys | free | direct | Port-side discipline; Lumiverse never exposes keys (LUMIVERSE §Connections) |
| Post-process profile writer (separate prose lane) | `sendRequest` on saved profile | `generate.raw(connection_id)` without schema | generation | direct | Deferred with post-process |
| Selection-usage receipts in message extras | `message.swipe_info[].extra` via guarded save | `updateMessage` metadata bag (ref-later) | chat_mutation | partial | Deferred; Tier 0 keeps selection state in our storage only |
| Decision-model lane (typed choice/score) | — (no ST equivalent) | `spindle.decisions.evaluate`, 30 s deadline | decisions | no equivalent | Recursion feature absent; optional future Utility-lane alternative |

## Design Rows

| Question | Facts | Status |
|---|---|---|
| Where does the multi-call pipeline run vs interceptor timeout? | Optional interceptor timeout silently drops changes; budget = manifest `interceptorTimeoutMs` (max 300000 ms), default 10 s. LumiWorld precedent: pipeline inside interceptor, manifest 300000, internal per-phase budgets, withhold-on-failure | partial — Tier 0 (small deck, 1–2 calls) fits the budget; larger pipelines need precompute-on-events (needs redesign, later) |
| Install/build layout | spindle.json must be at REPO ROOT; subfolder install not found in docs; dist/ auto-built if missing, and LumiWorld commits dist/ | needs redesign — `lumiverse/` subfolder idea from PLAN.md does NOT satisfy the root-manifest rule; separate repo is the doc-supported shape |
| Overlap with native Lumiverse features | Context handlers, world-info interceptor, chat memories, Council (read-only), macros. No native card-deck or multi-step reasoning pipeline | no equivalent pipeline — native pieces complement, none replaces Recursion's deck/hand/packet flow |

## Tier 0 — Fewest Rows Meeting The Done-When

Done-when (NOTES.md): extension installs in Lumiverse; on one real chat the interceptor injects
a named card-guidance block visible in Prompt Breakdown. ONE pipeline mode, small fixed deck,
one Lumiverse connection.

1. **Scaffold** — separate repo (or fork root) with spindle.json, minimal backend + frontend,
   bun build, committed dist/. Installs and logs one line.
2. **Settings stub** — one setting in `userStorage global/settings.json`, revision autosave.
3. **Chat window read** — `chat.getMessages` on the active chat, bounded window into storage.
4. **One model call** — `generate.raw` on one chosen connection, JSON parsed, stored.
5. **Fixed mini-deck** — static card definitions in code (no deck editing, no card states UI);
   hand = the enabled subset; hand selection pure logic.
6. **Interceptor injection** — `registerInterceptor` adds one system message built from stored
   state, `breakdown: [{messageIndex: 0, name: "Recursion Guidance"}]`; manifest
   `interceptorTimeoutMs` sized to the one call.

Everything else (Reasoner lane, authored decks, checkpoints/cache UI, post-process, Full
Viewer, progress array) is post-Tier-0.

## Questions (max 3, most important first)

1. **Pipeline placement (decides step design):** run the Tier 0 single call inside the
   interceptor (LumiWorld pattern, manifest `interceptorTimeoutMs` ~60–120 s), or precompute
   on `MESSAGE_SENT` and let the interceptor only read storage? My recommendation: inside the
   interceptor for Tier 0 — simplest, matches the done-when, one call fits the budget.
2. **Code location:** separate repo (doc-supported, clean) vs spindle.json at your fork root
   (works too — root already holds ST manifest.json; both manifests coexist). Which do you want?
3. **Prompt Breakdown entries:** one combined block ("Recursion Guidance") or three named
   blocks (guidance / card evidence / guardrails) mirroring ST's three keys? Recommendation:
   one block for Tier 0, three later.

## Suggested Step Order (smallest first, PURE before host-bound)

1. Scaffold + manifest + empty backend log (host-bound, tiny) — existing PLAN step 1, relocated.
2. Settings stub in userStorage (host-bound, tiny) — PLAN step 2 stands.
3. Chat window read into storage (host-bound) — PLAN step 3 stands.
4. One `generate.raw` JSON call on a fixed connection id (host-bound) — PLAN step 4 stands.
5. Port PURE modules named in ST_TOUCHPOINTS, one per step: prompt packet composition subset →
   hand selection subset → card validation subset; assert-based tests mirroring tools/scripts.
6. Interceptor injection from stored state (host-bound) — PLAN step 6 stands.
7. Minimal frontend: drawer tab with enable + connection picker + Last-Brief-like readout.
8+ Deferred per NOTES scope: Reasoner lane, decks UI, checkpoints, post-process, Full Viewer.

