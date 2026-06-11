const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  moveBy(delta) {
    return ipcRenderer.invoke("pet-window:move-by", {
      x: Number(delta && delta.x) || 0,
      y: Number(delta && delta.y) || 0,
    });
  },
  minimize() {
    return ipcRenderer.invoke("pet-window:minimize");
  },
  close() {
    return ipcRenderer.invoke("pet-window:close");
  },
  setChatMode(enabled) {
    return ipcRenderer.invoke("pet-window:set-chat-mode", Boolean(enabled));
  },
  hasApiKey() {
    return ipcRenderer.invoke("takagi-chat:has-api-key");
  },
  getChatSettings() {
    return ipcRenderer.invoke("takagi-chat:get-settings");
  },
  saveChatSettings(settings) {
    return ipcRenderer.invoke("takagi-chat:save-settings", {
      provider: settings && settings.provider,
      apiKey: settings && settings.apiKey,
    });
  },
  saveApiKey(key) {
    return ipcRenderer.invoke("takagi-chat:save-api-key", String(key || ""));
  },
  sendMessage(text) {
    return ipcRenderer.invoke("takagi-chat:send-message", String(text || ""));
  },
});
