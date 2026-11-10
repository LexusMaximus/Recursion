# ST Touchpoints (analysis 1)

Read-only analysis of how Recursion touches SillyTavern. Verified against src/ with line
citations. Doc sources: docs/technical/HOST_INTEGRATION_MANUAL.md, PROMPT_PACKET_AND_INJECTION.md,
MODEL_CALLS_AND_PROVIDER_ROUTING.md, RUNTIME_TURN_SEQUENCE.md, CARD_DECK_AND_HAND.md,
docs/DOCUMENTATION_INDEX.md, src/README.md. Line counts measured 2026-11-10 (HEAD 40978f6).

## src/ File Map (111 files)

Biggest files (lines): runtime.mjs 9278, ui.mjs 7346, providers.mjs 2797,
hosts/sillytavern/host.mjs 2347, post-process-runtime.mjs 2327, execution/scheduler.mjs 1237,
cards.mjs 1414, storage.mjs 1558, editorial-transform.mjs 1324, prompt.mjs 1093,
progress.mjs 1748, pre-process-decks.mjs 1058, extension/index.js 811.

| Module / group | Lines | Role | Class |
|---|---|---|---|
| src/extension/index.js | 811 | Entrypoint: bootstrap, lifecycle hooks, generation interceptor, host event wiring | HOST-BOUND |
| src/hosts/sillytavern/host.mjs | 2347 | ST context, generation, prompt install, swipe/message mutation, stop adapter | HOST-BOUND |
| src/hosts/sillytavern/provider-profiles.mjs | 49 | Connection Manager service discovery + safe profile listing | HOST-BOUND |
| src/hosts/sillytavern/profile-samplers.mjs | 58 | Allowlisted sampler projection from profile preset | HOST-BOUND (reads ST preset objects) |
| src/hosts/sillytavern/profile-secrets.mjs | 37 | Secret metadata projection (active-key check only, never values) | HOST-BOUND |
| src/hosts/sillytavern/storage.mjs | 188 | ST user-file storage via /user/files + /api/files, memory fallback | HOST-BOUND (HTTP endpoints) |
| src/hosts/sillytavern/post-process-profile-writer.mjs | 191 | Post-process writer via profile request path | HOST-BOUND |
| src/hosts/sillytavern/card-selection-history.mjs | 131 | Stores selection usage into message extras via host save boundary | HOST-BOUND |
| src/storage.mjs + src/storage/ | 1886 | Scene cache, manifests, artifacts, journal repository | PURE (adapter-injected) |
| src/settings.mjs + settings-policy.mjs | 732 | Settings normalization, profile policy, behavior derivation | PURE (root object injected) |
| src/providers.mjs + src/providers/ | 4379 | Role catalog, routing facade, parser, errors, queue, certification | PURE |
| src/cards.mjs + card-scope/refinement/selection + pre-process-decks.mjs | 4332 | Card catalog, scope, refinement, hand selection, decks | PURE |
| src/prompt.mjs | 1093 | Packet composition, validation, omission rules, block building | PURE (emits block list) |
| src/runtime.mjs + src/runtime/ | 11061 | Turn orchestration, run state, diagnostics, pipelines | PURE (host via injected adapter) |
| src/execution/ | 2611 | Stage graph, checkpoints, scheduler, attempt policy | PURE |
| src/progress.mjs, activity.mjs, failures.mjs, safe-values.mjs, core.mjs, etc. | ~1100 | View model, reporting, helpers | PURE |
| src/ui.mjs + src/ui/ | 8220 | Bar, panels, viewer, settings UI (DOM) | HOST-BOUND (document DOM only, no ST API) |
| src/editorial-transform.mjs, prose-enhancement.mjs, dialogue-enhancement.mjs, post-process-*.mjs | ~5500 | Post-process/editing domain logic | PURE |
| src/vendor/jsonrepair/ | ~770 | Bundled third-party JSON repair | PURE |

## Host Globals / Imports

| API | Where used | Cite |
|---|---|---|
| `SillyTavern.getContext()` / `globalThis.getContext()` | All host reads; fallback chain | src/extension/index.js:40-48; src/hosts/sillytavern/host.mjs:73-75; src/hosts/sillytavern/storage.mjs:13-20 |
| `import('/script.js')` | isGenerating probe only | src/extension/index.js:26-30 |
| `globalThis.extension_settings` / `context.extensionSettings` | Settings root | src/extension/index.js:182-184 |
| `globalThis.eventSource` / `context.eventSource` | Event subscription | src/extension/index.js:192 |
| `globalThis.event_types` / `context.event_types` | Event name lookup | src/extension/index.js:212-218 |
| `eventSource.on/removeListener/off/addEventListener` | subscribe/unsubscribe | src/extension/index.js:165-178 |
| `globalThis.jQuery` | document-ready bootstrap | src/extension/index.js:838-848 |
| `updateMessageBlock`, `saveChat`, `saveChatDebounced`, `refreshSwipeButtons` | Fallbacks beside context methods | src/hosts/sillytavern/host.mjs:279, 356, 366, 293 |

## Events (subscribed in entrypoint)

| Event | Purpose | Cite |
|---|---|---|
| CHAT_CHANGED | Reset volatile state, clear prompts | src/extension/index.js:220-222 |
| MESSAGE_DELETED / MESSAGE_UPDATED / MESSAGE_SWIPED | Source-changed invalidation; latest-assistant swipe retry | src/extension/index.js:224-231 |
| GENERATION_STOPPED (+ literal `generation_stopped` fallback) | Host stop cleanup | src/extension/index.js:233-239 |
| GENERATION_ENDED / MESSAGE_RECEIVED (+ literal fallback) | Assistant-landed state | src/extension/index.js:241-248 |
| STREAM_TOKEN_RECEIVED / SMOOTH_STREAM_TOKEN_RECEIVED | Streaming state | src/extension/index.js:250-256 |
| Settings-load events | Deferred bootstrap | src/extension/index.js:192-209 |

