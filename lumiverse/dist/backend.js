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
var step4Done = false;
var FIXTURE_PROMPT = 'Return exactly this JSON object and nothing else: {"status":"ok","test":"recursion-step4"}';
async function resolveConnectionId(userId) {
  const settings = await spindle.storage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS
  });
  if (typeof settings.connectionId === "string" && settings.connectionId) {
    return settings.connectionId;
  }
  const connections = await spindle.connections.list(userId);
  if (connections.length === 0) {
    spindle.log.warn("step4: no connection profiles available");
    return null;
  }
  const connectionId = connections[0].id;
  return connectionId;
}
async function persistConnectionId(connectionId) {
  const settings = await spindle.storage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS
  });
  const merged = { ...DEFAULT_SETTINGS, ...settings, connectionId };
  await spindle.storage.setJson(SETTINGS_PATH, merged, { indent: 2 });
  spindle.log.info(`step4: persisted connectionId ${connectionId} to settings`);
}
async function runStep4Once(userId) {
  if (step4Done)
    return;
  step4Done = true;
  if (!spindle.permissions.has("generation")) {
    spindle.log.warn("step4: skipped \u2014 generation permission not granted (grant it, then restart to retry)");
    return;
  }
  let stage = "resolve connection";
  try {
    const connectionId = await resolveConnectionId(userId);
    if (!connectionId)
      return;
    stage = "generate.raw";
    const result = await spindle.generate.raw({
      type: "raw",
      connection_id: connectionId,
      messages: [{ role: "user", content: FIXTURE_PROMPT }],
      userId
    });
    const content = result?.content;
    if (typeof content !== "string") {
      spindle.log.warn("step4: unexpected result shape \u2014 content is not a string");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spindle.log.error(`step4: JSON.parse failed \u2014 content length ${content.length}, error: ${message}`);
      return;
    }
    const keys = parsed !== null && typeof parsed === "object" ? Object.keys(parsed).join(", ") || "(none)" : `non-object (${typeof parsed})`;
    spindle.log.info(`step4: parsed JSON keys: ${keys}`);
    await persistConnectionId(connectionId);
  } catch (error) {
    spindle.log.error(`step4: failed at ${stage} \u2014 ${error instanceof Error ? error.message : String(error)}`);
  }
}
function hasChatPermissions() {
  return spindle.permissions.has("chats") && spindle.permissions.has("chat_mutation");
}
async function refreshChatWindow(userId) {
  if (!hasChatPermissions()) {
    windowedMessages = [];
    spindle.log.warn("chat-window: skipped \u2014 chats/chat_mutation permission not granted");
    return;
  }
  const active = await spindle.chats.getActive(userId);
  if (!active) {
    windowedMessages = [];
    spindle.log.warn("chat-window: no active chat");
    return;
  }
  const all = await spindle.chat.getMessages(active.id);
  windowedMessages = all.slice(-WINDOW_SIZE);
  spindle.log.info(`chat-window: kept ${windowedMessages.length} of ${all.length} messages for chat ${active.id}`);
}
spindle.on("CHAT_CHANGED", (payload, userId) => {
  const keys = Object.keys(payload ?? {}).join(", ") || "(none)";
  spindle.log.info(`chat-window: CHAT_CHANGED payload keys: ${keys}`);
  if (typeof userId !== "string" || !userId) {
    spindle.log.warn("chat-window: no userId in CHAT_CHANGED event, skipped");
    return;
  }
  refreshChatWindow(userId).catch((error) => {
    spindle.log.error(`chat-window: refresh failed \u2014 ${String(error)}`);
  });
  runStep4Once(userId);
});
