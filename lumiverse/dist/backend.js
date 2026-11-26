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
var RECURSION_GUIDANCE_TEXT = "[Recursion Guidance] Step 6a test guidance.";
var RECURSION_GUIDANCE_NAME = "Recursion Guidance";
var interceptorRegistered = false;
function tryRegisterInterceptor() {
  if (interceptorRegistered)
    return;
  if (!spindle.permissions.has("interceptor"))
    return;
  spindle.registerInterceptor(async (messages) => {
    try {
      const injected = {
        role: "system",
        content: RECURSION_GUIDANCE_TEXT
      };
      const injectedMessages = [injected, ...messages];
      spindle.log.info(`interceptor: injected messageIndex=0 breakdownEntries=1 messageCount=${injectedMessages.length}`);
      return {
        messages: injectedMessages,
        breakdown: [{ messageIndex: 0, name: RECURSION_GUIDANCE_NAME }]
      };
    } catch {
      spindle.log.error(`interceptor: failed; messages unchanged messageCount=${messages.length}`);
      return messages;
    }
  });
  interceptorRegistered = true;
  spindle.log.info("interceptor: registered priority=100 timeoutMs=10000");
}
tryRegisterInterceptor();
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === "interceptor" && granted)
    tryRegisterInterceptor();
});
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
  const chosen = connections.find((c) => c.is_default) ?? connections[0];
  spindle.log.info(`step4: using connection id=${chosen.id} name=${chosen.name} provider=${chosen.provider} model=${chosen.model || "(empty)"} default=${chosen.is_default}`);
  return chosen.id;
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
  let connectionId;
  try {
    const resolved = await resolveConnectionId(userId);
    if (!resolved)
      return;
    connectionId = resolved;
  } catch (error) {
    spindle.log.error(`step4: failed at resolve connection \u2014 ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const fixtureMessages = [{ role: "user", content: FIXTURE_PROMPT }];
  const parseFixtureContent = (content) => {
    try {
      const parsed = JSON.parse(content);
      const keys = parsed !== null && typeof parsed === "object" ? Object.keys(parsed).join(", ") || "(none)" : `non-object (${typeof parsed})`;
      spindle.log.info(`step4: parsed JSON keys: ${keys}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spindle.log.error(`step4: JSON.parse failed \u2014 content length ${content.length}, error: ${message}`);
      return false;
    }
  };
  let quietProfile = null;
  try {
    quietProfile = await spindle.connections.get(connectionId, userId);
  } catch {
    quietProfile = null;
  }
  const quietProvider = quietProfile?.provider || "(unknown)";
  const quietModel = quietProfile?.model || "(unknown)";
  let parsedSuccessfully = false;
  try {
    spindle.log.info(`diag: attempt variant=quiet profileId=${connectionId} provider=${quietProvider} model=${quietModel} requestModelField=none`);
    const result = await spindle.generate.quiet({
      type: "quiet",
      connection_id: connectionId,
      messages: fixtureMessages,
      userId
    });
    const content = result?.content;
    if (typeof content !== "string") {
      throw new Error("unexpected result shape \u2014 content is not a string");
    }
    spindle.log.info(`diag: success variant=quiet profileId=${connectionId} contentLength=${content.length}`);
    parsedSuccessfully = parseFixtureContent(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spindle.log.error(`diag: error variant=quiet profileId=${connectionId} provider=${quietProvider} model=${quietModel} error=${message.slice(0, 200)}`);
  }
  let rawProviderForLog;
  let rawModelForLog;
  try {
    const profile = await spindle.connections.get(connectionId, userId);
    if (!profile) {
      spindle.log.error(`diag: error variant=raw-explicit profileId=${connectionId} provider=(unknown) model=(unknown) error=connection profile not found`);
    } else {
      rawProviderForLog = profile.provider;
      rawModelForLog = profile.model;
      spindle.log.info(`diag: attempt variant=raw-explicit profileId=${connectionId} provider=${profile.provider} model=${profile.model} requestModelField=model`);
      const rawExplicit = spindle.generate.raw;
      const result = await rawExplicit({
        type: "raw",
        provider: profile.provider,
        model: profile.model,
        connection_id: connectionId,
        userId,
        messages: fixtureMessages
      });
      const content = result?.content;
      if (typeof content !== "string") {
        throw new Error("unexpected result shape \u2014 content is not a string");
      }
      spindle.log.info(`diag: success variant=raw-explicit profileId=${connectionId} contentLength=${content.length}`);
      if (parseFixtureContent(content))
        parsedSuccessfully = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spindle.log.error(`diag: error variant=raw-explicit profileId=${connectionId} provider=${rawProviderForLog ?? "(unknown)"} model=${rawModelForLog ?? "(unknown)"} error=${message.slice(0, 200)}`);
  }
  if (parsedSuccessfully) {
    try {
      await persistConnectionId(connectionId);
    } catch (error) {
      spindle.log.error(`step4: failed at persist connectionId \u2014 ${error instanceof Error ? error.message : String(error)}`);
    }
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
