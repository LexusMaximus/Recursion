declare const spindle: import('lumiverse-spindle-types').SpindleAPI

export {}

const SETTINGS_PATH = 'global/settings.json'
const DEFAULT_SETTINGS = { connectionId: '' }
const WINDOW_SIZE = 20

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

// ---- Step 6a: inject one hard-coded guidance block ----
const RECURSION_GUIDANCE_TEXT = '[Recursion Guidance] Step 6a test guidance.'
const RECURSION_GUIDANCE_NAME = 'Recursion Guidance'

let interceptorRegistered = false

function tryRegisterInterceptor(): void {
  if (interceptorRegistered) return
  if (!spindle.permissions.has('interceptor')) return

  spindle.registerInterceptor(async (messages) => {
    try {
      const injected = {
        role: 'system' as const,
        content: RECURSION_GUIDANCE_TEXT,
      }
      const injectedMessages = [injected, ...messages]
      spindle.log.info(
        `interceptor: injected messageIndex=0 breakdownEntries=1 messageCount=${injectedMessages.length}`,
      )
      return {
        messages: injectedMessages,
        breakdown: [{ messageIndex: 0, name: RECURSION_GUIDANCE_NAME }],
      }
    } catch {
      spindle.log.error(`interceptor: failed; messages unchanged messageCount=${messages.length}`)
      return messages
    }
  })

  interceptorRegistered = true
  spindle.log.info('interceptor: registered priority=100 timeoutMs=10000')
}

tryRegisterInterceptor()
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'interceptor' && granted) tryRegisterInterceptor()
})

// ---- Step 4: one generate.raw JSON call (PLAN.md Step 4) ----
// Runs at most once per process: CHAT_CHANGED fires several times per action
// (NOTES.md Known Issues) and each call costs tokens. The flag is set
// SYNCHRONOUSLY at entry, before any await, so concurrent emissions cannot
// double-run; the generate.raw call below therefore starts after this.
let step4Done = false

// Fixture prompt — static, contains NO chat text.
const FIXTURE_PROMPT =
  'Return exactly this JSON object and nothing else: {"status":"ok","test":"recursion-step4"}'

async function resolveConnectionId(userId: string): Promise<string | null> {
  // Saved setting wins; otherwise first entry of connections.list
  // (generation.md:753-759; PLAN.md Step 4 temporary default until Step 7).
  const settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
  })
  if (typeof settings.connectionId === 'string' && settings.connectionId) {
    return settings.connectionId
  }
  // Operator-scoped extension: pass userId to scope the list (spindle-api.d.ts:642-646).
  const connections = await spindle.connections.list(userId)
  if (connections.length === 0) {
    spindle.log.warn('step4: no connection profiles available')
    return null
  }
  // Default profile first (generation.md:761 pattern); else first entry.
  const chosen = connections.find((c) => c.is_default) ?? connections[0]
  spindle.log.info(
    `step4: using connection id=${chosen.id} name=${chosen.name} provider=${chosen.provider} model=${chosen.model || '(empty)'} default=${chosen.is_default}`,
  )
  return chosen.id
}

async function persistConnectionId(connectionId: string): Promise<void> {
  // Persisted on FIRST SUCCESSFUL USE (PLAN.md:121), by read-merge-write of the
  // FULL settings object (manager change 2) — never clobber other keys.
  // spindle.storage, no userId (storage.md:73, 81).
  const settings = await spindle.storage.getJson<typeof DEFAULT_SETTINGS>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
  })
  const merged = { ...DEFAULT_SETTINGS, ...settings, connectionId }
  await spindle.storage.setJson(SETTINGS_PATH, merged, { indent: 2 })
  spindle.log.info(`step4: persisted connectionId ${connectionId} to settings`)
}

