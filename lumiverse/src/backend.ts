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
})
