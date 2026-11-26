// Ported pipeline imports (Step 6b): fixed mini-deck + pure Step 5 modules.
import { MINI_DECK } from './deck.ts'
import { selectHand } from './cards.mjs'
import { composePromptPacket, packetToPromptBlocks } from './packet.mjs'
import { hashJson, truncate } from './core.mjs'

// packet.mjs is a JS port; its destructured default `precomposedGuidance = null`
// (lumiverse/src/packet.mjs:581) makes tsc infer that parameter as `null`, so the
// call is typed through this narrow local alias (same pattern as the approved
// generate.raw cast). Type-only: erased by bun build — no runtime change.
const composePacket = composePromptPacket as unknown as (args: {
  hand: unknown
  snapshot: { chatId: string; sceneFingerprint: string; turnFingerprint: string }
  settings: Record<string, never>
  precomposedGuidance: { status: 'used'; text: string; sourceCardIds: string[] } | null
}) => Promise<{
  diagnostics?: {
    guidanceStatus?: string
    composerLane?: string
    selectedCardCount?: number
  }
}>

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

export {}

const SETTINGS_PATH = 'global/settings.json'
// Step 7 (Option A): `enabled` defaults ON — a stored file without the field
// reads as enabled via the `!== false` coalescing at every read site.
// `connectionId: ''` means "use default": resolved per run (saved id ->
// is_default profile -> first), and NEVER written by the interceptor. The
// frontend picker (set_connection) is the only writer of connectionId.
const DEFAULT_SETTINGS = { enabled: true, connectionId: '' }
const WINDOW_SIZE = 20

// MUST mirror interceptorTimeoutMs in spindle.json — change both together
// (manifest field: manifest.md:40; resolution order + clamp: interceptors.md:187-193).
const INTERCEPTOR_TIMEOUT_MS = 30000
// Budget for the one generate.raw call inside the interceptor: manifest budget
// minus a margin for the window read + pure compose (sub-millisecond).
const RAW_BUDGET_MS = INTERCEPTOR_TIMEOUT_MS - 5000
// Per-message cap in the model prompt (bounds the request; inferred).
const MAX_PROMPT_LINE_CHARS = 400

const RECURSION_GUIDANCE_NAME = 'Recursion Guidance'

// Fallback userId source, captured from the CHAT_CHANGED handler's 2nd argument
// (types-only: spindle-api.d.ts:174/:210; proven at runtime in Steps 3-4).
// Never logged.
let lastKnownUserId = ''

type ChatMessage = Awaited<ReturnType<typeof spindle.chat.getMessages>>[number]

// Bounded chat window, IN MEMORY ONLY (manager decision: no chat text in the
// shared operator-scoped storage directory).
let windowedMessages: ChatMessage[] = []

async function loadOrCreateSettings(): Promise<void> {
  // Operator-scoped extension: spindle.storage is the shared extension-wide
  // directory (storage.md:73, 81) — no userId needed, unlike userStorage.
  // First-run detection: explicit exists() check (storage.md:54), NOT the getJson
  // fallback (storage.md:58) — fallback also applies on parse errors, so it cannot
  // distinguish "missing" from "corrupt". Default is written only when absent.
  const exists = await spindle.storage.exists(SETTINGS_PATH)
  if (!exists) {
    await spindle.storage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2 })
    spindle.log.info('settings: created default')
    return
  }
  const settings = await spindle.storage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS })
  spindle.log.info(`settings: loaded existing ${JSON.stringify(settings)}`)
}

try {
  await loadOrCreateSettings()
} catch (error) {
  spindle.log.error(`settings: failed to load or create — ${String(error)}`)
}

// ---- Step 6b: the real pipeline inside the interceptor (PLAN.md Step 6b) ----
// window -> selectHand(MINI_DECK) -> generate.raw (raw-explicit) -> JSON ->
// composePromptPacket -> packetToPromptBlocks -> ONE system message + ONE
// 'Recursion Guidance' breakdown entry. Any failure/timeout returns the
// messages unchanged (interceptors.md:212-220).

