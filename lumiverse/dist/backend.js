// @bun
// src/backend.ts
var SETTINGS_PATH = "global/settings.json";
var DEFAULT_SETTINGS = { connectionId: "" };
var WINDOW_SIZE = 20;
var windowedMessages = [];
async function loadOrCreateSettings() {
  const exists = await spindle.storage.exists(SETTINGS_PATH);
  if (!exists) {
    await spindle.storage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2 });
    spindle.log.info("settings: created default");
    return;
  }
  const settings = await spindle.storage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS });
  spindle.log.info(`settings: loaded existing ${JSON.stringify(settings)}`);
}
try {
  await loadOrCreateSettings();
} catch (error) {
  spindle.log.error(`settings: failed to load or create \u2014 ${String(error)}`);
}
function hasChatPermissions() {
  return spindle.permissions.has("chats") && spindle.permissions.has("chat_mutation");
}
async function refreshChatWindow() {
  if (!hasChatPermissions()) {
    windowedMessages = [];
    spindle.log.warn("chat-window: skipped \u2014 chats/chat_mutation permission not granted");
    return;
  }
  const active = await spindle.chats.getActive();
  if (!active) {
    windowedMessages = [];
    spindle.log.warn("chat-window: no active chat");
    return;
  }
  const all = await spindle.chat.getMessages(active.id);
  windowedMessages = all.slice(-WINDOW_SIZE);
  spindle.log.info(`chat-window: kept ${windowedMessages.length} of ${all.length} messages for chat ${active.id}`);
}
try {
  await refreshChatWindow();
} catch (error) {
  windowedMessages = [];
  spindle.log.error(`chat-window: initial read failed \u2014 ${String(error)}`);
}
spindle.on("CHAT_CHANGED", () => {
  refreshChatWindow().catch((error) => {
    spindle.log.error(`chat-window: refresh failed \u2014 ${String(error)}`);
  });
});
