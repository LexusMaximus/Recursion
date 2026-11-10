# Lumiverse Capabilities (analysis 2)

Sources: ONLY docs/lumiverse/ref/ and docs/lumiverse/ref-later/ (verbatim Spindle docs).
File cited per claim. Facts only.

## Manifest (spindle.json) — ref/getting-started/manifest.md

- Required at the REPOSITORY ROOT (manifest.md:1-3; lifecycle.md:5-7 "clones the repo ...
  reads and validates spindle.json").
- Fields: version, name, identifier (pattern `/^[a-z][a-z0-9_]*$/`), author, github,
  homepage, description, permissions, requested_capabilities, entry_backend (default
  `dist/backend.js`), entry_frontend (default `dist/frontend.js`), entry_frontend_widget,
  minimum_lumiverse_version, storage_seed_files, interceptorTimeoutMs (manifest.md:22-41).
- `interceptorTimeoutMs` is a first-class manifest field for pre-generation work (manifest.md:82-102).

## Install / Update / Build — ref/lifecycle.md, quick-start.md, runtime.md

| Question | Answer | Source |
|---|---|---|
| How installed | User gives a GitHub URL; Lumiverse clones to `{DATA_DIR}/extensions/{identifier}/repo/`, validates spindle.json, registers in DB | lifecycle.md:3-10 |
| Where spindle.json | Repo root | manifest.md:1-3 |
| Subfolder install | Not found in docs — docs only describe root-level manifests | lifecycle.md, quick-start.md |
| Build on install | If `dist/` missing, Lumiverse auto-builds `src/backend.ts` / `src/frontend.ts` with `bun build` | quick-start.md:31; lifecycle.md:8 |
| Must dist/ be committed? | No — auto-build exists. Committing dist/ is allowed but not required by docs | quick-start.md:21-31 |
| Update | `git pull` in repo dir, re-read manifest, rebuild if needed, restart runtime | lifecycle.md:19-24 |
| Removal | Stop runtime, delete DB row + extension directory (repo + storage) | lifecycle.md:26-30 |
| Backend execution | Isolated Bun subprocess (default mode `process`; also `sandbox`, legacy `worker`). Backend cannot touch DOM | quick-start.md:28; runtime.md:5-12 |
| Frontend | Browser dynamic import; renders into host DOM via `ctx.dom.*` / `ctx.ui.*` / `ctx.components.*` | quick-start.md:29 |
| Enable/Disable | Starts/stops backend runtime; disable unregisters all macros/interceptors/tools/context handlers | lifecycle.md:12-15 |

## Permissions — ref/getting-started/permissions.md

Free tier (no declaration): events, storage, shared RPC pool, user storage, secure enclave
(AES-256-GCM secret storage), macros, DOM, drawer tabs, input-bar actions, variables,
logging, toasts, frontend<->backend messaging (permissions.md:5-21).

Gated tier relevant to the port:

| Permission | Grants | Source |
|---|---|---|
| `generation` | raw/quiet/batch LLM calls; list/inspect connection profiles and models | permissions.md:30 |
| `interceptor` | register pre-generation prompt interceptor | permissions.md:32 |
| `generation_parameters` | inject provider params via interceptors (useless without interceptor) | permissions.md:36 |
| `context_handler` | middleware enriching generation context before prompt assembly | permissions.md:35 |
| `chats` | CRUD chat sessions + getActive | permissions.md:39 |
| `chat_mutation` | read/modify messages within a chat | chats.md:172-176 |
| `characters` | CRUD character cards | permissions.md:38 |
| `presets` | CRUD presets, prompt blocks, category groups | permissions.md:40 |
| `decisions` | typed Choice/Score/Noul evaluation on Decision connections | permissions.md:31 |
| `cors_proxy` | HTTP via Lumiverse server | permissions.md:34 |
| `tools` | register LLM tools (function calling); council-eligible | permissions.md:33 |

Permission changes notify the extension at runtime via `spindle.permissions.onChanged` /
`PERMISSION_CHANGED` (permissions.md:133-168). Recommended pattern: gate at startup + defer
registration until granted (permissions.md:170-227).

## Interceptors — ref/backend-api/interceptors.md

- `spindle.registerInterceptor(handler, priority?, options?)`; runs after prompt assembly,
  before the provider. Receives `LlmMessageDTO[]` + context (chatId, generationType...).
  Returns modified array or `InterceptorResultDTO { messages, parameters?, breakdown? }`
  (interceptors.md:7-59).
- Permission: `interceptor`; `parameters` additionally needs `generation_parameters`
  (silently stripped without it) (interceptors.md:3, 44, 78).
- `breakdown: [{ messageIndex, name }]` marks injected messages as Prompt Breakdown entries,
  stamped with the extension's manifest attribution; visible in `spindle.generate.dryRun()`
  and the live generation break (interceptors.md:80-108). Native equivalent of Recursion's
  named prompt keys.
- Registration options include `match` filters (generation type, preset metadata fields)
  (interceptors.md:171-177).
- Calls via `spindle.generate.raw/quiet/batch` do NOT re-enter the interceptor chain
  (interceptors.md:179-181).

### Interceptor timeout (required answer)

- Wall-clock budget, resolved per run: (1) manifest `interceptorTimeoutMs`, (2) user setting
  `spindleSettings.interceptorTimeoutMs`, (3) default 10000 ms. Clamped [1000, 300000] ms
  (interceptors.md:183-193).
- On timeout: RPC rejected, error logged, and for OPTIONAL registrations the host passes the
  last-known message list through — late changes are dropped silently (interceptors.md:212-220).
- `required: true` (host capability `required-interceptors-v1 >= 1`): error or timeout stops
  the pipeline before the provider request (interceptors.md:222-235).
- Host aborts `context.signal` on timeout/cancellation; already-accepted effects cannot be
  rolled back; late replies do not resume (interceptors.md:235).
- Docs warn every interceptor ms is visible silence before the first token; "ship the tightest
  timeout that still accommodates your worst case" (interceptors.md:197-210).

Port consequence (fact-based): a multi-call pipeline inside the interceptor competes with this
budget — max 5 min via manifest, default 10 s. Longer pipelines must run outside the
interceptor (e.g. precompute on events, commit from storage) or set a large `interceptorTimeoutMs`.

## Context Handlers — ref-later/backend-api/context-handlers.md

- `spindle.registerContextHandler(handler, priority?, options?)`; runs BEFORE prompt assembly;
  modifies generation context, not final messages. Permission: `context_handler`
  (context-handlers.md:3-17).
- Context: chatId, generationType (`normal|continue|regenerate|swipe|impersonate`), dryRun,
  userId (context-handlers.md:21-31).
- `cancelGeneration: true` stops generation before any LLM call (context-handlers.md:40-51).
- Timeout: 10 s default, per-registration override clamped 1s-120s; errors/timeouts logged and
  generation continues (context-handlers.md:53-61). `required: true` on newer hosts
  (context-handlers.md:63-74).
- Handlers shape how the prompt is built; interceptors tweak the finished message array
  (context-handlers.md:76-77).

## World Info Interceptor — ref-later/backend-api/world-info-interceptor.md

`spindle.registerWorldInfoInterceptor` (permission `generation`): runs before world-info
activation; can disable entry IDs or override per-entry content/output order for the turn.
One per extension (world-info-interceptor.md:1-26).

## Model Calls On A Chosen Connection — ref/backend-api/generation.md, decisions.md

| API | Signature | Notes | Source |
|---|---|---|---|
| `spindle.generate.raw` | `{ messages, parameters?, connection_id?, tools?, reasoning?, signal? }` -> `{ content, finish_reason, usage, tool_calls? }` | Direct; `connection_id` selects a profile | generation.md:7-20, 53-62 |
| `spindle.generate.quiet` | `{ messages, ... }` | Uses the user's ACTIVE connection profile and preset parameters | generation.md:22-33 |
| `spindle.generate.batch` | `{ requests: [...], concurrent }` -> `Array<{ index, success, content?, error? }>` | Multiple requests | generation.md:38-51 |
| `spindle.connections.list/get/getModels` | profile inspection | `ConnectionProfileDTO { id, name, provider, api_url, model, preset_id, is_default, has_api_key, metadata, reasoning_bindings, ... }`; the key itself is never exposed | generation.md:787-815 |
| Tool calling | `tools: ToolSchemaDTO[]` | Round-trip via tool_use/tool_result message parts | generation.md:66-104 |
| Reasoning | `reasoning` per-request override; per-connection bindings via `reasoning_bindings` | generation.md:816-845 |
| Cancellation | `signal: AbortSignal` per request | generation.md:62 |
| `spindle.decisions.evaluate` | `{ state, questions }` typed choice/score/noul | Saved Decision connections (OpenRouter/TypeSafe); invalid connection_id fails; 1-256 questions; 1 MiB / depth 32; 30 s deadline; no auto-retry | decisions.md:10-46 |
| `spindle.decisions.listProviders/listConnections/getConnection/getModels` | connection inspection | decisions.md:48-57 |

Raw/quiet/batch are direct provider calls — they skip prompt assembly, context handlers, and
the interceptor chain (generation.md:35-36; interceptors.md:179-181).

### Generation and chat events — ref-later/backend-api/events.md

- Generation (require `generation` permission to subscribe): `GENERATION_STARTED`,
  `STREAM_TOKEN_RECEIVED`, `GENERATION_ENDED`, `GENERATION_STOPPED` (events.md:31-52).
- Chat: `MESSAGE_SENT`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, `MESSAGE_SWIPED` (action
  discriminator: added/updated/deleted/navigated), `SWIPE_EDITED`, `CHAT_CHANGED`,
  `CHAT_SWITCHED` (events.md:17-29, 54-121).
- Settings: `SETTINGS_UPDATED`, `PRESET_CHANGED`, `CONNECTION_PROFILE_LOADED` (events.md:133-141).

## Chats And Messages — ref/backend-api/chats.md

- `spindle.chats.list/get/getActive/update/delete` (permission `chats`); ChatDTO has
  id, character_id, name, metadata (chats.md:40-61).
- Message reading is `spindle.chat.getMessages(chatId)` under the separate `chat_mutation`
  permission (chats.md:163-176).
- `spindle.chats.getMemories(chatId, { topK })`: vector-search memory chunks, read-only;
  requires user embedding/vectorization config (chats.md:100-168).

## Storage — ref/backend-api/storage.md

- Private scoped dir `{DATA_DIR}/extensions/{identifier}/storage/`; read/write/delete/list/
  exists/mkdir/move/stat/getJson/setJson; traversal blocked (storage.md:1-75). Free tier.
- `spindle.userStorage` routes per-user: `{DATA_DIR}/users/{userId}/extensions/{identifier}/`
  (storage.md:79-127). Matches Recursion's per-user record layout needs.
- Secure enclave (free tier): encrypted at-rest secret storage, per-user (permissions.md:13).
- Ephemeral storage (gated): TTL + quotas (permissions.md:37).

## Native Pre-Generation Features (required answer — facts only)

| Feature | What it does | Source |
|---|---|---|
| Context handlers | Enrich generation context before prompt assembly; can cancel generation | context-handlers.md |
| Interceptors | Modify final message array after assembly; breakdown entries in Prompt Breakdown | interceptors.md |
| World info interceptor | Disable/override world-book entries before activation | world-info-interceptor.md |
| Council | READ-ONLY access to active Council members/settings/Lumia pool; council-eligible tools can be assigned to members "for pre-generation analysis" | council.md:1-43 |
| Chat memories | Vector retrieval of past segments for `{{memories}}` | chats.md:100-168 |
| Macros | Register `{{macros}}` usable in prompts (free tier) | permissions.md:14 |

Not found in docs: a native multi-step reasoning or card-deck feature equivalent to
Recursion's pipeline. Council is read-only inspection + tool eligibility; it does not itself
run a guided pre-generation analysis chain.

## Runtime / Misc

- Backend runtime modes: `process` (default, Bun subprocess), `sandbox` (macOS only; falls
  back elsewhere), `worker` (legacy). API identical across modes (runtime.md:3-14).
- Per-extension heavy work can be isolated via `spindle.backendProcesses` (runtime.md:116-121).
- Lifecycle: disable unregisters interceptors/handlers; storage survives disable and update,
  is deleted on removal (lifecycle.md:12-30).