// LlmMessageDTO.content may be a plain string or typed parts
// (interceptors.md:130, 138-146); keep only text parts.
function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text')
    .map((part) => String(part?.text ?? ''))
    .filter((line) => line.trim())
    .join('\n')
}

// Chat-history turns are flagged __isChatHistory (interceptors.md:148); fall
// back to user/assistant messages when nothing is flagged.
function buildWindow(messages: ReadonlyArray<unknown>): Array<{ role: string; content: string }> {
  const asPlain = (message: unknown) => {
    const msg = message as { role?: unknown; content?: unknown }
    return {
      role: typeof msg?.role === 'string' ? msg.role : '',
      content: messageText(msg?.content),
    }
  }
  let history = messages
    .filter((message) => (message as { __isChatHistory?: unknown })?.__isChatHistory === true)
    .map(asPlain)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
  if (history.length === 0) {
    history = messages
      .map(asPlain)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
  }
  return history.slice(-WINDOW_SIZE)
}

// validatePromptPacket requires non-empty chatId/sceneFingerprint/turnFingerprint
// strings (lumiverse/src/packet.mjs:692-697). They feed packet metadata only —
// never the section texts (packet.mjs builds sections from cards/guidance/
// guardrails; verified separately with a composed-packet check).
function buildSnapshot(chatId: string, window: Array<{ role: string; content: string }>) {
  return {
    chatId,
    sceneFingerprint: hashJson(window),
    turnFingerprint: hashJson({
      chatId,
      messageCount: window.length,
      lastRole: window[window.length - 1]?.role ?? '',
    }),
  }
}

// Minimal model prompt (6b): strict-JSON guidance over the windowed transcript.
const GUIDANCE_SYSTEM_PROMPT =
  'You are the Recursion guidance composer. Read the recent chat below and reply with ONLY a JSON object, no prose, no markdown: ' +
  '{"text": "<1-4 sentences of concrete scene guidance for the next assistant reply>", "sourceCardIds": ["<relevant card id>"]}. ' +
  `Allowed card ids: ${MINI_DECK.map((card) => card.id).join(', ')}.`

function buildModelMessages(window: Array<{ role: string; content: string }>) {
  const transcript = window
    .map((m) => `${m.role}: ${truncate(m.content, MAX_PROMPT_LINE_CHARS)}`)
    .join('\n')
  return [
    { role: 'system' as const, content: GUIDANCE_SYSTEM_PROMPT },
    { role: 'user' as const, content: `Recent chat (oldest first):\n${transcript}` },
  ]
}

