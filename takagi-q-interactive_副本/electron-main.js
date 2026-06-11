const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

let mainWindow;
let controlServer;
let conversation = [];
let conversationProvider = "openai";
const pidFile = path.join(__dirname, "takagi-q.pid");
const logFile = "/tmp/takagi-q-desktop-pet.log";
const controlHost = "127.0.0.1";
const controlPort = 17431;
const smallWindowSize = { width: 240, height: 300 };
const chatWindowSize = { width: 520, height: 560 };
const providerModels = {
  openai: "gpt-5.5",
  deepseek: "deepseek-v4-flash",
};
const takagiInstructions =
  "你是一个温柔、聪明、带一点调皮感的 Takagi_Q 桌面宠物。用中文回复，你的说话风格，跟高木同学一样，语气自然亲近。回答要简洁，通常 1 到 4 句；用户需要帮助时可以更具体，但不要太长。当用户让你查资料、搜索网页或总结当前网页时，你会收到来自 Safari 的资料上下文；请基于这些资料回答，不确定时说明资料不足。";
const maxSafariTextChars = 9000;
const safariSearchDelayMs = 1800;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

function clampWindowToDisplay(win, nextX, nextY) {
  const bounds = win.getBounds();
  return clampBoundsToDisplay(nextX, nextY, bounds.width, bounds.height);
}