## Generation Interceptor

`recursionGenerationInterceptor(chat, _contextSize, abort, generationType)` — skips the
`quiet` generation type, awaits runtime preparation, aborts primary generation when not ready.
Cite: src/extension/index.js:769-796. Exported onto `globalThis` with all lifecycle hooks
(install/update/enable/disable/delete/clean/activate): src/extension/index.js:851-866.
manifest.json wires `generate_interceptor` + hooks (manifest.json:9-21).

## Settings And Storage

- Settings: `extension_settings.recursion` root, normalized by src/settings.mjs
  (createSettingsStore takes an injected root; the host passes `globalThis.extension_settings`).
  Persisted via the host save path. Cite: HOST_INTEGRATION_MANUAL.md:108-110;
  src/extension/index.js:180-184.
- Large records: JSON files via the storage repository (`recursion-*.json` keys). Adapter calls
  ST HTTP endpoints `/user/files/...`, `/api/files/upload`, `/api/files/delete` with
  `context.getRequestHeaders()`; falls back to memory storage. Cite:
  src/hosts/sillytavern/storage.mjs:47-54, 94-111, 149-190.

## Connection Profiles (model calls)

- Discovery: `context.ConnectionManagerRequestService` — requires `getSupportedProfiles`,
  `getProfile`, `validateProfile`, `sendRequest`. Cite: src/hosts/sillytavern/provider-profiles.mjs:6-38.
- Request path: `service.sendRequest(profileId, ...)`; native-schema `json_schema` field;
  secret override from `secrets.SECRET_KEYS` / `secrets.secret_state` (active-key check only,
  never reads or stores key values). Cite: src/hosts/sillytavern/host.mjs:1007-1073;
  src/hosts/sillytavern/profile-secrets.mjs:9-35.
- Quiet generation: `context.generate('quiet', { quiet_prompt, ... })` (post-process writer).
  Cite: src/hosts/sillytavern/host.mjs:1441-1443. Native flows: `context.generate(type, options)`
  for normal/swipe/regenerate resume; swipe via `context.swipe.right()`. Cite: host.mjs:1507-1519.

## Prompt Entry Installation

- Keys: only `recursion.*`; current three: `recursion.guidance`, `recursion.cardEvidence`,
  `recursion.guardrails`. Cite: PROMPT_PACKET_AND_INJECTION.md:9-13, 120.
- Install/clear: `context.setExtensionPrompt(key, text, position, depth, false, role)` with
  NUMERIC enums (context does not expose `extension_prompt_types`/`_roles`; strings coerce to
  NaN). Clear = empty text; rollback of known keys on partial failure. Cite:
  src/hosts/sillytavern/host.mjs:833-841, 1248-1292, 1330-1337; PROMPT_PACKET_AND_INJECTION.md:108-130.

## Message / Swipe Edits

- Post-process commit: writes into `message.swipes[swipe_id]` and `message.swipe_info`, aligns
  root extra; `updateMessageBlock` + `saveChat` (required/best-effort variants); swipe refresh
  via `context.swipe.refresh` / `refreshSwipeButtons`. Cite: src/hosts/sillytavern/host.mjs:265-366.
- Loop-guard pattern (port-rule relevance): the entrypoint ignores source-mutation events for
  messages the post-process writer owns (`postProcessOwnedSourceMutation`), so its own
  update/save cannot retrigger preparation. Cite: src/extension/index.js:102-119.

## Host Generation Stop

`stopGeneration(details)` prefers `context.stopGeneration()`, falls back to clicking
`#mes_stop` / `.mes_stop`, else returns RECURSION_HOST_STOP_UNAVAILABLE. Cite:
src/hosts/sillytavern/host.mjs:1536-1542, 915; HOST_INTEGRATION_MANUAL.md:137.

## DOM / UI Hooks

UI mounts near the `#chat` element (parent fallback document.body); pure DOM, no ST UI API.
Cite: src/ui.mjs:4288-4295; HOST_INTEGRATION_MANUAL.md:141-143. The only host DOM id used in
src/ is the `#mes_stop` stop-button fallback (host.mjs:915).

## Tests

tests/ holds only evaluation scenarios, evidence, helpers, visual baselines — no unit tests.
The deterministic suite is assert-based scripts under tools/scripts/test-*.mjs run by
`node tools/scripts/run-tests.mjs` using fake host adapters (no test framework in package.json;
devDependency is playwright only). Host-independent checks exist (test-cards, test-prompt,
test-settings, test-runtime, etc.). Cite: package.json:8-41; HOST_INTEGRATION_MANUAL.md:145-147.

## Port-Relevant Summary

1. Host boundary is clean: only index.js + hosts/sillytavern/* + ui.mjs touch host/DOM.
2. PURE port candidates: cards*, prompt.mjs, providers/*, execution/*, settings*, storage.mjs
   (adapter-injected), runtime/* logic, editorial/post-process domain modules.
3. ST concepts to map in analysis 2: setExtensionPrompt lanes/depth, ConnectionManagerRequestService,
   context.generate('quiet'), eventSource events, extension_settings, user-file storage endpoints,
   generation interceptor + abort, swipe arrays / swipe_info message extras.
4. Not found in docs/src: any other host integration (SillyTavern is the only V1 host,
   HOST_INTEGRATION_MANUAL.md:155-157).