// Parse { text, sourceCardIds } out of the raw content. Throws on any shape
// problem; the caller catches and passes the messages through unchanged.
// normalizePrecomposedGuidance (lumiverse/src/packet.mjs:366-390) then filters
// sourceCardIds against the hand and demotes unsafe wording.
function parseGuidanceContent(rawContent: unknown): {
  status: 'used'
  text: string
  sourceCardIds: string[]
} {
  if (typeof rawContent !== 'string') {
    throw new Error('unexpected result shape — content is not a string')
  }
  let text = rawContent.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fenced) text = fenced[1].trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`JSON.parse failed — ${error instanceof Error ? error.message : String(error)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('parsed guidance JSON is not an object')
  }
  const guidanceText =
    typeof (parsed as { text?: unknown }).text === 'string'
      ? (parsed as { text: string }).text.trim()
      : ''
  if (!guidanceText) throw new Error('guidance text missing or empty')
  const rawIds = (parsed as { sourceCardIds?: unknown }).sourceCardIds
  const sourceCardIds = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === 'string')
    : []
  return { status: 'used', text: guidanceText, sourceCardIds }
}

let interceptorRegistered = false

function tryRegisterInterceptor(): void {
  if (interceptorRegistered) return
  if (!spindle.permissions.has('interceptor')) return

  spindle.registerInterceptor(async (messages, context) => {
    // Enabled gate FIRST (manager decision): one storage read per generation.
    // No documented storage watch API to cache against (storage.md:44-59).
    let settings: typeof DEFAULT_SETTINGS
    try {
      settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
        fallback: DEFAULT_SETTINGS,
      })
    } catch {
      // Fixed label, no error text (manager rule 3).
      spindle.log.warn(`pipeline: settings read failed promptMessages unchanged=${messages.length}`)
      return messages
    }
    if (settings.enabled === false) {
      spindle.log.info(`pipeline: disabled promptMessages unchanged=${messages.length}`)
      return messages
    }
    const contextUserId = typeof context?.userId === 'string' ? context.userId : ''
    const userId = contextUserId || lastKnownUserId
    const userIdSource = contextUserId ? 'context' : lastKnownUserId ? 'event' : 'none'
    // generationType is a LABEL only — never used to gate (manager decision).
    spindle.log.info(
      `pipeline: start promptMessages=${messages.length} generationType=${String(context?.generationType ?? '(unknown)')} userIdSource=${userIdSource}`,
    )
    let stage = 'window'
    try {
      if (!userId) {
        spindle.log.warn(`pipeline: skipped — no userId available promptMessages unchanged=${messages.length}`)
        return messages
      }
      if (!spindle.permissions.has('generation')) {
        spindle.log.warn(`pipeline: skipped — generation permission not granted promptMessages unchanged=${messages.length}`)
        return messages
      }
      const window = buildWindow(messages)
      if (window.length === 0) {
        spindle.log.warn(`pipeline: skipped — empty chat window promptMessages unchanged=${messages.length}`)
        return messages
      }
      const chatId = typeof context?.chatId === 'string' && context.chatId ? context.chatId : 'chat'
      spindle.log.info(`pipeline: window kept=${window.length} chatId=${chatId}`)

      stage = 'hand'
      // Spread copy (not a cast): MINI_DECK is readonly, the ported selectHand
      // parameter is a mutable array.
      const hand = selectHand([...MINI_DECK])
      spindle.log.info(`pipeline: hand cards=${hand.cards.length} omitted=${hand.omitted.length}`)

      stage = 'connection'
      const resolved = await resolveConnectionId(userId)
      if (!resolved) {
        spindle.log.warn(`pipeline: skipped — no connection profile promptMessages unchanged=${messages.length}`)
        return messages
      }
      stage = 'profile'
      const profile = await spindle.connections.get(resolved.connectionId, userId)
      if (!profile) {
        // Documented null return (generation.md:772): skip and log, never throw.
        spindle.log.warn(`pipeline: connection profile not found; skipped promptMessages unchanged=${messages.length}`)
        return messages
      }

      stage = 'raw'
      // One AbortController drives the raw call; the host's context.signal
      // (aborted on timeout or generation cancellation, interceptors.md:227-235)
      // is forwarded onto it, so EITHER source cancels the in-flight request.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), RAW_BUDGET_MS)
      const onHostAbort = () => controller.abort()
      const hostSignal = context?.signal
      if (hostSignal) {
        if (hostSignal.aborted) controller.abort()
        else hostSignal.addEventListener('abort', onHostAbort, { once: true })
      }
      let rawContent: unknown
      try {
        // provider/model are documented in prose/examples only (generation.md:7-18,
        // 286-293); the DTO table (generation.md:53-62) and installed types omit
        // them, so the call is typed-cast like the Step 4 probe / LumiWorld
        // (reference/LumiWorld/src/backend.ts:982-993). No parameters at all
        // (no parameters.model — Task A).
        const raw = spindle.generate.raw as unknown as (input: {
          type: 'raw'
          provider: string
          model: string
          connection_id: string
          userId: string
          messages: Array<{ role: 'system' | 'user'; content: string }>
          signal?: AbortSignal
        }) => Promise<unknown>
        const startedAt = Date.now()
        const result: unknown = await raw({
          type: 'raw',
          provider: profile.provider,
          model: profile.model,
          connection_id: resolved.connectionId,
          userId,
          messages: buildModelMessages(window),
          signal: controller.signal,
        })
        const candidate = (result as { content?: unknown } | null)?.content
        if (typeof candidate !== 'string') {
          throw new Error('unexpected result shape — content is not a string')
        }
        rawContent = candidate
        spindle.log.info(`pipeline: raw done ms=${Date.now() - startedAt} contentLength=${candidate.length}`)
      } finally {
        // Clear the timer and detach the host-signal listener on EVERY exit.
        clearTimeout(timer)
        if (hostSignal) hostSignal.removeEventListener('abort', onHostAbort)
      }
      stage = 'parse'
      const precomposedGuidance = parseGuidanceContent(rawContent)

      stage = 'compose'
      const packet = await composePacket({
        hand,
        snapshot: buildSnapshot(chatId, window),
        settings: {},
        precomposedGuidance,
      })
      spindle.log.info(
        `pipeline: guidance status=${packet.diagnostics?.guidanceStatus ?? '(unknown)'} composerLane=${packet.diagnostics?.composerLane ?? '(unknown)'} selectedCards=${packet.diagnostics?.selectedCardCount ?? 0}`,
      )
      const blocks = packetToPromptBlocks(packet)
      const combined = blocks
        .map((block: { text?: string }) => String(block?.text ?? ''))
        .filter((text: string) => text.trim())
        .join('\n\n')
      if (!combined) {
        spindle.log.warn(`pipeline: skipped — combined block text empty promptMessages unchanged=${messages.length}`)
        return messages
      }

      stage = 'inject'
      // THREE packet blocks -> ONE message + ONE breakdown entry (decision 3).
      const injected = [{ role: 'system' as const, content: combined }, ...messages]
      const injectedBlocks = blocks.filter((block: { text?: string }) =>
        String(block?.text ?? '').trim(),
      ).length
      spindle.log.info(
        `pipeline: injected messageIndex=0 blocks=${injectedBlocks}/3 promptMessages=${injected.length}`,
      )
      // Readout to the drawer tab: status label + counts only (manager rule 6).
      sendRunStatus('injected', { blocks: injectedBlocks, promptMessages: injected.length }, userId)
      return {
        messages: injected,
        breakdown: [{ messageIndex: 0, name: RECURSION_GUIDANCE_NAME }],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      spindle.log.error(
        `pipeline: failed stage=${stage} error=${message.slice(0, 200)} promptMessages unchanged=${messages.length}`,
      )
      sendRunStatus('failed', { stage, promptMessages: messages.length }, userId)
      return messages
    }
  })

  interceptorRegistered = true
  // Keep in sync with interceptorTimeoutMs in spindle.json (both 30000).
  spindle.log.info(`interceptor: registered priority=100 timeoutMs=${INTERCEPTOR_TIMEOUT_MS}`)
}

tryRegisterInterceptor()
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'interceptor' && granted) tryRegisterInterceptor()
})

// ---- Pipeline connection helpers ----
// Step 7 (Option A): read-only resolution — saved id -> is_default profile ->
// first entry (generation.md:753-768, 761 pattern). The interceptor NEVER
// writes connectionId; the frontend picker (set_connection) is the only writer.
async function resolveConnectionId(userId: string): Promise<{ connectionId: string } | null> {
  const settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
  })
  if (typeof settings.connectionId === 'string' && settings.connectionId) {
    return { connectionId: settings.connectionId }
  }
  // Operator-scoped extension: pass userId to scope the list (spindle-api.d.ts:642-646).
  const connections = await spindle.connections.list(userId)
  if (connections.length === 0) {
    spindle.log.warn('pipeline: no connection profiles available')
    return null
  }
  // Default profile first (generation.md:761 pattern); else first entry.
  // provider/model deliberately NOT logged (manager rule: no provider/model).
  const chosen = connections.find((c) => c.is_default) ?? connections[0]
  spindle.log.info(`pipeline: connection selected id=${chosen.id} default=${chosen.is_default}`)
  return { connectionId: chosen.id }
}



// ---- Step 7: frontend drawer-tab messaging ----
// Channel docs: spindle.onFrontendMessage / sendToFrontend
// (frontend-communication.md:23-63); ctx.sendToBackend / ctx.onBackendMessage
// (backend-communication.md:3-21). Free tier (permissions.md:21).
// Payloads carry ONLY: status labels, stage names, ms, counts, connection
// entries { id, name, provider, model, is_default }, enabled, connectionId.
// Never guidance/model/message text, userId, api_url, metadata, or keys.

type ConnectionOption = {
  id: string
  name: string
  provider: string
  model: string
  is_default: boolean
}

// Whitelist projection of ConnectionProfileDTO (generation.md:799-814) —
// api_url, metadata, preset_id, reasoning_bindings, timestamps, has_api_key
// are deliberately dropped.
function toConnectionOptions(
  connections: Awaited<ReturnType<typeof spindle.connections.list>>,
): ConnectionOption[] {
  const options: ConnectionOption[] = []
  for (const connection of connections) {
    const id = typeof connection?.id === 'string' ? connection.id : ''
    if (!id) continue
    options.push({
      id,
      name: typeof connection.name === 'string' ? connection.name : id,
      provider: typeof connection.provider === 'string' ? connection.provider : '',
      model: typeof connection.model === 'string' ? connection.model : '',
      is_default: connection.is_default === true,
    })
  }
  return options
}

// Interceptor-path readout: own try/catch, always passes userId, sends nothing
// when no userId is known (frontend-communication.md:17-21, 43).
function sendRunStatus(
  status: 'injected' | 'failed',
  fields: { stage?: string; ms?: number; blocks?: number; promptMessages?: number },
  userId: string,
): void {
  if (!userId) return
  try {
    spindle.sendToFrontend({ type: 'run_status', status, ...fields }, userId)
  } catch {
    // Best-effort readout; nothing else to do.
  }
}

async function sendState(userId: string): Promise<void> {
  const settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
  })
  // The state reply ALWAYS goes out, even when the connections list fails
  // (fixed label, no error text — manager rule 3).
  let connections: ConnectionOption[] = []
  try {
    connections = toConnectionOptions(await spindle.connections.list(userId))
    // Count only in logs — never provider/model names (manager rule 10).
    spindle.log.info(`ui: connections listed count=${connections.length}`)
  } catch {
    spindle.log.warn('ui: connections list failed')
  }
  spindle.sendToFrontend(
    {
      type: 'state',
      enabled: settings.enabled !== false,
      connectionId: typeof settings.connectionId === 'string' ? settings.connectionId : '',
      connections,
    },
    userId,
  )
}

// Read-merge-write of ONE key (manager correction 2) — never clobber the other.
// spindle.storage needs no userId (storage.md:73, 81).
async function writeSettingsKey(
  key: 'enabled' | 'connectionId',
  value: boolean | string,
): Promise<void> {
  const settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
  })
  const merged = { ...DEFAULT_SETTINGS, ...settings, [key]: value }
  await spindle.storage.setJson(SETTINGS_PATH, merged, { indent: 2 })
}

async function handleFrontendMessage(type: string, payload: unknown, userId: string): Promise<void> {
  switch (type) {
    case 'get_state':
      await sendState(userId)
      return
    case 'set_enabled': {
      const value = (payload as { value?: unknown } | null)?.value
      if (typeof value !== 'boolean') throw new Error('invalid set_enabled value')
      await writeSettingsKey('enabled', value)
      spindle.log.info(`ui: set enabled=${value}`)
      await sendState(userId)
      return
    }
    case 'set_connection': {
      const value = (payload as { value?: unknown } | null)?.value
      if (typeof value !== 'string') throw new Error('invalid set_connection value')
      if (value === '') {
        // "Use default": clear the saved id (Option A). Lumiverse's own default
        // profile is never touched — we only write our own settings file.
        await writeSettingsKey('connectionId', '')
        spindle.log.info('ui: cleared connectionId (use default)')
      } else {
        // Non-empty id: verify it exists first; unknown id -> error reply, no write.
        const profile = await spindle.connections.get(value, userId)
        if (!profile) {
          spindle.log.error('ui: handler failed type=set_connection')
          spindle.sendToFrontend({ type: 'error' }, userId)
          return
        }
        await writeSettingsKey('connectionId', value)
        spindle.log.info(`ui: set connectionId=${value}`)
      }
      await sendState(userId)
      return
    }
  }
}

const KNOWN_FRONTEND_MESSAGE_TYPES = ['get_state', 'set_enabled', 'set_connection']

spindle.onFrontendMessage((payload, userId) => {
  // Remember the sender's id (never logged) as the interceptor's fallback
  // userId source, alongside the CHAT_CHANGED 2nd argument.
  if (typeof userId === 'string' && userId) lastKnownUserId = userId
  const rawType = (payload as { type?: unknown } | null)?.type
  const type = typeof rawType === 'string' ? rawType : ''
  if (!KNOWN_FRONTEND_MESSAGE_TYPES.includes(type)) {
    // Log and ignore — the unknown type string is never echoed into the log.
    spindle.log.info('ui: unknown message type ignored')
    return
  }
  if (typeof userId !== 'string' || !userId) {
    spindle.log.warn('ui: no userId on message, skipped')
    return
  }
  void handleFrontendMessage(type, payload, userId).catch(() => {
    // Fixed label, no error text (manager rules 1, 10).
    spindle.log.error(`ui: handler failed type=${type}`)
    try {
      spindle.sendToFrontend({ type: 'error' }, userId)
    } catch {
      // Best-effort error reply.
    }
  })
})

function hasChatPermissions(): boolean {
  // permissions.md:178 — spindle.permissions.has() is the documented check.
  return spindle.permissions.has('chats') && spindle.permissions.has('chat_mutation')
}

async function refreshChatWindow(userId: string): Promise<void> {
  if (!hasChatPermissions()) {
    windowedMessages = []
    spindle.log.warn('chat-window: skipped — chats/chat_mutation permission not granted')
    return
  }
  // Operator-scoped extension: getActive resolves the per-user activeChatId
  // setting, so it needs a userId. Source is the installed types, not the docs
  // (spindle-api.d.ts:911 getActive(userId?); :174/:210 event handler's second
  // userId argument). The docs never state how an operator-scoped extension
  // obtains a userId (chats.md:179 only says "resolved from the extension context").
  const active = await spindle.chats.getActive(userId) // chats.md:46 — null when no chat open
  if (!active) {
    windowedMessages = []
    spindle.log.warn('chat-window: no active chat')
    return
  }
  const all = await spindle.chat.getMessages(active.id) // chat-mutation.md:89
  windowedMessages = all.slice(-WINDOW_SIZE)
  // Logs ids and counts only — never message text.
  spindle.log.info(
    `chat-window: kept ${windowedMessages.length} of ${all.length} messages for chat ${active.id}`,
  )
}

// No startup read: at startup an operator-scoped extension has no userId, and
// getActive() without one throws (see refreshChatWindow). The window is built
// lazily from CHAT_CHANGED events, which carry the acting user's id.
// CHAT_CHANGED subscription is free tier (permissions.md:9). The event userId
// comes from the handler's second argument (installed types, not docs:
// spindle-api.d.ts:174 CHAT_CHANGED overload; :210 generic overload). Failures
// are logged, never thrown.
spindle.on('CHAT_CHANGED', (_payload, userId) => {
  if (typeof userId !== 'string' || !userId) {
    spindle.log.warn('chat-window: no userId in CHAT_CHANGED event, skipped')
    return
  }
  // Remember the acting user's id (types-only 2nd argument, spindle-api.d.ts:174/:210)
  // as the interceptor's fallback userId source. Never logged.
  lastKnownUserId = userId
  void refreshChatWindow(userId).catch((error) => {
    spindle.log.error(`chat-window: refresh failed — ${String(error)}`)
  })
})