function clampBoundsToDisplay(nextX, nextY, width, height) {
  const display = screen.getDisplayNearestPoint({
    x: nextX + width / 2,
    y: nextY + height / 2,
  });
  const area = display.workArea;
  const margin = 36;

  return {
    x: Math.round(Math.min(area.x + area.width - margin, Math.max(area.x - width + margin, nextX))),
    y: Math.round(Math.min(area.y + area.height - margin, Math.max(area.y, nextY))),
  };
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function getApiKey() {
  return getProviderApiKey(getActiveProvider());
}

function normalizeProvider(provider) {
  return provider === "deepseek" ? "deepseek" : "openai";
}

function getActiveProvider() {
  const settings = readSettings();
  return normalizeProvider(settings.activeProvider);
}

function getProviderApiKey(provider) {
  const settings = readSettings();
  const keyName = normalizeProvider(provider) === "deepseek" ? "deepseekApiKey" : "openaiApiKey";
  return typeof settings[keyName] === "string" ? settings[keyName].trim() : "";
}

function getChatSettings() {
  const provider = getActiveProvider();
  return {
    provider,
    hasOpenAIKey: Boolean(getProviderApiKey("openai")),
    hasDeepSeekKey: Boolean(getProviderApiKey("deepseek")),
    hasActiveKey: Boolean(getProviderApiKey(provider)),
    model: providerModels[provider],
  };
}

function clearConversationForProvider(provider) {
  const normalized = normalizeProvider(provider);
  if (conversationProvider !== normalized) {
    conversation = [];
    conversationProvider = normalized;
  }
}

function setWindowSize(win, size) {
  const bounds = win.getBounds();
  const centerX = bounds.x + bounds.width / 2;
  const bottomY = bounds.y + bounds.height;
  const next = clampBoundsToDisplay(centerX - size.width / 2, bottomY - size.height, size.width, size.height);
  win.setBounds({
    x: next.x,
    y: next.y,
    width: size.width,
    height: size.height,
  });
}

function getInitialWindowPosition(size) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + area.width - size.width),
    y: Math.round(area.y + area.height - size.height),
  };
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.showInactive();
    return;
  }

  const initialPosition = getInitialWindowPosition(smallWindowSize);
  log("creating BrowserWindow");
  mainWindow = new BrowserWindow({
    x: initialPosition.x,
    y: initialPosition.y,
    width: smallWindowSize.width,
    height: smallWindowSize.height,
    minWidth: 220,
    minHeight: 270,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Takagi Q",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.on("closed", () => {
    log("window closed");
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log(`render process gone: ${JSON.stringify(details)}`);
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"), { query: { desktop: "1" } });
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncateText(text, maxLength = maxSafariTextChars) {
  const normalized = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n\n[页面内容较长，后面已省略。]`;
}

function friendlySafariError(error) {
  const message = `${(error && error.message) || ""}\n${(error && error.stderr) || ""}`.trim();
  if (/JavaScript|do JavaScript|(-1708)/i.test(message)) {
    return "Safari 还不允许 Apple Events 读取网页内容。请在 Safari 的“开发”菜单里打开“允许来自 Apple 事件的 JavaScript”，然后再让我看看这一页。";
  }
  if (/not authorized|not allowed|Operation not permitted|(-1743)|privacy|Automation/i.test(message)) {
    return "我还没有拿到控制 Safari 的权限。去“系统设置 > 隐私与安全性 > 自动化”里允许 Takagi Q 或 Electron 控制 Safari，然后再让我试一次吧。";
  }
  if (/NO_DOCUMENT|Invalid index|Can’t get document/i.test(message)) {
    return "Safari 现在好像没有打开的网页。你可以先打开一个页面，或者让我搜索一个关键词。";
  }
  if (/timeout|timed out/i.test(message)) {
    return "Safari 这次回应得有点慢，我没顺利看到网页内容。";
  }
  return `我没顺利操作 Safari：${message || "未知错误"}`;
}

async function runAppleScript(script, args = [], timeout = 12000) {
  try {
    const result = await execFileAsync("/usr/bin/osascript", ["-e", script, ...args], {
      timeout,
      maxBuffer: 1024 * 1024 * 2,
    });
    return String(result.stdout || "").trim();
  } catch (error) {
    throw new Error(friendlySafariError(error));
  }
}

function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function parseSafariIntent(text) {
  const message = String(text || "").trim();
  if (!message) return null;

  const urlMatch = message.match(/https?:\/\/[^\s，。！？)）]+/i);
  if (urlMatch && /打开|访问|浏览|看看|查|资料|搜索/.test(message)) {
    return { type: "open", target: urlMatch[0] };
  }

  if (/当前网页|当前页面|这个网页|这个页面|这页|总结.*网页|总结.*页面|看看.*网页|看看.*页面/.test(message)) {
    return { type: "current" };
  }

  if (/查资料|搜索|搜一下|查一下|浏览网页|帮我查|帮我搜|资料/.test(message)) {
    const query = message
      .replace(/帮我|请你|用 Safari|用safari|在 Safari|在safari|查资料|搜索|搜一下|查一下|浏览网页|资料|关于/g, " ")
      .replace(/[，。！？?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { type: "search", target: query || message };
  }

  return null;
}

function parseSafariPage(rawOutput) {
  const [title = "", url = "", ...textLines] = String(rawOutput || "").split(/\r?\n/);
  return {
    title: title.trim() || "未命名网页",
    url: url.trim(),
    text: truncateText(textLines.join("\n")),
  };
}

async function openSafariUrl(url) {
  await runAppleScript(
    `
on run argv
  set targetUrl to item 1 of argv
  tell application "Safari"
    activate
    if (count of documents) is 0 then
      make new document with properties {URL:targetUrl}
    else
      set URL of front document to targetUrl
    end if
  end tell
end run
`,
    [url]
  );
}

async function readSafariPage() {
  const output = await runAppleScript(`
tell application "Safari"
  if (count of documents) is 0 then error "NO_DOCUMENT"
  set pageTitle to name of front document
  set pageUrl to URL of front document
  set pageText to do JavaScript "document.body ? document.body.innerText : document.documentElement.innerText" in front document
  return pageTitle & linefeed & pageUrl & linefeed & pageText
end tell
`);
  return parseSafariPage(output);
}

async function runSafariIntent(intent) {
  if (intent.type === "open") {
    await openSafariUrl(intent.target);
    await delay(safariSearchDelayMs);
    return readSafariPage();
  }
  if (intent.type === "search") {
    await openSafariUrl(buildSearchUrl(intent.target));
    await delay(safariSearchDelayMs);
    return readSafariPage();
  }
  return readSafariPage();
}

function formatSafariContext(intent, page) {
  const action =
    intent.type === "search"
      ? `Safari 搜索关键词：${intent.target}`
      : intent.type === "open"
        ? `Safari 打开的网页：${intent.target}`
        : "Safari 当前网页";
  return [
    "[Safari 浏览资料]",
    action,
    `标题：${page.title}`,
    `URL：${page.url}`,
    "页面正文：",
    page.text || "页面没有可读取的正文。",
  ].join("\n");
}

function toOpenAIResponseInput() {
  return conversation.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function toChatMessages() {
  return [
    { role: "system", content: takagiInstructions },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

async function requestOpenAIReply(apiKey, signal) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: providerModels.openai,
      instructions: takagiInstructions,
      input: toOpenAIResponseInput(),
    }),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : `OpenAI 请求失败 (${response.status})`;
    throw new Error(message);
  }

  return extractOutputText(payload);
}

async function requestDeepSeekReply(apiKey, signal) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: providerModels.deepseek,
      messages: toChatMessages(),
      stream: false,
    }),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : `DeepSeek 请求失败 (${response.status})`;
    throw new Error(message);
  }

  return (
    payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    typeof payload.choices[0].message.content === "string"
      ? payload.choices[0].message.content.trim()
      : ""
  );
}

async function requestTakagiReply(text) {
  const provider = getActiveProvider();
  clearConversationForProvider(provider);
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    throw new Error(`还没有设置 ${provider === "deepseek" ? "DeepSeek" : "OpenAI"} API key。`);
  }

  let userContent = text;
  if (provider === "deepseek") {
    const safariIntent = parseSafariIntent(text);
    if (safariIntent) {
      try {
        const page = await runSafariIntent(safariIntent);
        const safariContext = formatSafariContext(safariIntent, page);
        userContent = `${text}\n\n${safariContext}\n\n请你基于上面的 Safari 浏览资料回答用户。资料不足时请直接说明，不要假装已经看到了更多内容。`;
      } catch (error) {
        return error && error.message ? error.message : "我没顺利看到 Safari 的网页内容。";
      }
    }
  }

  conversation.push({ role: "user", content: userContent });
  conversation = conversation.slice(-16);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const reply =
      (provider === "deepseek"
        ? await requestDeepSeekReply(apiKey, controller.signal)
        : await requestOpenAIReply(apiKey, controller.signal)) || "我刚才有点走神了，可以再说一次吗？";
    conversation.push({ role: "assistant", content: reply });
    conversation = conversation.slice(-16);
    return reply;
  } catch (error) {
    const lastMessage = conversation[conversation.length - 1];
    if (lastMessage && lastMessage.role === "user" && lastMessage.content === userContent) {
      conversation.pop();
    }
    if (error && error.name === "AbortError") {
      throw new Error("等太久啦，网络好像没有回应。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createControlServer() {
  controlServer = http.createServer((req, res) => {
    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid, running: Boolean(mainWindow) }));
      return;
    }

    if (req.url === "/quit") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, quitting: true }));
      app.quit();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });

  controlServer.listen(controlPort, controlHost, () => {
    log(`control server listening on ${controlHost}:${controlPort}`);
  });

  controlServer.on("error", (error) => {
    log(`control server error: ${error.message}`);
  });
}

app.on("second-instance", () => {
  log("second instance requested");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.showInactive();
  }
});

app.whenReady().then(() => {
  fs.writeFileSync(pidFile, String(process.pid));
  log(`app ready pid=${process.pid}`);
  createControlServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  log("before quit");
  if (controlServer) {
    controlServer.close();
  }
  try {
    fs.rmSync(pidFile, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
});

app.on("window-all-closed", () => {
  log("window all closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("pet-window:move-by", (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !delta) return;
  const bounds = win.getBounds();
  const next = clampWindowToDisplay(win, bounds.x + Number(delta.x || 0), bounds.y + Number(delta.y || 0));
  win.setPosition(next.x, next.y, false);
});

ipcMain.handle("pet-window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle("pet-window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle("pet-window:set-chat-mode", (event, enabled) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  setWindowSize(win, enabled ? chatWindowSize : smallWindowSize);
});

ipcMain.handle("takagi-chat:has-api-key", () => Boolean(getApiKey()));

ipcMain.handle("takagi-chat:get-settings", () => getChatSettings());

ipcMain.handle("takagi-chat:save-settings", (_event, payload) => {
  const provider = normalizeProvider(payload && payload.provider);
  const normalizedKey = String((payload && payload.apiKey) || "").trim();
  const existingKey = getProviderApiKey(provider);
  if (!normalizedKey && !existingKey) {
    throw new Error(`${provider === "deepseek" ? "DeepSeek" : "OpenAI"} API key 不能为空。`);
  }

  const settings = readSettings();
  const previousProvider = normalizeProvider(settings.activeProvider);
  settings.activeProvider = provider;
  if (normalizedKey) {
    if (provider === "deepseek") {
      settings.deepseekApiKey = normalizedKey;
    } else {
      settings.openaiApiKey = normalizedKey;
    }
  }
  writeSettings(settings);
  if (previousProvider !== provider) {
    conversation = [];
    conversationProvider = provider;
  }
  return getChatSettings();
});

ipcMain.handle("takagi-chat:save-api-key", (_event, key) => {
  const normalized = String(key || "").trim();
  if (!normalized) {
    throw new Error("API key 不能为空。");
  }
  const settings = readSettings();
  const provider = getActiveProvider();
  settings.activeProvider = provider;
  if (provider === "deepseek") {
    settings.deepseekApiKey = normalized;
  } else {
    settings.openaiApiKey = normalized;
  }
  writeSettings(settings);
  return { ok: true };
});

ipcMain.handle("takagi-chat:send-message", async (_event, text) => {
  const message = String(text || "").trim();
  if (!message) {
    throw new Error("先写一句话给我吧。");
  }
  const reply = await requestTakagiReply(message);
  return { reply };
});
