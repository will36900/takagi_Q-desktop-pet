const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const DESKTOP_DRAG_SPEED = 1;

const states = {
  idle: { row: 0, frames: 1, fps: 1, loop: true },
  "running-right": { row: 1, frames: 8, fps: 10, loop: true },
  "running-left": { row: 2, frames: 8, fps: 10, loop: true },
  waving: { row: 3, frames: 4, fps: 8, loop: false },
  jumping: { row: 4, frames: 5, fps: 8, loop: false },
  failed: { row: 5, frames: 8, fps: 8, loop: false },
  waiting: { row: 6, frames: 6, fps: 6, loop: false },
  running: { row: 7, frames: 6, fps: 8, loop: false },
  review: { row: 8, frames: 6, fps: 6, loop: false },
};

const sprite = document.querySelector("#sprite");
const pet = document.querySelector("#pet");
const bubble = document.querySelector("#bubble");
const stage = document.querySelector("#stage");
const chatPanel = document.querySelector("#chatPanel");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const sendButton = document.querySelector("#sendButton");
const closeChatButton = document.querySelector("#closeChatButton");
const keyButton = document.querySelector("#keyButton");
const keyPanel = document.querySelector("#keyPanel");
const keyForm = document.querySelector("#keyForm");
const keyLabel = document.querySelector("#keyLabel");
const keyInput = document.querySelector("#keyInput");
const cancelKeyButton = document.querySelector("#cancelKeyButton");
const providerStatus = document.querySelector("#providerStatus");
const providerButtons = Array.from(document.querySelectorAll(".provider-option"));
const replyPanel = document.querySelector("#replyPanel");
const replyText = document.querySelector("#replyText");
const closeReplyButton = document.querySelector("#closeReplyButton");
const isDesktopShell = Boolean(window.desktopPet);

if (isDesktopShell) {
  document.documentElement.classList.add("desktop");
}

let currentState = "idle";
let currentFrame = 0;
let frameTimer = 0;
let lastTick = performance.now();
let stateStartedAt = performance.now();
let isDragging = false;
let pointerModeActive = false;
let mouseModeActive = false;
let touchModeActive = false;
let dragOffset = { x: 0, y: 0 };
let lastDragPoint = { x: 0, y: 0 };
let petPosition = { x: window.innerWidth / 2, y: window.innerHeight * 0.52 };
let bubbleTimer = window.setTimeout(() => {}, 0);
let clickTimer = 0;
let isChatOpen = false;
let isSending = false;
let lastReplyText = "";
let pendingMessage = "";
let selectedProvider = "openai";
let chatSettings = {
  provider: "openai",
  hasOpenAIKey: false,
  hasDeepSeekKey: false,
  hasActiveKey: false,
  model: "gpt-5.5",
};

