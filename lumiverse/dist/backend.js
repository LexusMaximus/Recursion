// @bun
// src/backend.ts
var SETTINGS_PATH = "global/settings.json";
var DEFAULT_SETTINGS = { connectionId: "" };
async function loadOrCreateSettings() {
  const exists = await spindle.userStorage.exists(SETTINGS_PATH);
  if (!exists) {
    await spindle.userStorage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2 });
    spindle.log.info("settings: created default");
    return;
  }
  const settings = await spindle.userStorage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS });
  spindle.log.info(`settings: loaded existing ${JSON.stringify(settings)}`);
}
try {
  await loadOrCreateSettings();
} catch (error) {
  spindle.log.error(`settings: failed to load or create \u2014 ${String(error)}`);
}