async function runStep4Once(userId: string): Promise<void> {
  if (step4Done) return
  step4Done = true
  // permissions.md:30 — generation covers raw + connections.list; permissions.md:178 — has().
  if (!spindle.permissions.has('generation')) {
    spindle.log.warn('step4: skipped — generation permission not granted (grant it, then restart to retry)')
    return
  }

  let connectionId: string
  try {
    const resolved = await resolveConnectionId(userId)
    if (!resolved) return
    connectionId = resolved
  } catch (error) {
    spindle.log.error(
      `step4: failed at resolve connection — ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }

  const fixtureMessages = [{ role: 'user' as const, content: FIXTURE_PROMPT }]
  const parseFixtureContent = (content: string): boolean => {
    try {
      const parsed: unknown = JSON.parse(content)
      const keys =
        parsed !== null && typeof parsed === 'object'
          ? Object.keys(parsed).join(', ') || '(none)'
          : `non-object (${typeof parsed})`
      spindle.log.info(`step4: parsed JSON keys: ${keys}`)
      return true
    } catch (error) {
      // Manager: on parse failure log ONLY content length + error message.
      const message = error instanceof Error ? error.message : String(error)
      spindle.log.error(
        `step4: JSON.parse failed — content length ${content.length}, error: ${message}`,
      )
      return false
    }
  }

  // Variant 1: quiet uses the selected connection. The profile lookup is only
  // for diagnostic labels; a lookup failure must not suppress the quiet call.
  // generation.md:22-33, 753-766; commands.md:177-183 (type: 'quiet').
  let quietProfile: { provider: string; model: string } | null = null
  try {
    quietProfile = await spindle.connections.get(connectionId, userId) // generation.md:770-779
  } catch {
    quietProfile = null
  }
  const quietProvider = quietProfile?.provider || '(unknown)'
  const quietModel = quietProfile?.model || '(unknown)'
  let parsedSuccessfully = false

  try {
    spindle.log.info(
      `diag: attempt variant=quiet profileId=${connectionId} provider=${quietProvider} model=${quietModel} requestModelField=none`,
    )
    const result: unknown = await spindle.generate.quiet({
      type: 'quiet',
      connection_id: connectionId,
      messages: fixtureMessages,
      // Operator-scoped extension: types-only (api.d.ts:483-488).
      userId,
    })
    const content = (result as { content?: unknown } | null)?.content
    if (typeof content !== 'string') {
      throw new Error('unexpected result shape — content is not a string')
    }
    spindle.log.info(
      `diag: success variant=quiet profileId=${connectionId} contentLength=${content.length}`,
    )
    parsedSuccessfully = parseFixtureContent(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spindle.log.error(
      `diag: error variant=quiet profileId=${connectionId} provider=${quietProvider} model=${quietModel} error=${message.slice(0, 200)}`,
    )
  }

  // Variant 2: raw with explicit top-level provider/model. The prose and
  // examples document those fields (generation.md:7-18, 286-293), while the
  // formal DTO table and installed types omit them (generation.md:53-62;
  // api.d.ts:454-520). Cast follows the LumiWorld pattern
  // (reference/LumiWorld/src/backend.ts:982-993).
  let rawProviderForLog: string | undefined
  let rawModelForLog: string | undefined
  try {
    const profile = await spindle.connections.get(connectionId, userId) // generation.md:770-779
    if (!profile) {
      spindle.log.error(
        `diag: error variant=raw-explicit profileId=${connectionId} provider=(unknown) model=(unknown) error=connection profile not found`,
      )
    } else {
      rawProviderForLog = profile.provider
      rawModelForLog = profile.model
      spindle.log.info(
        `diag: attempt variant=raw-explicit profileId=${connectionId} provider=${profile.provider} model=${profile.model} requestModelField=model`,
      )
      const rawExplicit = spindle.generate.raw as unknown as (
        input: {
          type: 'raw'
          provider: string
          model: string
          connection_id: string
          userId: string
          messages: Array<{ role: 'user'; content: string }>
        },
      ) => Promise<unknown>
      const result: unknown = await rawExplicit({
        type: 'raw',
        provider: profile.provider,
        model: profile.model,
        connection_id: connectionId,
        userId,
        messages: fixtureMessages,
      })
      const content = (result as { content?: unknown } | null)?.content
      if (typeof content !== 'string') {
        throw new Error('unexpected result shape — content is not a string')
      }
      spindle.log.info(
        `diag: success variant=raw-explicit profileId=${connectionId} contentLength=${content.length}`,
      )
      if (parseFixtureContent(content)) parsedSuccessfully = true
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spindle.log.error(
      `diag: error variant=raw-explicit profileId=${connectionId} provider=${rawProviderForLog ?? '(unknown)'} model=${rawModelForLog ?? '(unknown)'} error=${message.slice(0, 200)}`,
    )
  }

  if (parsedSuccessfully) {
    try {
      await persistConnectionId(connectionId)
    } catch (error) {
      spindle.log.error(
        `step4: failed at persist connectionId — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

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
spindle.on('CHAT_CHANGED', (payload, userId) => {
  // Temporary diagnostics: payload KEY NAMES only, never values — diagnosing the
  // docs/types mismatch (docs say { chatId }, events.md:26; api.d.ts:1329
  // ChatChangedPayloadDTO exposes `chat`).
  const keys = Object.keys((payload ?? {}) as object).join(', ') || '(none)'
  spindle.log.info(`chat-window: CHAT_CHANGED payload keys: ${keys}`)
  if (typeof userId !== 'string' || !userId) {
    spindle.log.warn('chat-window: no userId in CHAT_CHANGED event, skipped')
    return
  }
  void refreshChatWindow(userId).catch((error) => {
    spindle.log.error(`chat-window: refresh failed — ${String(error)}`)
  })
  // Step 4 one-shot model call (self-guarding via step4Done; never throws).
  void runStep4Once(userId)
})