const lines = {
  hello: [
    "呀，被你发现我在这里了。",
    "今天也来打招呼？你还挺准时的嘛。",
    "你好呀。要不要先从一点点小事开始？",
  ],
  praise: [
    "突然这么夸我，是不是有什么事想拜托我？",
    "哼哼，眼光不错嘛。",
    "再说一遍也可以哦，我会认真听的。",
  ],
  tired: [
    "累了就先慢一点，我会在这里陪着你。",
    "休息一下吧。逞强被我发现的话，可不会轻易放过你哦。",
    "今天已经很努力了，先把肩膀放松一下。",
  ],
  help: [
    "需要帮忙的话就说清楚一点，我会一起想办法。",
    "别急，一步一步来。你负责开口，我负责陪你。",
    "这不是一个人硬撑的时候，对吧？",
  ],
  work: [
    "开始工作啦？那我就在旁边盯着你。",
    "认真一点哦，我可是会检查的。",
    "把最小的一步先做完，胜负就从这里开始。",
  ],
  day: [
    "今天嘛，大概是适合偷偷努力的一天。",
    "我觉得今天还不错，因为你有来找我说话。",
    "如果今天不太顺，也可以从现在重新开始。",
  ],
  poke: [
    "喂，刚才是在戳我吧？",
    "被戳到了。那你也要被我盯三秒。",
    "这么调皮，是跟谁学的呀？",
  ],
  rest: [
    "那就休息一下。十分钟也算数。",
    "好，暂停。现在不许偷偷紧张。",
    "休息不是偷懒，是为了等下更帅气地回来。",
  ],
  drag: [
    "要带我去哪里呀？",
    "慢一点啦，我又不会跑掉。",
    "这么突然，是想让我陪你换个位置吗？",
    "嗯？被你抓到了呢。",
    "带路可以，不过别走太快哦。",
    "你这样拖着我，是不是有点开心？",
    "这里不好吗？那就听你的吧。",
    "被你带走的话，我也没办法呢。",
    "哎呀，今天这么主动？",
    "好啦好啦，我在跟着你呢。",
  ],
  thinking: [
    "我想一下哦...",
    "等我一下，我会认真想的。",
    "这个嘛，不能随便回答你呢。",
    "别急，答案快被我抓到了。",
    "你问得还挺认真，那我也认真一点。",
    "让我整理一下，不然被你看出来我在偷懒就糟了。",
    "嗯...这件事可以从这里想起。",
    "稍等一下，我正在把话说得更清楚。",
    "如果我答得好，你要夸我一下哦。",
    "我在想啦。你该不会已经等不及了吧？",
  ],
  generic: [
    "嗯嗯，我听到了。",
    "这句话有点意思嘛。",
    "继续说，我在听。",
    "你这样讲，我会想多问一句哦。",
    "那就把它变成今天的小目标吧。",
  ],
};

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setSpriteFrame(stateName, frame) {
  const state = states[stateName];
  const x = -(frame % state.frames) * CELL_WIDTH;
  const y = -state.row * CELL_HEIGHT;
  sprite.style.backgroundPosition = `${x}px ${y}px`;
}

function setState(stateName) {
  currentState = stateName;
  currentFrame = 0;
  frameTimer = 0;
  stateStartedAt = performance.now();
  setSpriteFrame(currentState, currentFrame);
}

function say(text, duration = 4200) {
  bubble.textContent = text;
  if (text && text.trim()) {
    lastReplyText = text;
    bubble.classList.add("has-reply");
  }
  bubble.classList.remove("is-hidden");
  window.clearTimeout(bubbleTimer);
  if (duration > 0) {
    bubbleTimer = window.setTimeout(() => {
      bubble.classList.add("is-hidden");
    }, duration);
  }
}

function returnToIdleSoon(delay = 900) {
  window.setTimeout(() => {
    if (!isDragging) {
      setState("idle");
    }
  }, delay);
}

function perform(stateName, line, duration = 4200) {
  setState(stateName);
  say(line, duration);
  if (!states[stateName].loop) {
    returnToIdleSoon(Math.max(900, (states[stateName].frames / states[stateName].fps) * 1000 + 240));
  }
}

function classifyMessage(message) {
  const text = message.trim().toLowerCase();
  if (!text) return { group: "generic", state: "idle" };
  if (/你好|早|晚安|hello|hi|嗨/.test(text)) return { group: "hello", state: "waving" };
  if (/可爱|漂亮|喜欢|厉害|棒|夸|cute|love/.test(text)) return { group: "praise", state: "review" };
  if (/累|困|烦|压力|难受|不想|休息/.test(text)) return { group: "tired", state: "waiting" };
  if (/帮|救|不会|怎么办|help/.test(text)) return { group: "help", state: "running" };
  if (/工作|学习|任务|写|做|deadline|ddl/.test(text)) return { group: "work", state: "running" };
  if (/今天|天气|怎么样|如何|心情/.test(text)) return { group: "day", state: "review" };
  if (/戳|点你|poke/.test(text)) return { group: "poke", state: "jumping" };
  return { group: "generic", state: "idle" };
}

function handlePetClick() {
  if (isDragging || isChatOpen) return;
  const options = [
    { state: "waving", group: "hello" },
    { state: "jumping", group: "poke" },
    { state: "review", group: "praise" },
  ];
  const action = pick(options);
  perform(action.state, pick(lines[action.group]));
}

