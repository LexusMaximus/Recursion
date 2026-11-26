// src/frontend.ts
function setup(ctx) {
  const tab = ctx.ui.registerDrawerTab({
    id: "recursion",
    title: "Recursion",
    shortName: "Recursion",
    headerTitle: "Recursion",
    description: "Recursion pre-generation settings: enable toggle and connection picker",
    keywords: ["recursion", "guidance", "cards", "connection"]
  });
  const root = tab.root;
  root.style.cssText = "display:flex;flex-direction:column;gap:12px;padding:12px";
  const stateLine = document.createElement("div");
  stateLine.textContent = "Loading...";
  root.appendChild(stateLine);
  const enabledRow = document.createElement("div");
  enabledRow.style.cssText = "display:flex;align-items:center;gap:8px";
  const enabledLabel = document.createElement("div");
  enabledLabel.textContent = "Enabled";
  const enabledSlot = document.createElement("div");
  enabledRow.appendChild(enabledLabel);
  enabledRow.appendChild(enabledSlot);
  root.appendChild(enabledRow);
  const connLabel = document.createElement("div");
  connLabel.textContent = "Connection";
  const connSlot = document.createElement("div");
  root.appendChild(connLabel);
  root.appendChild(connSlot);
  const readout = document.createElement("div");
  readout.style.cssText = "color:var(--lumiverse-text-muted,inherit);font-size:12px;white-space:pre-wrap";
  root.appendChild(readout);
  const toggle = ctx.components.mountSwitch(enabledSlot, {
    checked: false,
    onChange: (on) => ctx.sendToBackend({ type: "set_enabled", value: on })
  });
  const picker = ctx.components.mountSelect(connSlot, {
    value: "",
    placeholder: "Use default",
    emptyMessage: "No connection profiles available",
    onChange: (value) => ctx.sendToBackend({ type: "set_connection", value }),
    options: []
  });
  const requestState = () => ctx.sendToBackend({ type: "get_state" });
  requestState();
  const unsubActivate = tab.onActivate(requestState);
  const formatStatus = (message) => {
    const parts = [`last run: ${message.status}`];
    if (typeof message.stage === "string" && message.stage)
      parts.push(`stage=${message.stage}`);
    if (typeof message.ms === "number")
      parts.push(`ms=${message.ms}`);
    if (typeof message.blocks === "number")
      parts.push(`blocks=${message.blocks}`);
    if (typeof message.promptMessages === "number") {
      parts.push(`promptMessages=${message.promptMessages}`);
    }
    return parts.join(" ");
  };
  const unsubBackend = ctx.onBackendMessage((payload) => {
    const message = payload;
    if (!message || typeof message !== "object")
      return;
    switch (message.type) {
      case "state": {
        const connections = Array.isArray(message.connections) ? message.connections : [];
        const savedId = typeof message.connectionId === "string" ? message.connectionId : "";
        toggle.update({ checked: message.enabled === true });
        picker.update({
          options: [
            { value: "", label: "Use default" },
            ...connections.map((connection) => ({
              value: connection.id,
              label: connection.name || connection.id,
              sublabel: [connection.provider, connection.model].filter(Boolean).join(" / ")
            }))
          ],
          value: savedId
        });
        if (message.enabled !== true) {
          stateLine.textContent = "Disabled";
        } else {
          const chosen = connections.find((connection) => connection.id === savedId);
          stateLine.textContent = `Enabled - connection: ${savedId ? chosen?.name ?? savedId : "use default"}`;
        }
        return;
      }
      case "run_status":
        readout.textContent = formatStatus(message);
        return;
      case "error":
        readout.textContent = "last action failed - see server log";
        return;
      default:
        return;
    }
  });
  return () => {
    unsubBackend();
    unsubActivate();
    toggle.destroy();
    picker.destroy();
    tab.destroy();
  };
}
export {
  setup
};