function setChatBusy(busy) {
  isSending = busy;
  chatInput.disabled = busy;
  sendButton.disabled = busy;
  sendButton.textContent = busy ? "..." : "发送";
}

function providerName(provider = selectedProvider) {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}

function hasKeyForProvider(provider) {
  return provider === "deepseek" ? chatSettings.hasDeepSeekKey : chatSettings.hasOpenAIKey;
}

function syncProviderUI() {
  providerButtons.forEach((button) => {
    const isActive = button.dataset.provider === selectedProvider;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const name = providerName();
  keyLabel.textContent = `${name} API key`;
  keyInput.placeholder = selectedProvider === "deepseek" ? "sk-..." : "sk-...";
  providerStatus.textContent = hasKeyForProvider(selectedProvider)
    ? `当前使用 ${name}，已保存 key。留空保存可只切换当前 AI。`
    : `当前使用 ${name}，还没有保存 key。`;
}

async function refreshChatSettings() {
  if (!isDesktopShell || !window.desktopPet.getChatSettings) {
    syncProviderUI();
    return;
  }
  chatSettings = await window.desktopPet.getChatSettings();
  selectedProvider = chatSettings.provider || "openai";
  syncProviderUI();
}

async function selectProvider(provider) {
  selectedProvider = provider === "deepseek" ? "deepseek" : "openai";
  syncProviderUI();
}

async function setChatOpen(open) {
  if (isChatOpen === open) return;
  isChatOpen = open;
  document.documentElement.classList.toggle("is-chatting", open);
  chatPanel.classList.toggle("is-hidden", !open);
  replyPanel.classList.add("is-hidden");
  if (isDesktopShell && window.desktopPet.setChatMode) {
    await window.desktopPet.setChatMode(open);
  }
  window.setTimeout(() => {
    updatePetPosition(window.innerWidth / 2, window.innerHeight * (open ? 0.56 : 0.52));
    if (open) chatInput.focus();
  }, 80);
  if (open) {
    say("我在。想聊什么？", 0);
  } else {
    keyPanel.classList.add("is-hidden");
    say("那我先在旁边待机。", 2600);
  }
}

function openKeyPanel() {
  keyPanel.classList.remove("is-hidden");
  keyInput.value = "";
  refreshChatSettings();
  keyInput.focus();
}

function showReplyPanel() {
  if (!lastReplyText) return;
  replyText.textContent = lastReplyText;
  replyPanel.classList.remove("is-hidden");
}

function friendlyError(error) {
  const message = error && error.message ? error.message : String(error || "");
  if (/API key|401|Incorrect API key/i.test(message)) {
    return "钥匙好像不对。重新选择服务并设置对应的 API key 吧。";
  }
  if (/model|gpt-5\.5|deepseek|not found|does not exist/i.test(message)) {
    return "模型暂时叫不醒。可能是当前 key 还不能用这个模型。";
  }
  if (/network|fetch|ENOTFOUND|ECONN|timeout|太久/i.test(message)) {
    return "网络好像没有接上。等一下再试试？";
  }
  return `刚才没能发出去：${message}`;
}

async function submitMessage(message) {
  const text = message.trim();
  if (!text || isSending) return;

  if (!isDesktopShell || !window.desktopPet.sendMessage) {
    const action = classifyMessage(text);
    perform(action.state, pick(lines[action.group]), 8000);
    return;
  }

  try {
    const hasKey = await window.desktopPet.hasApiKey();
    if (!hasKey) {
      pendingMessage = text;
      openKeyPanel();
      say("先选择 OpenAI 或 DeepSeek，并输入对应的 API key。", 0);
      return;
    }

    setChatBusy(true);
    setState("waiting");
    say(pick(lines.thinking), 0);
    const result = await window.desktopPet.sendMessage(text);
    const reply = result && result.reply ? result.reply : "我刚才有点走神了，可以再说一次吗？";
    setState("review");
    say(reply, 0);
    returnToIdleSoon(1200);
  } catch (error) {
    setState("failed");
    say(friendlyError(error), 0);
    returnToIdleSoon(1400);
  } finally {
    setChatBusy(false);
  }
}

function updatePetPosition(x, y) {
  const stageRect = stage.getBoundingClientRect();
  const petRect = pet.getBoundingClientRect();
  const halfW = petRect.width / 2;
  const halfH = petRect.height / 2;
  const minX = stageRect.left + halfW * 0.58;
  const maxX = stageRect.right - halfW * 0.58;
  const minY = stageRect.top + halfH * 0.5;
  const maxY = stageRect.bottom - halfH * 0.36;

  petPosition = {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };

  pet.style.left = `${petPosition.x - stageRect.left}px`;
  pet.style.top = `${petPosition.y - stageRect.top}px`;
  bubble.style.left = `${petPosition.x - stageRect.left}px`;
  bubble.style.top = `${petPosition.y - stageRect.top - petRect.height * 0.64}px`;
}

function beginDragAt(clientX, clientY, screenX = clientX, screenY = clientY) {
  const rect = pet.getBoundingClientRect();
  isDragging = false;
  lastDragPoint = {
    x: isDesktopShell ? screenX : clientX,
    y: isDesktopShell ? screenY : clientY,
  };
  dragOffset = {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

function startDrag(event) {
  pointerModeActive = true;
  beginDragAt(event.clientX, event.clientY, event.screenX, event.screenY);
  pet.setPointerCapture(event.pointerId);
}

function moveDragAt(clientX, clientY, screenX = clientX, screenY = clientY) {
  if (isDesktopShell) {
    const rawDx = screenX - lastDragPoint.x;
    const rawDy = screenY - lastDragPoint.y;
    const dx = rawDx * DESKTOP_DRAG_SPEED;
    const dy = rawDy * DESKTOP_DRAG_SPEED;
    lastDragPoint = { x: screenX, y: screenY };
    const moved = Math.hypot(rawDx, rawDy) > 1;
    if (moved && !isDragging) {
      isDragging = true;
      setState(dx >= 0 ? "running-right" : "running-left");
      say(pick(lines.drag), 2200);
    }
    if (isDragging) {
      window.desktopPet.moveBy({ x: dx, y: dy });
    }
    return;
  }

  const nextX = clientX - dragOffset.x;
  const nextY = clientY - dragOffset.y;
  const moved = Math.hypot(nextX - petPosition.x, nextY - petPosition.y) > 4;
  if (moved && !isDragging) {
    isDragging = true;
    setState(nextX >= petPosition.x ? "running-right" : "running-left");
    say(pick(lines.drag), 2200);
  }
  if (isDragging) {
    updatePetPosition(nextX, nextY);
  }
}

function moveDrag(event) {
  if (!pet.hasPointerCapture(event.pointerId)) return;
  moveDragAt(event.clientX, event.clientY, event.screenX, event.screenY);
}

function finishDrag() {
  if (isDragging) {
    isDragging = false;
    setState("idle");
    say("这里的位置不错，就先待在这儿吧。");
    window.setTimeout(() => {
      isDragging = false;
    }, 0);
    return;
  }
  window.clearTimeout(clickTimer);
  clickTimer = window.setTimeout(handlePetClick, 220);
}

function endDrag(event) {
  if (pet.hasPointerCapture(event.pointerId)) {
    pet.releasePointerCapture(event.pointerId);
  }
  pointerModeActive = false;
  finishDrag();
}

function startMouseDrag(event) {
  if (pointerModeActive || event.button !== 0) return;
  mouseModeActive = true;
  beginDragAt(event.clientX, event.clientY, event.screenX, event.screenY);
}

function moveMouseDrag(event) {
  if (!mouseModeActive || pointerModeActive) return;
  moveDragAt(event.clientX, event.clientY, event.screenX, event.screenY);
}

function endMouseDrag() {
  if (!mouseModeActive || pointerModeActive) return;
  mouseModeActive = false;
  finishDrag();
}

function startTouchDrag(event) {
  if (pointerModeActive || !event.touches.length) return;
  touchModeActive = true;
  const touch = event.touches[0];
  beginDragAt(touch.clientX, touch.clientY, touch.screenX, touch.screenY);
}

function moveTouchDrag(event) {
  if (!touchModeActive || pointerModeActive || !event.touches.length) return;
  const touch = event.touches[0];
  moveDragAt(touch.clientX, touch.clientY, touch.screenX, touch.screenY);
  if (isDragging) event.preventDefault();
}

function endTouchDrag() {
  if (!touchModeActive || pointerModeActive) return;
  touchModeActive = false;
  finishDrag();
}

function tick(now) {
  const elapsed = now - lastTick;
  lastTick = now;
  const state = states[currentState];
  frameTimer += elapsed;
  const frameLength = 1000 / state.fps;

  while (frameTimer >= frameLength) {
    frameTimer -= frameLength;
    currentFrame += 1;
    if (currentFrame >= state.frames) {
      currentFrame = state.loop ? 0 : state.frames - 1;
    }
    setSpriteFrame(currentState, currentFrame);
  }

  if (!state.loop && now - stateStartedAt > (state.frames / state.fps) * 1000 + 900 && !isDragging) {
    setState("idle");
  }

  requestAnimationFrame(tick);
}

pet.addEventListener("pointerdown", startDrag);
pet.addEventListener("pointermove", moveDrag);
pet.addEventListener("pointerup", endDrag);
pet.addEventListener("pointercancel", endDrag);
pet.addEventListener("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
  window.clearTimeout(clickTimer);
  setChatOpen(!isChatOpen);
});
pet.addEventListener("mousedown", startMouseDrag);
document.addEventListener("mousemove", moveMouseDrag);
document.addEventListener("mouseup", endMouseDrag);
pet.addEventListener("touchstart", startTouchDrag, { passive: true });
document.addEventListener("touchmove", moveTouchDrag, { passive: false });
document.addEventListener("touchend", endTouchDrag);
document.addEventListener("touchcancel", endTouchDrag);

bubble.addEventListener("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
  showReplyPanel();
});

closeReplyButton.addEventListener("click", () => {
  replyPanel.classList.add("is-hidden");
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput.value;
  chatInput.value = "";
  submitMessage(message);
});

closeChatButton.addEventListener("click", () => setChatOpen(false));
keyButton.addEventListener("click", openKeyPanel);
cancelKeyButton.addEventListener("click", () => {
  keyPanel.classList.add("is-hidden");
  pendingMessage = "";
});

providerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectProvider(button.dataset.provider);
  });
});

keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isDesktopShell) return;
  const key = keyInput.value.trim();
  if (!key && !hasKeyForProvider(selectedProvider)) {
    say(`${providerName()} API key 不能为空哦。`, 0);
    return;
  }
  try {
    if (window.desktopPet.saveChatSettings) {
      chatSettings = await window.desktopPet.saveChatSettings({
        provider: selectedProvider,
        apiKey: key,
      });
      selectedProvider = chatSettings.provider || selectedProvider;
    } else {
      await window.desktopPet.saveApiKey(key);
    }
    syncProviderUI();
    keyPanel.classList.add("is-hidden");
    say(`${providerName()} 的钥匙收好了。现在可以聊天了。`, 2800);
    const message = pendingMessage;
    pendingMessage = "";
    if (message) {
      window.setTimeout(() => submitMessage(message), 250);
    }
  } catch (error) {
    say(friendlyError(error), 0);
  }
});

window.addEventListener("resize", () => {
  updatePetPosition(window.innerWidth / 2, window.innerHeight * (isChatOpen ? 0.45 : 0.52));
});

setSpriteFrame("idle", 0);
updatePetPosition(petPosition.x, petPosition.y);
refreshChatSettings();
say("今天也要让我陪你一会儿吗？", 5200);
requestAnimationFrame(tick);
